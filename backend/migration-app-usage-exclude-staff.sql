-- ============================================================
-- 입주민 앱 사용통계에서 '직원'(감리원·관리자·관리소장) 사용을 제외.
--   기존 RPC는 역할을 안 걸러서, 감리원(dj 등)이 과거에 찍은 이벤트가 통계에 섞였음.
--   → 이 함수로 교체하면 role in (auditor/admin/manager) 사용자의 이벤트는 전부 빠짐.
--   (app_events 테이블·인덱스는 그대로. 함수만 교체)
-- Supabase → SQL Editor 에 붙여넣고 Run (migration-app-usage.sql 실행 이후)
-- ============================================================
create or replace function public.app_usage_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res   jsonb;
  since timestamptz := now() - (greatest(p_days, 1) || ' days')::interval;
  staff uuid[];
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;

  -- 통계에서 제외할 직원(감리원·관리자·관리소장) id 목록
  select coalesce(array_agg(id), '{}')::uuid[] into staff
    from public.profiles where role in ('auditor','admin','manager');

  select jsonb_build_object(
    'range_days',   greatest(p_days, 1),
    'generated_at', now(),

    'active_today', (select count(distinct profile_id) from public.app_events
                      where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
                        and (profile_id is null or not (profile_id = any(staff)))),
    'active_7d',    (select count(distinct profile_id) from public.app_events where created_at >= now() - interval '7 days'
                        and (profile_id is null or not (profile_id = any(staff)))),
    'active_30d',   (select count(distinct profile_id) from public.app_events where created_at >= now() - interval '30 days'
                        and (profile_id is null or not (profile_id = any(staff)))),
    'events_total', (select count(*) from public.app_events where created_at >= since
                        and (profile_id is null or not (profile_id = any(staff)))),
    'users_total',  (select count(distinct profile_id) from public.app_events where created_at >= since
                        and (profile_id is null or not (profile_id = any(staff)))),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'users', users, 'events', events) order by day), '[]'::jsonb)
      from (
        select (created_at at time zone 'Asia/Seoul')::date::text as day,
               count(distinct profile_id) as users, count(*) as events
        from public.app_events
        where created_at >= since and (profile_id is null or not (profile_id = any(staff)))
        group by 1
      ) d
    ),

    'by_apartment', (
      select coalesce(jsonb_agg(jsonb_build_object('apartment_id', apartment_id, 'users', users, 'events', events) order by events desc), '[]'::jsonb)
      from (
        select apartment_id, count(distinct profile_id) as users, count(*) as events
        from public.app_events
        where created_at >= since and apartment_id is not null
          and (profile_id is null or not (profile_id = any(staff)))
        group by apartment_id
      ) a
    ),

    'by_kind', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', coalesce(kind,'view'), 'users', users, 'events', events) order by events desc), '[]'::jsonb)
      from (
        select coalesce(kind,'view') as kind, count(distinct profile_id) as users, count(*) as events
        from public.app_events
        where created_at >= since and (profile_id is null or not (profile_id = any(staff)))
        group by 1
      ) k
    ),

    'by_user', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'profile_id', e.profile_id, 'name', p.name, 'role', p.role,
          'apartment_id', coalesce(p.apartment_id, e.apt_any),
          'events', e.events,
          'last_at', to_char(e.last_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
          'view', e.v_view, 'report', e.v_report, 'contract', e.v_contract, 'nps', e.v_nps, 'kakao', e.v_kakao
        ) order by e.events desc), '[]'::jsonb)
      from (
        select profile_id,
               count(*) as events,
               max(created_at) as last_at,
               (array_agg(apartment_id) filter (where apartment_id is not null))[1] as apt_any,
               count(*) filter (where coalesce(kind,'view') = 'view') as v_view,
               count(*) filter (where kind = 'report')   as v_report,
               count(*) filter (where kind = 'contract') as v_contract,
               count(*) filter (where kind = 'nps')      as v_nps,
               count(*) filter (where kind = 'kakao')    as v_kakao
        from public.app_events
        where created_at >= since and profile_id is not null
          and not (profile_id = any(staff))
        group by profile_id
        order by events desc
        limit 300
      ) e
      left join public.profiles p on p.id = e.profile_id
    )
  ) into res;

  return res;
end
$$;

grant execute on function public.app_usage_stats(int) to authenticated;
