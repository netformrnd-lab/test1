-- ============================================================
-- 시공사 일일보고 + AI 안전·공정 위험 탐지 (초안 · 1단계)
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
--
-- ※ 운영·내부테스트가 같은 DB를 씀 → 이 파일은 '새 표 추가'만 하고 기존 표 데이터는 건드리지 않음.
--   (예외: profiles.role 허용값에 'contractor' 추가 — 기존 값은 그대로)
--
-- 만드는 것
--  1) 역할 'contractor'(시공사·현장소장) + 시공사↔현장 배정표(apartment_contractors)
--  2) daily_reports(일일보고) · daily_photos(사진) · daily_ai(AI 결과, 감리원·관리자만)
--     ai_findings(검토 항목) · finding_events(처리 이력)
--  3) ai_usage_daily(AI 사용량·비용) · 비공개 버킷 daily-photos
--  4) finding_act()  : 확인/통보/회신/재확인/오경보 — 상태 변경은 전부 이 함수로(이력 자동 기록)
--     daily_escalate(): 기준 시간 넘게 미확인 항목 → 관리자 재알림 표시(GitHub Actions 가 매시 호출)
-- ============================================================

-- 1) 역할 허용값에 contractor 추가 ------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'profiles' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_role_check
  check (role in ('resident','manager','auditor','admin','contractor'));

-- 가입 시 '시공사'로 신청했는지 (관리자 승인 화면에서 보임)
alter table public.profiles add column if not exists signup_role text;

-- 2) 시공사 ↔ 현장 (한 명이 여러 현장 가능) --------------------------
create table if not exists public.apartment_contractors (
  apartment_id  uuid references public.apartments(id) on delete cascade,
  contractor_id uuid references public.profiles(id)   on delete cascade,
  created_at    timestamptz default now(),
  primary key (apartment_id, contractor_id)
);
alter table public.apartment_contractors enable row level security;

-- 관리자가 회원 편집에서 역할=시공사 + 담당 단지를 넣으면 → 배정표로 옮기고 profiles.apartment_id 는 비움
-- (profiles.apartment_id 가 있으면 입주민용 화면·정책이 열리므로 시공사는 배정표로만 관리)
create or replace function public.contractor_assign_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'contractor' and new.apartment_id is not null then
    insert into public.apartment_contractors (apartment_id, contractor_id)
      values (new.apartment_id, new.id) on conflict do nothing;
    new.apartment_id := null;
  end if;
  return new;
end; $$;
-- 이름이 'trg_zz_' 로 시작 → 같은 시점 트리거는 이름순 실행이라, 본인 역할 변경을 막는 trg_protect_profile 다음에 실행됨
-- (일반 사용자가 스스로 role 을 contractor 로 바꿔도 먼저 원래대로 되돌려진 뒤라 배정되지 않음)
drop trigger if exists trg_contractor_assign on public.profiles;
drop trigger if exists trg_zz_contractor_assign on public.profiles;
create trigger trg_zz_contractor_assign
  before insert or update of role, apartment_id on public.profiles
  for each row execute function public.contractor_assign_from_profile();

-- 권한 도우미 ---------------------------------------------------------
create or replace function public.is_contractor_of(p_apt uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.apartment_contractors ac
    join public.profiles p on p.id = ac.contractor_id
    where ac.apartment_id = p_apt and ac.contractor_id = auth.uid()
      and p.role = 'contractor' and p.approved
  );
$$;
create or replace function public.is_staff_of(p_apt uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.apartments a where a.id = p_apt and a.auditor_id = auth.uid())
      or exists (select 1 from public.apartment_auditors aa where aa.apartment_id = p_apt and aa.auditor_id = auth.uid());
$$;

drop policy if exists ac_admin on public.apartment_contractors;
create policy ac_admin on public.apartment_contractors for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists ac_read on public.apartment_contractors;
create policy ac_read on public.apartment_contractors for select
  using (contractor_id = auth.uid() or public.is_staff_of(apartment_id));

-- 시공사: 배정된 현장 정보(이름·공법) 읽기
drop policy if exists apartments_read_contractor on public.apartments;
create policy apartments_read_contractor on public.apartments for select
  using (public.is_contractor_of(id));

-- 3) 일일보고 ---------------------------------------------------------
create table if not exists public.daily_reports (
  id               uuid primary key default gen_random_uuid(),
  apartment_id     uuid not null references public.apartments(id) on delete cascade,
  author_id        uuid references public.profiles(id) on delete set null,
  author_name      text,
  work_date        date not null default current_date,
  worktype         text,                       -- 공정 단계 (STAGE_SETS 단계명)
  location         text,                       -- 동·부위
  memo             text,
  required_missing jsonb default '[]'::jsonb,  -- 빠진 필수 촬영 항목 라벨 목록
  ai_status        text not null default 'pending'   -- 진행 상태만 (결과 내용은 daily_ai 표, 감리원·관리자만)
                     check (ai_status in ('pending','running','done','failed','skipped')),
  created_at       timestamptz default now()
);
create index if not exists daily_reports_apt_idx on public.daily_reports(apartment_id, work_date desc);
alter table public.daily_reports enable row level security;

