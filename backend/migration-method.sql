-- 공법(시공순서 세트) 코드 저장용 컬럼
-- repaint(외벽 재도장) / metalroof(금속지붕 방수) / shingle(아스팔트슁글 방수) / epoxy(지하주차장 에폭시)
alter table apartments add column if not exists method text;
