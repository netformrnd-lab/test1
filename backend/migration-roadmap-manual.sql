-- ============================================================
-- 업무 로드맵(담당자 매뉴얼) 편집 내용 저장 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- data(jsonb): [ {icon,name,work:[],docs:[],notes:[]}, ... ] 단계 배열 전체를 통째로 저장
-- 관리자 전용(콘솔에서만 편집).
-- ============================================================

create table if not exists public.roadmap_manual (
  id text primary key default 'main',
  data jsonb,
  updated_at timestamptz default now()
);
alter table public.roadmap_manual enable row level security;
drop policy if exists roadmap_manual_admin on public.roadmap_manual;
create policy roadmap_manual_admin on public.roadmap_manual
  for all to authenticated using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
