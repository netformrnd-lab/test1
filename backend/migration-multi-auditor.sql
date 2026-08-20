-- 한 단지에 감리사 여러 명 배정 (다대다) + 감리사는 배정된 모든 단지 접근
-- 입주민에게는 대표 1명(apartments.auditor_id)만 보임 (기존 유지)

create table if not exists public.apartment_auditors (
  apartment_id uuid references public.apartments(id) on delete cascade,
  auditor_id   uuid references public.profiles(id)   on delete cascade,
  primary key (apartment_id, auditor_id)
);

alter table public.apartment_auditors enable row level security;

-- 관리자: 전체 관리
drop policy if exists "aa_admin" on public.apartment_auditors;
create policy "aa_admin" on public.apartment_auditors for all
  using (public.is_admin()) with check (public.is_admin());

-- 감리사: 자기 배정 행 읽기
drop policy if exists "aa_self_read" on public.apartment_auditors;
create policy "aa_self_read" on public.apartment_auditors for select
  using (auditor_id = auth.uid());

-- 감리사: 배정된(조인) 단지도 읽기 (기존 auditor_id 정책과 OR로 합쳐짐)
drop policy if exists "apartments_read_assigned_auditor" on public.apartments;
create policy "apartments_read_assigned_auditor" on public.apartments for select
  using (exists (
    select 1 from public.apartment_auditors aa
    where aa.apartment_id = apartments.id and aa.auditor_id = auth.uid()
  ));

-- 기존 대표 감리사(auditor_id)를 조인에도 넣어 일관성 유지
insert into public.apartment_auditors (apartment_id, auditor_id)
  select id, auditor_id from public.apartments where auditor_id is not null
  on conflict do nothing;