drop policy if exists dr_read on public.daily_reports;
create policy dr_read on public.daily_reports for select
  using (public.is_staff_of(apartment_id) or public.is_contractor_of(apartment_id));
drop policy if exists dr_insert_contractor on public.daily_reports;
create policy dr_insert_contractor on public.daily_reports for insert
  with check (public.is_contractor_of(apartment_id) and author_id = auth.uid() and ai_status = 'pending');
drop policy if exists dr_admin on public.daily_reports;
create policy dr_admin on public.daily_reports for all
  using (public.is_admin()) with check (public.is_admin());
-- 제출 후 수정 불가(기록 보존). AI 상태는 서버(service_role)만 씀.

-- AI 결과 (보고 1건당 1행) — 시공사에게는 안 보임
create table if not exists public.daily_ai (
  report_id    uuid primary key references public.daily_reports(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  summary      text,          -- 검토 필요 / 이상 징후 없음 / 판단 불가
  result       jsonb,         -- 모델·항목·요약·비용
  error        text,
  updated_at   timestamptz default now()
);
alter table public.daily_ai enable row level security;
drop policy if exists dai_read on public.daily_ai;
create policy dai_read on public.daily_ai for select using (public.is_staff_of(apartment_id));
-- 쓰기 정책 없음 → 서버(service_role)만 기록

create table if not exists public.daily_photos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.daily_reports(id) on delete cascade,
  apartment_id  uuid not null references public.apartments(id) on delete cascade,
  path          text not null,                 -- daily-photos 버킷 경로 (본 사진, 긴 변 1280px)
  thumb_path    text,                          -- 썸네일 (400px)
  shot_slot     text,                          -- 필수 촬영 칸 키 (없으면 추가 사진)
  shot_label    text,
  sha256        text,                          -- 원본 해시(같은 사진 재사용 탐지)
  bytes         int,
  exif_taken_at timestamptz,
  exif_lat      double precision,
  exif_lng      double precision,
  exif_device   text,
  stale_flag    boolean default false,         -- 촬영일이 보고일과 다름
  created_at    timestamptz default now()
);
create index if not exists daily_photos_report_idx on public.daily_photos(report_id);
create index if not exists daily_photos_hash_idx on public.daily_photos(apartment_id, sha256);
alter table public.daily_photos enable row level security;

drop policy if exists dp_read on public.daily_photos;
create policy dp_read on public.daily_photos for select
  using (public.is_staff_of(apartment_id) or public.is_contractor_of(apartment_id));
drop policy if exists dp_insert_contractor on public.daily_photos;
create policy dp_insert_contractor on public.daily_photos for insert
  with check (public.is_contractor_of(apartment_id) and exists (
    select 1 from public.daily_reports r
    where r.id = report_id and r.apartment_id = daily_photos.apartment_id and r.author_id = auth.uid()));
drop policy if exists dp_admin on public.daily_photos;
create policy dp_admin on public.daily_photos for all
  using (public.is_admin()) with check (public.is_admin());

-- 4) 검토 항목 + 처리 이력 ---------------------------------------------
create table if not exists public.ai_findings (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.daily_reports(id) on delete cascade,
  apartment_id  uuid not null references public.apartments(id) on delete cascade,
  source        text not null default 'ai' check (source in ('ai','rule')),
  category      text,                          -- 안전 / 공정·품질 / 기록
  title         text not null,
  reason        text,
  photo_ids     uuid[] default '{}',           -- 근거 사진
  state         text not null default 'open'
                  check (state in ('open','acknowledged','requested','replied','rechecked','false_alarm')),
  shared        boolean not null default false, -- 시공사에게 보이는지(감리원이 통보하면 true)
  last_actor    text,
  updated_at    timestamptz default now(),
  escalated_at  timestamptz,                   -- 관리자 재알림 시각
  created_at    timestamptz default now()
);
create index if not exists ai_findings_apt_idx on public.ai_findings(apartment_id, state, created_at desc);
create index if not exists ai_findings_report_idx on public.ai_findings(report_id);
alter table public.ai_findings enable row level security;

drop policy if exists af_read_staff on public.ai_findings;
create policy af_read_staff on public.ai_findings for select
  using (public.is_staff_of(apartment_id));
drop policy if exists af_read_contractor on public.ai_findings;
create policy af_read_contractor on public.ai_findings for select
  using (shared and public.is_contractor_of(apartment_id));
-- insert/update 정책 없음 → 서버(service_role)와 finding_act() 로만 변경

