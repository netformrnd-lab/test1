-- ============================================================
-- /console 방문 배치 캘린더 · 현장 운영 카드 (control_sites) — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql (is_admin() 포함) 을 먼저 실행한 상태에서 돌리세요.
-- 관리자 전용 데이터입니다.
-- ============================================================

-- 현장별 운영 카드: 방문 배치(고정 담당자·주기·요일·이번주 대타) 등을 data(jsonb)에 저장
create table if not exists public.control_sites (
  slug text primary key,          -- 현장명 기반 슬러그 (siteSlug)
  name text,                      -- 현장(단지)명
  data jsonb,                     -- { mgr, cycle, visitDay, subs:{weekKey:mgr}, ... }
  updated_at timestamptz default now()
);
alter table public.control_sites enable row level security;
drop policy if exists control_sites_admin on public.control_sites;
create policy control_sites_admin on public.control_sites
  for all to authenticated using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
