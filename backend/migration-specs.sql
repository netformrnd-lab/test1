-- 시방서 / 현장설명회 자료: 단지별 문서 저장 (계약서 contracts 와 동일 패턴)
--  · 파일은 기존 'contracts' 비공개 버킷을 재사용(스태프만 접근) → 새 버킷/정책 불필요
--  · 이 표(specs)만 추가하면 됨. Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)

create table if not exists specs (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  name          text,                 -- 시방서 이름/메모
  file_url      text,                 -- 'contracts' 버킷 내 경로 (PDF/이미지)
  kind          text,                 -- 'pdf' | 'image'
  created_at    timestamptz default now()
);
alter table specs enable row level security;

-- 관리자: 전체 권한
drop policy if exists specs_admin_all on specs;
create policy specs_admin_all on specs
  for all using (is_admin()) with check (is_admin());

-- 열람: 관리자 또는 그 단지 담당 감리사만 (입주민 불가)
drop policy if exists specs_staff_read on specs;
create policy specs_staff_read on specs for select to authenticated using (
  is_admin() or apartment_id in (select id from apartments where auditor_id = auth.uid())
);

-- 등록/수정/삭제: 그 단지 담당 감리사
drop policy if exists specs_auditor_write on specs;
create policy specs_auditor_write on specs for all to authenticated
  using (apartment_id in (select id from apartments where auditor_id = auth.uid()))
  with check (apartment_id in (select id from apartments where auditor_id = auth.uid()));
