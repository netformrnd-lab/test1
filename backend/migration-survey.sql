-- 공사 완료 후 만족도 설문 (입주민·관리소장 응답 · 1인 1회)
create table if not exists surveys (
  id             uuid primary key default gen_random_uuid(),
  apartment_id   uuid references apartments(id) on delete cascade,
  respondent_id  uuid references profiles(id) on delete set null,
  respondent_role text,                       -- 'resident' | 'manager'
  overall        int,                          -- 전체 만족도 1~5
  r_comm         int,                          -- 감리 소통 1~5
  r_site         int,                          -- 현장 관리·안전 1~5
  r_defect       int,                          -- 하자 대응 1~5
  r_quality      int,                          -- 시공 품질 1~5
  best           text,                         -- 가장 만족스러웠던 점
  again          text,                         -- 다음에 또 맡기고 싶은 공정(복수, 쉼표로 저장)
  comment        text,                         -- 한 줄 의견
  created_at     timestamptz default now(),
  unique (apartment_id, respondent_id)         -- 1인 1회
);
alter table surveys enable row level security;

-- 관리자: 전체 열람/관리
drop policy if exists surveys_admin_all on surveys;
create policy surveys_admin_all on surveys
  for all using (is_admin()) with check (is_admin());

-- 입주민·관리소장: 본인 응답 등록/수정
drop policy if exists surveys_insert_self on surveys;
create policy surveys_insert_self on surveys
  for insert to authenticated with check (respondent_id = auth.uid());
drop policy if exists surveys_update_self on surveys;
create policy surveys_update_self on surveys
  for update to authenticated using (respondent_id = auth.uid()) with check (respondent_id = auth.uid());

-- 본인 응답은 본인이 읽기 (참여 여부 확인용)
drop policy if exists surveys_read_self on surveys;
create policy surveys_read_self on surveys
  for select to authenticated using (respondent_id = auth.uid());

-- 감리사: 담당 단지 결과 열람
drop policy if exists surveys_auditor_read on surveys;
create policy surveys_auditor_read on surveys
  for select to authenticated using (
    exists (select 1 from apartments a where a.id = surveys.apartment_id and a.auditor_id = auth.uid()));
