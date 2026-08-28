-- ============================================================
-- 영업 파이프라인 · 딜별 '진행 체크리스트' 저장용 컬럼 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- checklist(jsonb): { "첫 연락 완료": true, "현장 방문·실측": true, ... } 형태로 체크 항목만 저장
-- ============================================================

alter table public.sales_leads add column if not exists checklist jsonb default '{}'::jsonb;

-- 완료! 'Success. No rows returned' 이면 정상입니다.
