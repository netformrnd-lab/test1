-- 회원 가입 시 본인이 적은 아파트(단지)명 — 관리자가 승인·배정할 때 참고용
--  · 실제 담당 단지(apartment_id)는 관리자가 확인 후 배정. 이 값은 '신청자가 적은 단지명' 텍스트.
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
alter table public.profiles add column if not exists signup_apt text;
