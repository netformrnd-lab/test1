-- ============================================================
-- 아파트스퀘어 · 최종 통합 설정 SQL (이 파일 하나만 실행하면 끝)
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다 (이미 있는 건 자동으로 건너뜀).
-- ※ 최초 1회 기본 스키마(backend/schema.sql)는 이미 적용돼 있어야 합니다.
--    (앱이 지금 돌아가고 있으면 이미 적용된 상태예요)
-- ============================================================


-- ===== [1] migration-method.sql =====
-- 공법(시공순서 세트) 코드 저장용 컬럼
-- repaint(외벽 재도장) / metalroof(금속지붕 방수) / shingle(아스팔트슁글 방수) / epoxy(지하주차장 에폭시)
alter table apartments add column if not exists method text;


-- ===== [2] migration-admin.sql =====
-- ============================================================
-- 관리자 대시보드용 추가 설정
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1) profiles에 email 컬럼 추가 (대시보드에서 회원을 이메일로 식별)
alter table profiles add column if not exists email text;

-- 2) 새 가입 시 email도 함께 저장하도록 트리거 갱신
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, phone, email)
  values (new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'phone', new.email);
  return new;
end; $$;

-- 3) 기존 회원들의 email 채우기
update profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is null;

-- 4) 관리자 판별 함수 (RLS 무한참조 방지를 위해 security definer)
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- 5) 관리자는 모든 회원/단지를 조회·수정할 수 있음
drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles for all
  using (is_admin()) with check (is_admin());

drop policy if exists "apartments_admin_all" on apartments;
create policy "apartments_admin_all" on apartments for all
  using (is_admin()) with check (is_admin());

-- ============================================================
-- 6) 나를 '관리자'로 지정 — 아래 줄의 이메일을 본인 것으로 바꿔 실행!
-- ============================================================
-- update profiles set role = 'admin', approved = true
--   where id = (select id from auth.users where email = '여기에_내_이메일_입력');


-- ===== [3] migration-fix-rls.sql =====
-- RLS 오류 수정: is_admin() 에 search_path 명시 (핵심)
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable
as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin'); $$;

-- 관리자 정책 재생성
drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "apartments_admin_all" on apartments;
create policy "apartments_admin_all" on apartments for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "reports_admin_all" on reports;
create policy "reports_admin_all" on reports for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "schedules_admin_all" on schedules;
create policy "schedules_admin_all" on schedules for all using (public.is_admin()) with check (public.is_admin());

-- 감리사가 자기 담당 단지를 확실히 읽도록
drop policy if exists "apartments_read_auditor" on apartments;
create policy "apartments_read_auditor" on apartments for select using (auditor_id = auth.uid());

-- 입주민이 담당 감리사 "이름만" 안전하게 볼 수 있는 함수
create or replace function public.apartment_auditor_name(apt uuid)
returns text language sql security definer set search_path = public stable
as $$ select p.name from apartments a join profiles p on p.id = a.auditor_id where a.id = apt; $$;
grant execute on function public.apartment_auditor_name(uuid) to anon, authenticated;


-- ===== [4] migration-storage.sql =====
-- 감리보고서 사진 저장용 Storage 버킷 + 정책
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

drop policy if exists "report_photos_upload" on storage.objects;
create policy "report_photos_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'report-photos');

drop policy if exists "report_photos_read" on storage.objects;
create policy "report_photos_read" on storage.objects
  for select using (bucket_id = 'report-photos');


-- ===== [5] migration-schedule.sql =====
-- 감리사가 공사 일정을 추가할 수 있게 (INSERT 권한)
drop policy if exists "schedules_write_auditor" on schedules;
create policy "schedules_write_auditor" on schedules for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));


-- ===== [6] migration-schedule2.sql =====
-- 개인 일정용 소유자 칸
alter table schedules add column if not exists owner_id uuid references profiles(id);

-- 기존의 넓은 읽기 정책 제거 (누구나 모든 일정을 보던 것)
drop policy if exists "schedules_read_approved" on schedules;

