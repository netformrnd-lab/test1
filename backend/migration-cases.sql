-- 감리 우수 사례 (관리자가 작성, 전/후 사진 포함)
create table if not exists cases (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,     -- 예: 외벽 재도장 · 경기 성남
  meta       text,              -- 예: 15년차 · 2026.05 완료
  summary    text,              -- 목록 카드 한 줄 요약
  body       text,              -- 상세 본문
  before_url text,              -- 시공 전 사진
  after_url  text,              -- 시공 후 사진
  created_at timestamptz default now()
);
alter table cases enable row level security;

-- 우수 사례는 홍보용이라 누구나 읽기 가능
drop policy if exists "cases_read" on cases;
create policy "cases_read" on cases for select using (true);

-- 관리자만 작성·수정·삭제
drop policy if exists "cases_admin_all" on cases;
create policy "cases_admin_all" on cases for all
  using (public.is_admin()) with check (public.is_admin());

-- 사진 저장소(버킷) : 공개 읽기, 관리자만 업로드
insert into storage.buckets (id, name, public)
  values ('case-photos', 'case-photos', true)
  on conflict (id) do nothing;

drop policy if exists "case_photos_read" on storage.objects;
create policy "case_photos_read" on storage.objects for select
  using (bucket_id = 'case-photos');

drop policy if exists "case_photos_admin_write" on storage.objects;
create policy "case_photos_admin_write" on storage.objects for insert
  with check (bucket_id = 'case-photos' and public.is_admin());
