-- ============================================================
-- 감리일지 → 잔디(Jandi) 알림: 본문 '내용 전체' + '현장 사진 보기 링크' 1개(깔끔)
--   · 본문은 최대 40000자(이전 200자 잘림 해결)
--   · 사진은 '📷 현장 사진 N장 · 모아보기 → <갤러리 링크>' 한 줄
--       링크를 누르면 사진 20장이 그리드로 보이는 페이지(app/photos, 로그인 불필요).
--   · 갤러리 주소를 바꾸려면(선택, 기본=gamri-app.vercel.app/photos/):
--       insert into public.app_integrations(key, value)
--       values ('report_gallery_base', 'https://내앱주소/photos/')
--       on conflict (key) do update set value = excluded.value;
--   · reports.photos(jsonb 배열, 공개 버킷 URL)를 잔디 connectInfo.imageUrl 로 첨부
--   · 앱 수정 불필요(사진은 이미 저장 시 리포트에 들어있음). 이 SQL만 실행하면 됨.
--   · 기존 트리거/함수 이름 그대로 교체(재실행 안전).
-- 전제: migration-jandi-report.sql 을 먼저 실행해 웹훅 주소(app_integrations)가 설정돼 있어야 함.
-- Supabase → SQL Editor → 붙여넣고 Run
-- ============================================================

create or replace function public.notify_jandi_on_report()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  hook        text;
  apt_name    text;
  author_name text;
  when_kst    text;
  info        jsonb;
  gallery     text;
  files       text;
  total       int;
begin
  select value into hook from public.app_integrations where key = 'jandi_report_webhook';
  if hook is null or hook = '' then
    return new;  -- 주소 미설정이면 조용히 통과
  end if;

  select name into apt_name    from public.apartments where id = new.apartment_id;
  select name into author_name from public.profiles   where id = new.author_id;
  when_kst := to_char(coalesce(new.created_at, now()) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI');
  total := coalesce(jsonb_array_length(new.photos), 0);

  info := jsonb_build_array(
    jsonb_build_object('title', '단지',   'description', coalesce(apt_name, '-')),
    jsonb_build_object('title', '감리사', 'description', coalesce(author_name, '-')),
    jsonb_build_object('title', '일시',   'description', when_kst),
    jsonb_build_object('title', '단계',   'description', coalesce(new.stage, '-')),
    jsonb_build_object('title', '동',     'description', coalesce(new.dongs, '-')),
    jsonb_build_object('title', '제목',   'description', coalesce(new.title, '-')),
    jsonb_build_object('title', '내용',   'description', left(coalesce(new.content, '-'), 40000))
  );

  -- 현장 사진: 잔디엔 '모아보기 링크' 한 줄만(이미지 임베드 안 함).
  --   링크를 누르면 갤러리 페이지가 사진 20장을 그리드로 보여줌(로그인 불필요).
  --   링크에는 파일명만 담고(짧고 안전), 갤러리 페이지가 공개 버킷에서 원본을 불러옴.
  if total > 0 then
    select string_agg(regexp_replace(fn.value, '^.*/', ''), ',' order by fn.ord)
      into files
      from jsonb_array_elements_text(new.photos) with ordinality as fn(value, ord);
    gallery := coalesce(nullif((select value from public.app_integrations where key = 'report_gallery_base'), ''),
                        'https://floral-cherry-6860.squarecm.workers.dev/photos/');
    info := info || jsonb_build_array(jsonb_build_object(
      'title',       '📷 현장 사진',
      'description', total || '장 · 모아보기 → ' || gallery || '?f=' || coalesce(files, '')
    ));
  end if;

  perform net.http_post(
    url := hook,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept',       'application/vnd.tosslab.jandi-v2+json'
    ),
    body := jsonb_build_object(
      'body',         '📋 감리일지 등록 · ' || coalesce(apt_name, '현장'),
      'connectColor', '#2F6BF6',
      'connectInfo',  info
    )
  );
  return new;
exception when others then
  return new;  -- 알림이 실패해도 감리일지 저장은 절대 방해하지 않음
end
$$;

-- 트리거가 없으면 함께 생성(있으면 그대로 이 함수를 계속 호출)
drop trigger if exists trg_notify_jandi_on_report on public.reports;
create trigger trg_notify_jandi_on_report
after insert on public.reports
for each row execute function public.notify_jandi_on_report();

-- 완료! 이제 감리일지를 새로 등록하면 잔디 메시지에 현장 사진이 함께 표시됩니다.
