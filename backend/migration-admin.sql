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