create table if not exists public.finding_events (
  id          uuid primary key default gen_random_uuid(),
  finding_id  uuid not null references public.ai_findings(id) on delete cascade,
  action      text not null,     -- acknowledge / request / reply / recheck / false_alarm / reopen / escalate
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  note        text,
  photo_paths text[] default '{}',
  created_at  timestamptz default now()
);
create index if not exists finding_events_f_idx on public.finding_events(finding_id, created_at);
alter table public.finding_events enable row level security;
drop policy if exists fe_read on public.finding_events;
create policy fe_read on public.finding_events for select using (exists (
  select 1 from public.ai_findings f where f.id = finding_id
    and (public.is_staff_of(f.apartment_id) or (f.shared and public.is_contractor_of(f.apartment_id)))));
-- insert/update/delete 정책 없음 → 이력은 고칠 수 없음(감사 기록)

-- 상태 변경 함수: 역할·순서 검사 + 이력 기록을 한 번에
create or replace function public.finding_act(p_finding uuid, p_action text, p_note text default null, p_photos text[] default '{}')
returns text language plpgsql security definer set search_path = public as $$
declare f public.ai_findings; me public.profiles; staff boolean; contr boolean; nxt text;
begin
  select * into f from public.ai_findings where id = p_finding for update;
  if not found then raise exception '항목을 찾을 수 없어요'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception '로그인이 필요해요'; end if;
  staff := public.is_staff_of(f.apartment_id);
  contr := f.shared and public.is_contractor_of(f.apartment_id);

  if p_action = 'acknowledge' and staff and f.state = 'open' then nxt := 'acknowledged';
  elsif p_action = 'request' and staff and f.state in ('open','acknowledged','replied') then nxt := 'requested';
  elsif p_action = 'reply' and contr and f.state = 'requested' then nxt := 'replied';
  elsif p_action = 'recheck' and staff and f.state in ('acknowledged','replied') then nxt := 'rechecked';
  elsif p_action = 'false_alarm' and staff and f.state in ('open','acknowledged') then nxt := 'false_alarm';
  elsif p_action = 'reopen' and staff and f.state in ('rechecked','false_alarm') then nxt := 'acknowledged';
  else raise exception '지금 상태(%)에서는 이 처리를 할 수 없어요', f.state;
  end if;

  update public.ai_findings
     set state = nxt,
         shared = (shared or p_action = 'request'),
         last_actor = coalesce(me.name, ''),
         updated_at = now()
   where id = f.id;
  insert into public.finding_events (finding_id, action, actor_id, actor_name, actor_role, note, photo_paths)
    values (f.id, p_action, me.id, me.name, me.role, nullif(trim(coalesce(p_note,'')), ''), coalesce(p_photos, '{}'));
  return nxt;
end; $$;
grant execute on function public.finding_act(uuid, text, text, text[]) to authenticated;

-- 미확인 재알림: open 상태로 p_hours 넘게 방치된 항목에 escalated_at 표시 → 웹훅이 관리자에게 푸시
create or replace function public.daily_escalate(p_hours int default 24)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with u as (
    update public.ai_findings set escalated_at = now()
     where state = 'open' and escalated_at is null
       and created_at < now() - make_interval(hours => p_hours)
    returning id
  ), e as (
    insert into public.finding_events (finding_id, action, actor_name, actor_role, note)
    select id, 'escalate', '시스템', 'system', p_hours || '시간 넘게 미확인 → 관리자 알림' from u
    returning 1
  )
  select count(*) into n from e;
  return n;
end; $$;
revoke execute on function public.daily_escalate(int) from public, anon, authenticated;
grant execute on function public.daily_escalate(int) to service_role;

-- 5) AI 사용량 (하루/월 상한 집행 + 대시보드 비용 표시) -------------------
create table if not exists public.ai_usage_daily (
  day           date not null default current_date,
  apartment_id  uuid not null references public.apartments(id) on delete cascade,
  photos        int not null default 0,
  calls         int not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd      numeric(10,4) not null default 0,
  primary key (day, apartment_id)
);
alter table public.ai_usage_daily enable row level security;
drop policy if exists aud_read on public.ai_usage_daily;
create policy aud_read on public.ai_usage_daily for select using (public.is_admin());

-- 6) 사진 저장소 (비공개) — 경로: {apartment_id}/{report_id}/파일 --------
insert into storage.buckets (id, name, public)
  values ('daily-photos', 'daily-photos', false) on conflict (id) do nothing;

drop policy if exists daily_photos_upload on storage.objects;
create policy daily_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-photos' and (
    public.is_contractor_of(((storage.foldername(name))[1])::uuid)
    or public.is_staff_of(((storage.foldername(name))[1])::uuid)));
drop policy if exists daily_photos_read on storage.objects;
create policy daily_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'daily-photos' and (
    public.is_contractor_of(((storage.foldername(name))[1])::uuid)
    or public.is_staff_of(((storage.foldername(name))[1])::uuid)));

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 다음: Database → Webhooks 에 daily_ai(INSERT·UPDATE), ai_findings(UPDATE) 를 푸시 워커로 연결 (docs 체크리스트 참고)