-- 개인 일정: 소유자만 볼 수 있음
drop policy if exists "schedules_read_owner" on schedules;
create policy "schedules_read_owner" on schedules for select
  using (owner_id = auth.uid());

-- 단지 일정: 그 단지 소속 입주민 + 담당 감리사만 볼 수 있음
drop policy if exists "schedules_read_apartment" on schedules;
create policy "schedules_read_apartment" on schedules for select using (
  apartment_id is not null and (
    apartment_id = (select apartment_id from profiles where id = auth.uid())
    or apartment_id in (select id from apartments where auditor_id = auth.uid())
  )
);

-- 감리사만 일정 추가 가능 (개인/단지 둘 다)
drop policy if exists "schedules_write_auditor" on schedules;
create policy "schedules_write_auditor" on schedules for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));


-- ===== [7] migration-week.sql =====
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


-- ===== [8] migration-notices.sql =====
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


-- ===== [9] migration-notices-public.sql =====
-- 공지사항을 누구나(비회원 포함) 읽을 수 있게 (홍보성 안내이므로 공개)
drop policy if exists "notices_read" on notices;
create policy "notices_read" on notices for select using (true);


-- ===== [10] migration-cases.sql =====
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


-- ===== [11] migration-field.sql =====
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


-- ===== [12] migration-reports-publish.sql =====
-- 감리보고서 워크플로우: 감리사 작성 → 관리자 재작성/공개 → 입주민 열람
alter table reports add column if not exists published boolean default false;

-- 기존의 넓은 읽기 정책 제거 (승인만 되면 모든 보고서 열람 가능하던 것)
drop policy if exists "reports_read_approved" on reports;

-- 감리사: 자기 담당 단지 보고서 열람 (초안 포함)
drop policy if exists "reports_read_auditor" on reports;
create policy "reports_read_auditor" on reports for select using (
  apartment_id in (select id from apartments where auditor_id = auth.uid())
);

-- 입주민·관리소장: '공개된' 우리 단지 보고서만 열람
drop policy if exists "reports_read_resident" on reports;
create policy "reports_read_resident" on reports for select using (
  published = true
  and apartment_id = (select apartment_id from profiles where id = auth.uid())
);

-- 관리자: 전체 열람·수정·공개 (reports_admin_all 은 migration-fix-rls 에 이미 있음)


-- ===== [13] migration-publish-field.sql =====
-- 감리일지(reports)를 입주민 현장현황(field_updates)으로 공개하는 연결
-- field_updates에 원본 감리일지 링크 (감리일지 삭제 시 함께 제거)
alter table field_updates add column if not exists source_report_id uuid references reports(id) on delete cascade;
-- reports에 입주민 공개 설정 저장 (관리자가 카드에서 선택)
alter table reports add column if not exists pub_title text;                 -- 입주민 현장현황에 보일 제목
alter table reports add column if not exists pub_mode  text;                 -- null/''=비공개, 'photo'=사진만, 'full'=사진+글


-- ===== [14] migration-auditor-phone.sql =====
-- 입주민이 담당 감리사에게 전화·문자할 수 있도록 "전화번호만" 안전하게 반환
-- (profiles 테이블 전체를 노출하지 않고, 담당 단지의 감리사 번호만 SECURITY DEFINER로 조회)
create or replace function public.apartment_auditor_phone(apt uuid)
returns text language sql security definer set search_path = public stable
as $$ select p.phone from apartments a join profiles p on p.id = a.auditor_id where a.id = apt; $$;
grant execute on function public.apartment_auditor_phone(uuid) to anon, authenticated;


-- ===== [15] migration-region-activity.sql =====
-- '우리 지역 감리 현황' 익명 피드
-- 단지 이름·주소·감리사 등 개인정보는 절대 반환하지 않고,
-- 지역(시/도)·공사종류·상태만 익명으로 반환 (SECURITY DEFINER)
create or replace function public.region_activity()
returns table(region text, construction_type text, status text)
language sql security definer set search_path = public stable
as $$
  select split_part(coalesce(a.region, ''), ' ', 1) as region,
         a.construction_type,
         a.status
  from apartments a
  where a.status is distinct from 'done'
  order by (a.status = 'in_progress') desc, (coalesce(a.region,'') <> '') desc, a.created_at desc
  limit 12
