-- ============================================================
-- 모바일 명함(business_cards) — 관리자가 명함 사진 업로드 → 감리사 앱에서 검색·공유
-- Supabase → SQL Editor → 붙여넣고 Run  (재실행 안전)
-- ※ migration-SETUP-ALL.sql / migration-leaflets.sql 을 먼저 실행한 상태에서 돌리세요.
-- 명함 이미지는 기존 'report-photos' 버킷(공개)에 업로드됩니다. 새 버킷 만들 필요 없어요.
-- ============================================================

create table if not exists public.business_cards (
  id uuid primary key default gen_random_uuid(),
  name text,                -- 명함 주인 이름(검색용)
  image_url text,           -- 명함 이미지 (report-photos 버킷)
  caption text,             -- 설명(선택: 직함/부서 등)
  sort int default 0,       -- 노출 순서(작을수록 먼저)
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.business_cards enable row level security;

-- 로그인한 사용자(감리사 등)는 활성 명함 조회 가능
drop policy if exists business_cards_read on public.business_cards;
create policy business_cards_read on public.business_cards for select to anon, authenticated using (true);

-- 관리자만 추가/수정/삭제
drop policy if exists business_cards_admin on public.business_cards;
create policy business_cards_admin on public.business_cards for all to authenticated using (is_admin()) with check (is_admin());

-- 이름 검색 빠르게(선택)
create index if not exists business_cards_name_idx on public.business_cards (name);

-- 완료! 'Success. No rows returned' 이면 정상입니다.
