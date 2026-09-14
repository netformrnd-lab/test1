-- 감리일지에 '작업한 동' 저장 → 동별 작업 현황 자동 분류
-- 예: dongs = '101동, 102동, 105동'
alter table reports add column if not exists dongs text;
