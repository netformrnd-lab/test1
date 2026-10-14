-- 담당 배정 요청(assign_requests) → 앱 푸시(FCM) 연결
-- 방식: Supabase DB 트리거 + pg_net 로 /push(Cloudflare 함수) 직접 호출
--       (잔디 알림 migration-jandi-report.sql 과 동일한 패턴)
--
-- ⚠️ 먼저 push 주소+비밀번호를 app_integrations 에 한 번만 넣어두세요(코드/깃엔 안 남게):
--   insert into public.app_integrations (key, value)
--     values ('push_webhook_url', 'https://(실제주소)/push?secret=(PUSH_WEBHOOK_SECRET)')
--   on conflict (key) do update set value = excluded.value;
--
-- 이 값이 비어 있으면 트리거는 조용히 아무것도 안 함(= 기능은 그대로, 푸시만 안 감).

create extension if not exists pg_net;

create or replace function public.push_assign_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hook text;
begin
  select value into hook from public.app_integrations where key = 'push_webhook_url';
  if hook is null or length(hook) = 0 then
    return new;   -- 주소 미설정 → 푸시 생략(안전)
  end if;

  perform net.http_post(
    url     := hook,
    headers := '{"content-type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'table',  'assign_requests',
      'type',   'INSERT',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_assign_request on public.assign_requests;
create trigger trg_push_assign_request
  after insert on public.assign_requests
  for each row execute function public.push_assign_request();
