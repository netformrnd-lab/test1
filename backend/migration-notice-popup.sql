-- 공지 팝업: 관리자가 '팝업' 지정한 공지를 입주민 앱 열 때 모달로 띄움
--  · notices.popup = true 인 공지가 (해당 단지 또는 전체) 있으면 앱 진입 시 1회 팝업
--  · 사용자가 '다시 안 보기' 누르면 그 공지는 그 기기에서 다시 안 뜸(localStorage)
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
alter table public.notices add column if not exists popup boolean not null default false;
