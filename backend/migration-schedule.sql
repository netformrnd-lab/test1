-- 감리사가 공사 일정을 추가할 수 있게 (INSERT 권한)
drop policy if exists "schedules_write_auditor" on schedules;
create policy "schedules_write_auditor" on schedules for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));
