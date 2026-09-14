-- 인앱 채팅 (입주민 ↔ 감리사, 손님 ↔ 관리자)
create table if not exists chat_messages (
  id            uuid primary key default gen_random_uuid(),
  thread        text not null,                 -- 'apt:<apartment_id>' 또는 'guest:<uuid>'
  apartment_id  uuid references apartments(id) on delete set null,
  sender_role   text not null,                 -- guest|resident|manager|auditor|admin
  sender_name   text,
  body          text not null,
  created_at    timestamptz default now()
);
create index if not exists chat_messages_thread_idx on chat_messages (thread, created_at);

alter table chat_messages enable row level security;

-- 누구나(손님 포함) 메시지 전송 가능
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages
  for insert to anon, authenticated with check (true);

-- 관리자: 전체 권한
drop policy if exists chat_admin_all on chat_messages;
create policy chat_admin_all on chat_messages
  for all using (is_admin()) with check (is_admin());

-- 로그인 사용자: 자기 단지 스레드 열람 (입주민=배정 단지, 감리사=담당 단지)
drop policy if exists chat_apt_read on chat_messages;
create policy chat_apt_read on chat_messages
  for select to authenticated using (
    apartment_id is not null and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );

-- 손님 스레드: 비로그인 열람 (추측 불가한 uuid 기반) — 관리자와의 상담용
drop policy if exists chat_guest_read on chat_messages;
create policy chat_guest_read on chat_messages
  for select to anon using (thread like 'guest:%');
