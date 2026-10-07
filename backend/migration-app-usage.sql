-- ============================================================
--  입주민 앱 사용통계 — 자동 집계
--  기존 public.app_events (apartment_id, profile_id, kind, created_at) 를 그대로 활용.
--  kind 값: view(홈 열람) · report(감리일지 열람) · contract(계약서 열람) · nps(만족도 제출) · kakao(카톡 상담)
--  이 파일은 (1) 조회 성능 인덱스 (2) 서버측 자동 집계 함수 app_usage_stats() 를 만든다.
--  대시보드는 sb.rpc('app_usage_stats',{p_days:30}) 한 번으로 모든 숫자를 받아 그린다(사람이 집계할 일 없음).
--  * Supabase SQL Editor에서 그대로 실행 (idempotent — 여러 번 실행해도 안전).
-- ============================================================

-- ── 0) 혹시 테이블이 아직 없다면 생성 (migration-console-phaseb.sql 과 동일 스키마) ──
create table if not exists public.app_events (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references public.apartments(id) on delete set null,
  profile_id    uuid,
  kind          text default 'view',
  created_at    timestamptz default now()
);
alter table public.app_events enable row level security;

drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists app_events_admin_read on public.app_events;
create policy app_events_admin_read on public.app_events
  for select to authenticated using (is_admin());

-- ── 1) 조회 성능 인덱스 ──
create index if not exists app_events_created_idx      on public.app_events (created_at desc);
create index if not exists app_events_apt_created_idx  on public.app_events (apartment_id, created_at desc);
create index if not exists app_events_kind_created_idx on public.app_events (kind, created_at desc);
create index if not exists app_events_profile_idx      on public.app_events (profile_id, created_at desc);

-- ── 2) 서버측 자동 집계 함수 ──
--     관리자(is_admin())만 실행 가능. 최근 p_days(기본 30일) 구간을 한 번에 집계해 JSON으로 반환.
--     '오늘/일별'은 한국시간(Asia/Seoul) 기준.
create or replace function public.app_usage_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res   jsonb;
  since timestamptz := now() - (greatest(p_days, 1) || ' days')::interval;
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'range_days',   greatest(p_days, 1),
    'generated_at', now(),

    -- 활성 입주민(고유 사용자) 수
    'active_today', (select count(distinct profile_id) from public.app_events
                      where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date),
    'active_7d',    (select count(distinct profile_id) from public.app_events where created_at >= now() - interval '7 days'),
    'active_30d',   (select count(distinct profile_id) from public.app_events where created_at >= now() - interval '30 days'),
    'events_total', (select count(*) from public.app_events where created_at >= since),
    'users_total',  (select count(distinct profile_id) from public.app_events where created_at >= since),

    -- 일별 추이 (한국시간 날짜별)
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'users', users, 'events', events) order by day), '[]'::jsonb)
      from (
        select (created_at at time zone 'Asia/Seoul')::date::text as day,
               count(distinct profile_id) as users,
               count(*)                   as events
        from public.app_events
        where created_at >= since
        group by 1
      ) d
    ),

    -- 단지별 사용량 (이벤트 많은 순)
    'by_apartment', (
      select coalesce(jsonb_agg(jsonb_build_object('apartment_id', apartment_id, 'users', users, 'events', events) order by events desc), '[]'::jsonb)
      from (
        select apartment_id,
               count(distinct profile_id) as users,
               count(*)                   as events
        from public.app_events
        where created_at >= since and apartment_id is not null
        group by apartment_id
      ) a
    ),

    -- 기능별 사용량 (view/report/contract/nps/kakao …)
    'by_kind', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', coalesce(kind,'view'), 'users', users, 'events', events) order by events desc), '[]'::jsonb)
      from (
        select coalesce(kind,'view') as kind,
               count(distinct profile_id) as users,
               count(*)                   as events
        from public.app_events
        where created_at >= since
        group by 1
      ) k
    )
  ) into res;

  return res;
end
$$;

grant execute on function public.app_usage_stats(int) to authenticated;
