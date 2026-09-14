-- ============================================================
-- 감리사가 '담당 단지' 일정도 수정/삭제 (방문 날짜 조정 등) — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-multi-auditor-rls.sql 을 먼저 실행한 상태에서 돌리세요.
-- 기존: 감리사는 자기 '개인 일정'(owner_id=본인)만 수정/삭제 가능
-- 추가: 감리사는 자기가 배정된 '단지 일정'(apartment_id)도 수정/삭제 가능
--       → 앱에서 정기 방문 날짜를 직접 옮기거나 지울 수 있게 됩니다.
-- ============================================================

drop policy if exists "schedules_auditor_update_apt" on public.schedules;
create policy "schedules_auditor_update_apt" on public.schedules for update to authenticated
  using (
    owner_id = auth.uid() or public.is_admin()
    or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
    or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  ) with check (
    owner_id = auth.uid() or public.is_admin()
    or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
    or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  );

drop policy if exists "schedules_auditor_delete_apt" on public.schedules;
create policy "schedules_auditor_delete_apt" on public.schedules for delete to authenticated
  using (
    owner_id = auth.uid() or public.is_admin()
    or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
    or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  );

-- 완료! 'Success. No rows returned' 이면 정상입니다.
