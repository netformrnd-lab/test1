-- ============================================================
-- 감리일지(reports) 저장 시 → 잔디(Jandi)로 자동 알림
--   방식: Supabase DB 트리거 + pg_net (앱 수정 불필요, 서버측 발송)
--   잔디 웹훅 주소는 코드에 박지 않고 app_integrations 표에서 읽음(비밀 보호)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ============================================================

-- 0) DB에서 외부로 HTTP 요청 보내는 확장 (Supabase 제공)
create extension if not exists pg_net;

-- 1) 연동 설정 보관 표 (클라이언트 접근 전면 차단 = 비밀 안전) ----
create table if not exists public.app_integrations (
  key   text primary key,
  value text
);
alter table public.app_integrations enable row level security;
-- 정책을 두지 않음 → anon/auth 클라이언트는 읽기·쓰기 모두 불가.
-- (아래 트리거 함수는 SECURITY DEFINER 라 RLS 우회해서 읽음. service_role도 가능)

-- ‼️ 잔디 웹훅 '주소'는 여기(깃)에 넣지 않습니다.
--    아래 INSERT 는 실제 주소를 넣어 '한 번만' 직접 실행하세요(대화로 따로 안내):
--    insert into public.app_integrations(key, value)
--    values ('jandi_report_webhook', 'https://wh.jandi.com/connect-api/webhook/...')
--    on conflict (key) do update set value = excluded.value;

-- 2) 트리거 함수: 감리일지 1건 저장 → 잔디 메시지 조립 후 발송 --------
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

-- 3) reports INSERT 시마다 트리거 실행 ----------------------------
drop trigger if exists trg_notify_jandi_on_report on public.reports;
create trigger trg_notify_jandi_on_report
after insert on public.reports
for each row execute function public.notify_jandi_on_report();

-- 끄고 싶을 때:  drop trigger trg_notify_jandi_on_report on public.reports;
-- 주소 바꿀 때:  위 app_integrations INSERT 를 다시 실행(on conflict update)
