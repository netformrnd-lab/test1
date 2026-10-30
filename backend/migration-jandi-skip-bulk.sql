-- ============================================================
-- 잔디 알림 트리거 보완: PDF만 올린(점검내용 없는) 감리일지는 잔디로 알리지 않음
--   → PDF 일괄 올리기로 여러 건을 등록해도 잔디 채팅이 도배되지 않음
--   → 감리원이 '점검 내용'을 써서 올린 진짜 감리일지는 기존대로 잔디 알림 발송
-- Supabase → SQL Editor 에 붙여넣고 Run (migration-jandi-report.sql 실행 이후)
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

  perform net.http_post(
    url := hook,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept',       'application/vnd.tosslab.jandi-v2+json'
    ),
    body := jsonb_build_object(
      'body',         '📋 감리일지 등록 · ' || coalesce(apt_name, '현장'),
      'connectColor', '#2F6BF6',
      'connectInfo',  jsonb_build_array(
        jsonb_build_object('title', '단지',   'description', coalesce(apt_name, '-')),
        jsonb_build_object('title', '감리사', 'description', coalesce(author_name, '-')),
        jsonb_build_object('title', '일시',   'description', when_kst),
        jsonb_build_object('title', '단계',   'description', coalesce(new.stage, '-')),
        jsonb_build_object('title', '동',     'description', coalesce(new.dongs, '-')),
        jsonb_build_object('title', '제목',   'description', coalesce(new.title, '-')),
        jsonb_build_object('title', '요약',   'description', left(coalesce(new.content, '-'), 200))
      )
    )
  );
  return new;
exception when others then
  return new;  -- 알림이 실패해도 감리일지 저장은 절대 방해하지 않음
end
$$;
-- 트리거(trg_notify_jandi_on_report)는 그대로 두면 됩니다 — 함수만 교체.
