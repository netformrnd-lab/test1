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
  order by a.created_at desc
  limit 8
$$;
grant execute on function public.region_activity() to anon, authenticated;
