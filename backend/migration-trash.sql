-- 휴지통: 삭제된 항목을 스냅샷으로 보관 → 대시보드에서 복구/영구삭제
--  · 삭제 시 원본 행 전체를 data(jsonb)에 담아 trash 에 넣고 원본은 지움
--  · 복구 시 data 를 원본 테이블에 다시 insert
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
create table if not exists public.trash (
  id          uuid primary key default gen_random_uuid(),
  src_table   text not null,                       -- 원본 테이블명 (reports / field_updates ...)
  src_id      uuid not null,                       -- 원본 행 id
  label       text,                                -- 목록에 보여줄 설명(제목 등)
  data        jsonb not null,                      -- 원본 행 전체 스냅샷
  deleted_by  text,                                -- 지운 사람
  deleted_at  timestamptz not null default now()
);
create index if not exists trash_deleted_at_idx on public.trash (deleted_at desc);

-- 관리자만 접근 (RLS). 콘솔은 관리자 세션으로 동작.
alter table public.trash enable row level security;
drop policy if exists trash_admin_all on public.trash;
create policy trash_admin_all on public.trash
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
