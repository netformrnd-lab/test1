-- ============================================================
-- 홈 배너(자동 슬라이드) + 팝업 · 관리자 대시보드에서 관리 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql 을 먼저 실행한 상태에서 돌리세요.
-- ============================================================

-- 홈 배너: 이미지 배너 또는 글자+색상 배너
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  image_url text,           -- 이미지 배너일 때
  title text,               -- 글자 배너 제목
  subtitle text,            -- 글자 배너 부제목
  bg text default '#2F6BF6',-- 글자 배너 배경색
  link text,                -- 탭하면 이동(화면 id 예: s05, 또는 https 링크)
  sort int default 0,       -- 노출 순서(작을수록 먼저)
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.banners enable row level security;
-- 누구나(로그인 전 포함) 활성 배너 조회
drop policy if exists banners_read on public.banners;
create policy banners_read on public.banners for select to anon, authenticated using (true);
-- 관리자만 추가/수정/삭제
drop policy if exists banners_admin on public.banners;
create policy banners_admin on public.banners for all to authenticated using (is_admin()) with check (is_admin());

-- 홈 팝업: 앱 열 때 표시(활성 1건). '오늘 하루 보지 않기'는 기기에 저장.
create table if not exists public.popups (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.popups enable row level security;
drop policy if exists popups_read on public.popups;
create policy popups_read on public.popups for select to anon, authenticated using (true);
drop policy if exists popups_admin on public.popups;
create policy popups_admin on public.popups for all to authenticated using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 배너/팝업 이미지는 기존 'report-photos' 버킷(공개)에 업로드됩니다. 새 버킷 만들 필요 없어요.
