-- ============================================================
-- 방문마다 '담당 감리사' 지정 (주2회 = 서로 다른 감리사 2명이 다른 날)
--   + 감리사가 동료 감리사 '명단(이름)'을 읽을 수 있게 (배정 선택용)
-- Supabase → SQL Editor → 붙여넣고 Run  (재실행 안전)
-- ============================================================

-- 1) 방문(일정)에 담당 감리사 칸 --------------------------------
alter table public.schedules add column if not exists assignee_id uuid references public.profiles(id);
create index if not exists schedules_assignee_idx on public.schedules(assignee_id);

-- 2) '나는 감리사인가' 헬퍼 (RLS 재귀 방지용 SECURITY DEFINER) ----
create or replace function public.is_auditor()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'auditor' and approved);
$$;

-- 3) 감리사끼리 명단(이름) 읽기 — 배정 드롭다운용 ----------------
--    승인된 '감리사/관리자'의 이름을, 로그인한 감리사가 읽을 수 있게(스태프 명단)
drop policy if exists profiles_read_auditor_roster on public.profiles;
create policy profiles_read_auditor_roster on public.profiles for select
  using (approved and role in ('auditor', 'admin') and public.is_auditor());

-- 4) 감리사 일정 읽기 재정의: 담당 단지 전부 + 내가 배정된 방문 ----
--    (기존 대표 auditor_id 만 보던 것 → 다중감리사 조인 + assignee 까지)
drop policy if exists "schedules_read_auditor_apt" on public.schedules;
create policy "schedules_read_auditor_apt" on public.schedules for select using (
  assignee_id = auth.uid()
  or (apartment_id is not null and (
        apartment_id in (select id from public.apartments where auditor_id = auth.uid())
     or apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  ))
);

-- 참고: 입주민(schedules_read_resident) · 개인(schedules_read_owner) ·
--       관리자(schedules_admin_all) 정책은 그대로 유지됩니다.
--       입주민에겐 여전히 resident_visible=true 인 것만 보입니다(담당 감리사 정보 무관).
