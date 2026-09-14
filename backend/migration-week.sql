-- 현장 현황: 동(棟)별 분류용 컬럼
alter table field_updates add column if not exists dong text;   -- 예: '106동' (없으면 제목에서 자동 추출)

-- 계약서 (감리사·관리자만 열람)
create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  name          text,                 -- 계약서 이름/메모
  file_url      text,                 -- PDF 또는 이미지 URL
  kind          text,                 -- 'pdf' | 'image'
  created_at    timestamptz default now()
);
alter table contracts enable row level security;

drop policy if exists contracts_admin_all on contracts;
create policy contracts_admin_all on contracts
  for all using (is_admin()) with check (is_admin());

-- 감리사·관리자만 열람 (입주민 불가)
drop policy if exists contracts_staff_read on contracts;
create policy contracts_staff_read on contracts
  for select to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('auditor','admin')));

-- 감리사가 계약서 등록/수정/삭제도 가능하게 (담당 단지)
drop policy if exists contracts_auditor_write on contracts;
create policy contracts_auditor_write on contracts
  for all to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor')
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));
