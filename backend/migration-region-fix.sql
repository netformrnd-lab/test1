-- '타 단지 감리 현황' 피드: 완료된 단지 제외 + 진행 중 먼저
create or replace function public.region_activity()
returns table(region text, construction_type text, status text)
language sql security definer set search_path = public stable
as $$
  select split_part(coalesce(a.region, ''), ' ', 1) as region,
         a.construction_type, a.status
  from apartments a
  where a.status is distinct from 'done'
  order by (a.status = 'in_progress') desc, (coalesce(a.region,'') <> '') desc, a.created_at desc
  limit 12
$$;
grant execute on function public.region_activity() to anon, authenticated;
