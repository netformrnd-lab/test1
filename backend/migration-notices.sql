-- 공지사항 테이블
create table if not exists notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  created_at timestamptz default now()
);
alter table notices enable row level security;

-- 승인된 사용자는 누구나 공지 읽기 가능
drop policy if exists "notices_read" on notices;
create policy "notices_read" on notices for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.approved = true)
);

-- 관리자만 작성·수정·삭제
drop policy if exists "notices_admin_all" on notices;
create policy "notices_admin_all" on notices for all
  using (public.is_admin()) with check (public.is_admin());
