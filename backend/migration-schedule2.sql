-- 개인 일정용 소유자 칸
alter table schedules add column if not exists owner_id uuid references profiles(id);

-- 기존의 넓은 읽기 정책 제거 (누구나 모든 일정을 보던 것)
drop policy if exists "schedules_read_approved" on schedules;

-- 개인 일정: 소유자만 볼 수 있음
drop policy if exists "schedules_read_owner" on schedules;
create policy "schedules_read_owner" on schedules for select
  using (owner_id = auth.uid());

-- 단지 일정: 그 단지 소속 입주민 + 담당 감리사만 볼 수 있음
drop policy if exists "schedules_read_apartment" on schedules;
create policy "schedules_read_apartment" on schedules for select using (
  apartment_id is not null and (
    apartment_id = (select apartment_id from profiles where id = auth.uid())
    or apartment_id in (select id from apartments where auditor_id = auth.uid())
  )
);

-- 감리사만 일정 추가 가능 (개인/단지 둘 다)
drop policy if exists "schedules_write_auditor" on schedules;
create policy "schedules_write_auditor" on schedules for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));
