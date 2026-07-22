-- 입주민이 담당 감리사에게 전화·문자할 수 있도록 "전화번호만" 안전하게 반환
-- (profiles 테이블 전체를 노출하지 않고, 담당 단지의 감리사 번호만 SECURITY DEFINER로 조회)
create or replace function public.apartment_auditor_phone(apt uuid)
returns text language sql security definer set search_path = public stable
as $$ select p.phone from apartments a join profiles p on p.id = a.auditor_id where a.id = apt; $$;
grant execute on function public.apartment_auditor_phone(uuid) to anon, authenticated;
