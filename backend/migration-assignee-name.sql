-- ============================================================
-- 일정 담당에 '영업(POUR) 담당자 이름'도 넣을 수 있게 텍스트 칸 추가
--   assignee_id(감리사 uuid)로는 POUR 영업 담당자를 넣을 수 없어서,
--   이름을 저장할 assignee_name 칸을 추가한다.
-- Supabase → SQL Editor → 붙여넣고 Run (한 번만, 여러 번 실행해도 안전)
-- ============================================================
alter table public.schedules add column if not exists assignee_name text;
