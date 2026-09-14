-- ============================================================
-- 리플렛(leaflets) + 감리사 단지 추가 권한 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql 을 먼저 실행한 상태에서 돌리세요.
-- ============================================================

-- 1) 리플렛 테이블 --------------------------------------------
create table if not exists public.leaflets (
  id uuid primary key default gen_random_uuid(),
  image_url text,           -- 리플렛 이미지 (report-photos 버킷)
  caption text,             -- 설명(선택)
  sort int default 0,       -- 노출 순서(작을수록 먼저)
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.leaflets enable row level security;
-- 로그인한 사용자(감리사·입주민 등)는 활성 리플렛 조회 가능
drop policy if exists leaflets_read on public.leaflets;
create policy leaflets_read on public.leaflets for select to anon, authenticated using (true);
-- 관리자만 추가/수정/삭제
drop policy if exists leaflets_admin on public.leaflets;
create policy leaflets_admin on public.leaflets for all to authenticated using (is_admin()) with check (is_admin());

-- 2) 감리사가 단지를 직접 추가할 수 있는 권한 -----------------
--    (자기 자신을 담당 감리사로 지정하는 경우에만 허용)
drop policy if exists "apartments_insert_auditor" on public.apartments;
create policy "apartments_insert_auditor" on public.apartments for insert to authenticated
with check (
  auditor_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'auditor' and p.approved = true
  )
);

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 리플렛 이미지는 기존 'report-photos' 버킷(공개)에 업로드됩니다. 새 버킷 만들 필요 없어요.
