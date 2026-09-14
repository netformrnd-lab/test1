-- 동별 진행: 자동 감지된 동을 '숨김(제외)'할 수 있도록 컬럼 추가
-- (× 로 뺀 동이 감리일지 제목에서 다시 잡혀 되살아나던 문제 해결)
-- Supabase → SQL Editor → 붙여넣고 Run (여러 번 실행해도 안전)
alter table dong_progress add column if not exists hidden boolean default false;
