-- ============================================================
-- 관리자가 대시보드에서 넣은 '회사 일정'(단지 지정 안 함)도 감리사 앱에 보이게.
--   기존엔 감리사는 '담당 단지 일정'/'내 개인 일정'/'담당 지정된 일정'만 볼 수 있어,
--   apartment_id 없이 넣은 일정은 관리자만 보였음.
--   → 개인 일정(owner_id 있음)이 아닌 '회사 일정'은 승인된 감리사·관리자가 모두 열람.
-- Supabase → SQL Editor → 붙여넣고 Run (여러 번 실행해도 안전)
-- ============================================================
drop policy if exists "schedules_read_staff_company" on public.schedules;
create policy "schedules_read_staff_company" on public.schedules for select to authenticated using (
  owner_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('auditor','admin') and p.approved
  )
);

-- 참고:
--  · 개인 일정(owner_id 가 있는 것)은 계속 본인에게만 보입니다.
--  · 입주민에겐 이 정책이 적용되지 않아(감리사·관리자만), 회사 일정은 여전히 비공개입니다.
