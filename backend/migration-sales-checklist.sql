-- ============================================================
-- 영업 파이프라인 · 딜별 '진행 체크리스트' + '특이사항' 저장용 컬럼 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
--  checklist(jsonb): [ {"t":"문의 접수 및 요구사항 파악","done":true,"at":"2026-08-28"}, ... ]  (항목 추가·삭제 가능)
--  notes(jsonb):     [ {"text":"야간작업 불가","kind":"⚠️ 주의","at":"2026-08-28"}, ... ]
-- ============================================================

alter table public.sales_leads add column if not exists checklist jsonb default '[]'::jsonb;
alter table public.sales_leads add column if not exists notes jsonb default '[]'::jsonb;

-- 완료! 'Success. No rows returned' 이면 정상입니다.
