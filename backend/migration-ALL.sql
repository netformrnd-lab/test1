-- ============================================================
-- 아파트스퀘어 — 한 번에 실행하는 통합 마이그레이션
-- Supabase → SQL Editor → New query → 아래 전체 붙여넣기 → Run
-- (이미 만든 항목은 자동으로 건너뛰므로, 여러 번 실행해도 안전합니다)
-- ============================================================

-- 1) 현장 현황 동(棟)별 컬럼 + 계약서 --------------------------------
alter table field_updates add column if not exists dong text;

create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  name          text,
  file_url      text,
  kind          text,
  created_at    timestamptz default now()
);
alter table contracts enable row level security;
drop policy if exists contracts_admin_all on contracts;
create policy contracts_admin_all on contracts
  for all using (is_admin()) with check (is_admin());
drop policy if exists contracts_staff_read on contracts;
create policy contracts_staff_read on contracts
  for select to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('auditor','admin')));
drop policy if exists contracts_auditor_write on contracts;
create policy contracts_auditor_write on contracts
  for all to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor')
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));

-- 2) 인앱 채팅 --------------------------------------------------------
create table if not exists chat_messages (
  id            uuid primary key default gen_random_uuid(),
  thread        text not null,
  apartment_id  uuid references apartments(id) on delete set null,
  sender_role   text not null,
  sender_name   text,
  body          text not null,
  created_at    timestamptz default now()
);
create index if not exists chat_messages_thread_idx on chat_messages (thread, created_at);
alter table chat_messages enable row level security;
-- 전송: 로그인한 '우리 단지' 사용자만, 자기 단지 스레드에만 (스팸·사칭 차단)
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages
  for insert to authenticated with check (
    apartment_id is not null and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );
drop policy if exists chat_admin_all on chat_messages;
create policy chat_admin_all on chat_messages
  for all using (is_admin()) with check (is_admin());
drop policy if exists chat_apt_read on chat_messages;
create policy chat_apt_read on chat_messages
  for select to authenticated using (
    apartment_id is not null and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );
-- (게스트 비로그인 열람 정책은 보안상 두지 않음)
drop policy if exists chat_guest_read on chat_messages;

-- 3) 소장님 작성지 ----------------------------------------------------
create table if not exists manager_forms (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete set null,
  apt_name      text, writer_name text, phone text, households text,
  built_year    text, issue text, request text, wish_when text,
  created_at    timestamptz default now()
);
alter table manager_forms enable row level security;
drop policy if exists manager_forms_insert_public on manager_forms;
create policy manager_forms_insert_public on manager_forms
  for insert to anon, authenticated with check (true);
drop policy if exists manager_forms_admin_all on manager_forms;
create policy manager_forms_admin_all on manager_forms
  for all using (is_admin()) with check (is_admin());
drop policy if exists manager_forms_staff_read on manager_forms;
create policy manager_forms_staff_read on manager_forms
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('auditor','admin')));

-- 4) 타 감리 감독 현황(익명 피드) ------------------------------------
create or replace function public.region_activity()
returns table(region text, construction_type text, status text)
language sql security definer set search_path = public stable
as $$
  select split_part(coalesce(a.region, ''), ' ', 1) as region,
         a.construction_type, a.status
  from apartments a order by a.created_at desc limit 8
$$;
grant execute on function public.region_activity() to anon, authenticated;

-- 5) 만족도 조사 ------------------------------------------------------
create table if not exists surveys (
  id             uuid primary key default gen_random_uuid(),
  apartment_id   uuid references apartments(id) on delete cascade,
  respondent_id  uuid references profiles(id) on delete set null,
  respondent_role text,
  overall int, r_comm int, r_site int, r_defect int, r_quality int,
  best text, again text, comment text,
  created_at timestamptz default now(),
  unique (apartment_id, respondent_id)
);
alter table surveys enable row level security;
drop policy if exists surveys_admin_all on surveys;
create policy surveys_admin_all on surveys
  for all using (is_admin()) with check (is_admin());
drop policy if exists surveys_insert_self on surveys;
create policy surveys_insert_self on surveys
  for insert to authenticated with check (respondent_id = auth.uid());
drop policy if exists surveys_update_self on surveys;
create policy surveys_update_self on surveys
  for update to authenticated using (respondent_id = auth.uid()) with check (respondent_id = auth.uid());
drop policy if exists surveys_read_self on surveys;
create policy surveys_read_self on surveys
  for select to authenticated using (respondent_id = auth.uid());
drop policy if exists surveys_auditor_read on surveys;
create policy surveys_auditor_read on surveys
  for select to authenticated using (
    exists (select 1 from apartments a where a.id = surveys.apartment_id and a.auditor_id = auth.uid()));

-- 6) 채팅 '읽음' 계정 저장 -------------------------------------------
alter table profiles add column if not exists chat_reads jsonb default '{}'::jsonb;
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 7) 감리일지 '작업한 동' → 동별 작업 현황 자동 분류 ------------------
alter table reports add column if not exists dongs text;

-- 8) 감리일지 입주민 공개용 PDF(관리자가 문서화해서 올림) ---------------
alter table reports add column if not exists pdf_url text;
alter table reports add column if not exists pdf_name text;

-- 9) 동(棟)별 공정 진행 상태 (관리자 설정) ----------------------------
create table if not exists dong_progress (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  dong          text not null,
  stage         int default 0,
  updated_at    timestamptz default now(),
  unique (apartment_id, dong)
);
alter table dong_progress add column if not exists hidden boolean default false;
alter table dong_progress enable row level security;
drop policy if exists dong_progress_read on dong_progress;
create policy dong_progress_read on dong_progress
  for select to anon, authenticated using (true);
drop policy if exists dong_progress_admin on dong_progress;
create policy dong_progress_admin on dong_progress
  for all using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이 뜨면 정상입니다.
