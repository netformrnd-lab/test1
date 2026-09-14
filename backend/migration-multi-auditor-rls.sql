-- 다중 감리사(apartment_auditors 조인)로 배정된 단지도
-- 감리일지·현장현황·일정을 읽고/쓸 수 있게 RLS 보정.
-- (기존엔 대표 감리사 apartments.auditor_id 만 인정 → 조인 감리사는 막힘)

-- ===== 감리일지(reports) =====
drop policy if exists "reports_read_auditor" on public.reports;
create policy "reports_read_auditor" on public.reports for select using (
  apartment_id in (select id from public.apartments where auditor_id = auth.uid())
  or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
);

drop policy if exists "reports_write_auditor" on public.reports;
create policy "reports_write_auditor" on public.reports for insert to authenticated with check (
  apartment_id in (select id from public.apartments where auditor_id = auth.uid())
  or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
);

-- ===== 현장현황(field_updates) =====
drop policy if exists "field_read_auditor" on public.field_updates;
create policy "field_read_auditor" on public.field_updates for select using (
  apartment_id in (select id from public.apartments where auditor_id = auth.uid())
  or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
);

-- ===== 일정(schedules) 읽기: 입주민(내 단지) + 감리사(대표/조인) + 개인 =====
drop policy if exists "schedules_read_apartment" on public.schedules;
create policy "schedules_read_apartment" on public.schedules for select using (
  apartment_id in (select apartment_id from public.profiles where id = auth.uid())
  or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
  or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
);

-- ===== 일정(schedules) 쓰기: 관리자 또는 감리사 =====
drop policy if exists "schedules_write_auditor" on public.schedules;
create policy "schedules_write_auditor" on public.schedules for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'auditor')
);

-- 감리사가 자기 개인 일정을 수정/삭제할 수 있게 (owner_id = 본인)
drop policy if exists "schedules_owner_update" on public.schedules;
create policy "schedules_owner_update" on public.schedules for update to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "schedules_owner_delete" on public.schedules;
create policy "schedules_owner_delete" on public.schedules for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());
