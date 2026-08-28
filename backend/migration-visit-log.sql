-- ============================================================
-- 실제 방문 기록(언제 다녀왔는지)을 예정과 분리 저장 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
-- done_at: 비어있음 = 예정 방문, 값 있음 = 실제로 다녀온 방문(그 시각)
-- ※ 방문 재생성은 '오늘 이후 · 아직 안 다녀온' 예정만 갈아끼우고,
--    과거 방문과 '다녀옴' 표시된 방문은 절대 지우지 않습니다.
-- ============================================================

alter table public.schedules add column if not exists done_at timestamptz;

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- (수정/삭제 권한은 migration-auditor-schedule-edit.sql 에서 이미 부여됨 —
--  감리사가 담당 단지 일정을 update 할 수 있으므로 done_at 체크도 가능합니다.)
