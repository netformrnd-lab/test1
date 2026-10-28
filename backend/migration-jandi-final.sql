-- ============================================================
-- 잔디(Jandi) 알림 — 최종본 (사진 표시 + 일괄PDF 제외 둘 다 포함)
--   · 감리일지 등록 시: 본문 전체 + '📷 현장 사진 N장 · 모아보기 링크' 를 잔디로 보냄
--   · 단, PDF만 올리고 점검내용이 없는 '일괄 PDF 등록'은 잔디로 보내지 않음(도배 방지)
--   · 이 함수 하나가 migration-jandi-report-photos.sql 과 migration-jandi-skip-bulk.sql 를
--     합친 것이라, 이것만 실행하면 둘 사이 충돌이 사라짐.
-- 전제: migration-jandi-report.sql 로 웹훅 주소(app_integrations)가 설정돼 있어야 함.
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
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
  -- ★ PDF만 있고 점검내용이 비어 있으면(=일괄 PDF 등록) 잔디 알림을 보내지 않음
  if new.pdf_url is not null and (new.content is null or btrim(new.content) = '') then
    return new;
  end if;

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

  -- 현장 사진: 잔디엔 '모아보기 링크' 한 줄(파일명만 담아 짧고 안전, 갤러리 페이지가 원본 로드)
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

drop trigger if exists trg_notify_jandi_on_report on public.reports;
create trigger trg_notify_jandi_on_report
after insert on public.reports
for each row execute function public.notify_jandi_on_report();
