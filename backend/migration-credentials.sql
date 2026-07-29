-- ============================================================
-- 인증·이력(공신력) · 관리자가 인증서 이미지를 올리면 '철학' 탭에 표시 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql 을 먼저 실행한 상태에서 돌리세요.
-- ============================================================

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  image_url text,           -- 인증서 이미지 (report-photos 버킷)
  caption text,             -- 설명 (예: 오산시 경관위원회 위원 · 2022~2025)
  sort int default 0,       -- 노출 순서(작을수록 먼저)
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.credentials enable row level security;
-- 누구나(로그인 전 포함) 활성 인증 조회
drop policy if exists credentials_read on public.credentials;
create policy credentials_read on public.credentials for select to anon, authenticated using (true);
-- 관리자만 추가/수정/삭제
drop policy if exists credentials_admin on public.credentials;
create policy credentials_admin on public.credentials for all to authenticated using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 인증서 이미지는 기존 'report-photos' 버킷(공개)에 업로드됩니다. 새 버킷 만들 필요 없어요.