$$;
grant execute on function public.region_activity() to anon, authenticated;


-- ===== [16] migration-manager-forms.sql =====
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


-- ===== [17] migration-chat.sql =====
-- 인앱 채팅 (입주민 ↔ 감리사, 손님 ↔ 관리자)
create table if not exists chat_messages (
  id            uuid primary key default gen_random_uuid(),
  thread        text not null,                 -- 'apt:<apartment_id>' 또는 'guest:<uuid>'
  apartment_id  uuid references apartments(id) on delete set null,
  sender_role   text not null,                 -- guest|resident|manager|auditor|admin
  sender_name   text,
  body          text not null,
  created_at    timestamptz default now()
);
create index if not exists chat_messages_thread_idx on chat_messages (thread, created_at);

alter table chat_messages enable row level security;

-- 누구나(손님 포함) 메시지 전송 가능
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages
  for insert to anon, authenticated with check (true);

-- 관리자: 전체 권한
drop policy if exists chat_admin_all on chat_messages;
create policy chat_admin_all on chat_messages
  for all using (is_admin()) with check (is_admin());

-- 로그인 사용자: 자기 단지 스레드 열람 (입주민=배정 단지, 감리사=담당 단지)
drop policy if exists chat_apt_read on chat_messages;
create policy chat_apt_read on chat_messages
  for select to authenticated using (
    apartment_id is not null and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );

-- 손님 스레드: 비로그인 열람 (추측 불가한 uuid 기반) — 관리자와의 상담용
drop policy if exists chat_guest_read on chat_messages;
create policy chat_guest_read on chat_messages
  for select to anon using (thread like 'guest:%');


-- ===== [18] migration-survey.sql =====
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


-- ===== [19] migration-chat-reads.sql =====
-- 채팅 '읽음' 상태를 계정에 저장 (기기·재로그인 사이에도 유지)
-- profiles.chat_reads = { "apt:<id>": "2026-07-27T09:00:00Z", ... }
alter table profiles add column if not exists chat_reads jsonb default '{}'::jsonb;

-- 본인 profiles 업데이트 정책이 없다면 추가 (이미 있으면 무시됨)
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());


-- ===== [20] migration-report-dong.sql =====
-- 감리일지에 '작업한 동' 저장 → 동별 작업 현황 자동 분류
-- 예: dongs = '101동, 102동, 105동'
alter table reports add column if not exists dongs text;


-- ===== [21] migration-report-pdf.sql =====
-- 감리일지 입주민 공개용 PDF (관리자가 감리사 작성 내용을 보고 문서화해서 업로드)
alter table reports add column if not exists pdf_url text;
alter table reports add column if not exists pdf_name text;


-- ===== [22] migration-dong-progress.sql =====
-- 동(棟)별 공정 진행 상태 (관리자가 설정 · 입주민 현장현황에 표시)
-- stage = 현재 진행 단계 인덱스(0 = 시작 전, 공법 stages 기준). 공법은 apartments.method 사용.
create table if not exists dong_progress (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  dong          text not null,
  stage         int default 0,
  updated_at    timestamptz default now(),
  unique (apartment_id, dong)
);
alter table dong_progress enable row level security;

-- 로그인 사용자 열람 (입주민 현장현황용)
drop policy if exists dong_progress_read on dong_progress;
create policy dong_progress_read on dong_progress
  for select to anon, authenticated using (true);

-- 관리자만 등록/수정/삭제
drop policy if exists dong_progress_admin on dong_progress;
create policy dong_progress_admin on dong_progress
  for all using (is_admin()) with check (is_admin());


-- ===== [23] migration-dong-hidden.sql =====
-- 동별 진행: 자동 감지된 동을 '숨김(제외)'할 수 있도록 컬럼 추가
-- (× 로 뺀 동이 감리일지 제목에서 다시 잡혀 되살아나던 문제 해결)
-- Supabase → SQL Editor → 붙여넣고 Run (여러 번 실행해도 안전)
alter table dong_progress add column if not exists hidden boolean default false;


