-- ============================================================
-- 아파트스퀘어 데이터베이스 설계도 (Supabase / PostgreSQL)
-- Supabase 프로젝트가 준비되면 SQL Editor에 붙여넣어 실행합니다.
-- ============================================================

-- 1) 아파트 단지 --------------------------------------------------
create table if not exists apartments (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                 -- 단지명 (예: 이편한세상한강신도시2차)
  region           text,                          -- 지역 (예: 경기 김포)
  construction_type text,                         -- 공사종류 (외벽 재도장 / 방수 / 하자진단 …)
  status           text default 'scheduled'
                     check (status in ('scheduled','in_progress','done')),
  progress_current int  default 0,                -- 진행 (예: 7)
  progress_total   int  default 0,                -- 전체 (예: 11)
  auditor_id       uuid,                           -- 담당 감리사 (profiles.id) — FK는 아래에서 연결
  created_at       timestamptz default now()
);

-- 2) 회원 프로필 --------------------------------------------------
-- 로그인 자체는 Supabase Auth(auth.users)가 처리하고, 여기엔 추가 정보만 저장
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text,
  phone        text,
  role         text not null default 'resident'
                 check (role in ('resident','manager','auditor','admin')),
  apartment_id uuid references apartments(id),    -- 소속 단지
  approved     boolean not null default false,    -- 관리자 승인 여부 (핵심!)
  created_at   timestamptz default now()
);

-- 단지의 담당 감리사 연결 (순환 참조라 뒤에서 연결)
alter table apartments
  add constraint apartments_auditor_fk
  foreign key (auditor_id) references profiles(id) on delete set null;

-- 3) 감리보고서 --------------------------------------------------
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid references apartments(id) on delete cascade,
  author_id    uuid references profiles(id),      -- 작성 감리사
  title        text not null,
  content      text,
  stage        text,                              -- 공사 단계 (예: 외벽 도장)
  photos       jsonb default '[]'::jsonb,         -- 사진 URL 목록
  created_at   timestamptz default now()
);

-- 4) 공사 일정 ---------------------------------------------------
create table if not exists schedules (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid references apartments(id) on delete cascade,
  date         date not null,
  title        text not null,
  description  text,
  kind         text,                              -- 방문/점검/완료 등
  created_at   timestamptz default now()
);

-- 5) 1:1 문의 ----------------------------------------------------
create table if not exists inquiries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles(id), -- 로그인 안 해도 가능하므로 null 허용
  name              text,
  phone             text,
  apartment_name    text,
  construction_type text,
  region            text,
  content           text,
  created_at        timestamptz default now()
);

-- 6) 공지 / 안내글 / 우수사례 ------------------------------------
create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,                       -- notice(공지) | guide(감리안내) | case(우수사례)
  title      text not null,
  content    text,
  image_url  text,
  meta       jsonb default '{}'::jsonb,           -- 지역/연차 등 부가정보
  created_at timestamptz default now()
);

-- ============================================================
-- 보안(RLS): 로그인한 사람만, 자기 권한에 맞는 데이터만 보게 함
-- (지금은 기본 골격만. 기능 붙이면서 정교화 예정)
-- ============================================================
alter table profiles   enable row level security;
alter table apartments enable row level security;
alter table reports    enable row level security;
alter table schedules  enable row level security;
alter table inquiries  enable row level security;
alter table posts      enable row level security;

-- 공지/안내/우수사례: 누구나 읽기 가능
create policy "posts_read_all" on posts for select using (true);

-- 문의: 누구나 작성 가능
create policy "inquiries_insert_all" on inquiries for insert with check (true);

-- 내 프로필은 내가 읽기
create policy "profiles_read_own" on profiles for select using (auth.uid() = id);

-- 승인된 회원은 단지/보고서/일정 읽기 가능
create policy "apartments_read_approved" on apartments for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.approved));
create policy "reports_read_approved" on reports for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.approved));
create policy "schedules_read_approved" on schedules for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.approved));

-- 감리사는 자기 보고서 작성/수정 가능
create policy "reports_write_auditor" on reports for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'auditor'));

-- 새 회원가입 시 profiles 자동 생성 (미승인 상태로)
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'phone');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
