-- 현장 현황 (단지별 현장 사진·글 게시판) — 관리자가 올리고 입주민·감리사가 봄
create table if not exists field_updates (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid references apartments(id) on delete cascade,
  title        text not null,
  content      text,
  photos       jsonb default '[]'::jsonb,
  created_at   timestamptz default now()
);
create index if not exists field_updates_apt_idx on field_updates(apartment_id, created_at desc);
alter table field_updates enable row level security;

-- 입주민: 우리 단지 현장 현황
drop policy if exists "field_read_resident" on field_updates;
create policy "field_read_resident" on field_updates for select using (
  apartment_id = (select apartment_id from profiles where id = auth.uid())
);
-- 감리사: 담당 단지 현장 현황
drop policy if exists "field_read_auditor" on field_updates;
create policy "field_read_auditor" on field_updates for select using (
  apartment_id in (select id from apartments where auditor_id = auth.uid())
);
-- 관리자: 전체 열람·작성·수정·삭제
drop policy if exists "field_admin_all" on field_updates;
create policy "field_admin_all" on field_updates for all
  using (public.is_admin()) with check (public.is_admin());

-- 현장 사진 저장소
insert into storage.buckets (id, name, public)
  values ('field-photos', 'field-photos', true) on conflict (id) do nothing;
drop policy if exists "field_photos_read" on storage.objects;
create policy "field_photos_read" on storage.objects for select using (bucket_id = 'field-photos');
drop policy if exists "field_photos_admin_write" on storage.objects;
create policy "field_photos_admin_write" on storage.objects for insert
  with check (bucket_id = 'field-photos' and public.is_admin());
