-- ============================================================
-- 감리일지(reports) 전부 '비공개'로 전환
-- Supabase → SQL Editor → 붙여넣고 Run  (감리일지만 대상, 다른 건 안 건드림)
-- ============================================================

-- 1) 지금 공개(published=true)로 되어 있는 감리일지를 전부 비공개로 내림
update public.reports
set published = false
where published is distinct from false;

-- 확인용: 아직 공개로 남은 감리일지 개수 (0 이어야 정상)
-- select count(*) from public.reports where published = true;

-- 참고: 새로 작성되는 감리일지는 published 기본값이 false 라 '비공개'로 생성됩니다.
-- (관리자 대시보드에서 각 감리일지의 '공개' 토글을 눌러야만 입주민에게 공개됩니다.)
