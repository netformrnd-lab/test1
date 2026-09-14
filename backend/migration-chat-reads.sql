-- 채팅 '읽음' 상태를 계정에 저장 (기기·재로그인 사이에도 유지)
-- profiles.chat_reads = { "apt:<id>": "2026-07-27T09:00:00Z", ... }
alter table profiles add column if not exists chat_reads jsonb default '{}'::jsonb;

-- 본인 profiles 업데이트 정책이 없다면 추가 (이미 있으면 무시됨)
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
