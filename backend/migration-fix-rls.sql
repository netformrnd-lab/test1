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
