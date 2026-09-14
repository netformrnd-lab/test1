-- 소장님 작성지 제출 내용 저장 테이블
-- 소장님(비로그인)이 공개 폼(/form/)에서 작성 → 이 테이블에 저장
-- 감리사 앱 · 관리자 대시보드에서 조회
create table if not exists manager_forms (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete set null,  -- 연결된 단지 (있으면)
  apt_name      text,          -- 단지명 (텍스트, 링크에 담겨 옴)
  writer_name   text,          -- 작성자(관리소장님 성함)
  phone         text,          -- 연락처
  households    text,          -- 세대수 / 동 수
  built_year    text,          -- 준공 연도
  issue         text,          -- 주요 하자·불편 사항
  request       text,          -- 요청·희망 사항
  wish_when     text,          -- 희망 공사 시기
  created_at    timestamptz default now()
);

alter table manager_forms enable row level security;

-- 소장님(비로그인 anon)도 제출 가능
drop policy if exists manager_forms_insert_public on manager_forms;
create policy manager_forms_insert_public on manager_forms
  for insert to anon, authenticated
  with check (true);

-- 관리자: 전체 권한(조회·삭제 포함)
drop policy if exists manager_forms_admin_all on manager_forms;
create policy manager_forms_admin_all on manager_forms
  for all
  using (is_admin())
  with check (is_admin());

-- 감리사·관리자: 조회 가능
drop policy if exists manager_forms_staff_read on manager_forms;
create policy manager_forms_staff_read on manager_forms
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('auditor','admin')));