-- ===== [24] migration-dong-base.sql =====
-- 단지별 '동 번호 100단위 보정' 설정
-- 예: 세종조치원처럼 동이 121·112동인데 제목엔 21·12동으로 짧게 적히는 단지 → 100 지정
-- (2자리 동을 자동으로 1xx동으로 보정)
alter table apartments add column if not exists dong_base int;


-- ===== [25] migration-login-email.sql =====
-- ============================================================
-- 아이디 로그인 유지 + 이메일 기반 비밀번호 재설정
-- Supabase → SQL Editor → 전체 붙여넣기 → Run (여러 번 실행해도 안전)
-- ============================================================

-- 1) profiles.username(아이디) 컬럼 + 기존 회원 백필 --------------------
alter table profiles add column if not exists username text;
-- 기존 회원은 로그인 이메일이 '아이디@aptsquare.app' 형태라 앞부분이 곧 아이디
update profiles set username = split_part(email, '@', 1)
  where (username is null or username = '') and email is not null;
create index if not exists profiles_username_idx on profiles (lower(username));

-- 2) 가입 트리거: 이름·연락처·(실제)이메일·아이디(username) 저장 -----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone, email, username)
  values (new.id,
          new.raw_user_meta_data->>'name',
          new.raw_user_meta_data->>'phone',
          new.email,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        email    = coalesce(excluded.email, public.profiles.email);
  return new;
end; $$;

-- 3) 로그인용: 아이디(username) → 로그인 이메일 반환 ---------------------
create or replace function public.login_email(uname text)
returns text language sql security definer set search_path = public stable as $$
  select email from profiles where lower(username) = lower(uname) limit 1
$$;
grant execute on function public.login_email(text) to anon, authenticated;

-- 4) 아이디 찾기: 연락처(숫자만 비교) → 아이디 목록 --------------------
create or replace function public.find_login_ids(p_phone text)
returns table(username text) language sql security definer set search_path = public stable as $$
  select username from profiles
   where username is not null
     and regexp_replace(coalesce(phone, ''),  '[^0-9]', '', 'g') =
         regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
     and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') <> ''
$$;
grant execute on function public.find_login_ids(text) to anon, authenticated;

-- 완료! 'Success. No rows returned' 이 뜨면 정상입니다.


-- ===== [26] migration-security.sql =====
-- ============================================================
-- 보안 강화 (2026-07) — 채팅 스팸·사칭 차단 + 게스트 대화 노출 차단
-- Supabase → SQL Editor → New query → 아래 전체 붙여넣기 → Run
-- (여러 번 실행해도 안전합니다)
-- ============================================================

-- 배경: publishable(anon) 키는 공개용이라 누구나 사용할 수 있습니다.
-- 기존 채팅 정책은 anon(비로그인)도 '아무 스레드에나' 글을 넣고
-- 게스트 대화 전체를 읽을 수 있어, 스팸·사칭·대화 노출 위험이 있었습니다.

-- 1) 채팅 전송: 로그인한 '우리 단지' 사용자만, 자기 단지 스레드에만 전송 --------
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages
  for insert to authenticated with check (
    apartment_id is not null and (
      exists (select 1 from profiles p
                where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a
                where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );
-- (관리자는 chat_admin_all 로 모든 스레드 송·수신, 읽기는 chat_apt_read 로 자기 단지)

-- 2) 게스트 스레드 비로그인 열람 정책 제거 (anon 이 전체 게스트 대화를 읽던 것 차단) --
drop policy if exists chat_guest_read on chat_messages;

-- 3) 담당 감리사 '전화번호' 조회 함수: 비로그인(anon) 접근 차단 → 로그인 사용자만 ----
revoke execute on function public.apartment_auditor_phone(uuid) from anon;

-- 완료! 'Success. No rows returned' 이 뜨면 정상입니다.


-- ✅ 완료! (오류 없이 끝나면 최신 기능·보안 전부 적용됨)
