-- ============================================================
-- 감리사 앱에서도 '방문 배치(주기·요일)'를 보고 설정할 수 있게 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-control-sites.sql 을 먼저 실행한 상태에서 돌리세요.
-- control_sites 에 apartment_id 를 두고, 감리사가 '자기 담당 단지' 배치만 읽고/쓰게 합니다.
-- ============================================================

-- 어느 단지의 배치인지 연결 (RLS 판단용)
alter table public.control_sites add column if not exists apartment_id uuid references public.apartments(id) on delete cascade;

-- 감리사: 자기 담당 단지(대표 auditor_id 또는 apartment_auditors)의 배치를 읽기/쓰기
drop policy if exists control_sites_auditor on public.control_sites;
create policy control_sites_auditor on public.control_sites for all to authenticated
  using (
    public.is_admin()
    or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
    or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  ) with check (
    public.is_admin()
    or apartment_id in (select id from public.apartments where auditor_id = auth.uid())
    or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  );

-- 완료! 'Success. No rows returned' 이면 정상입니다.
