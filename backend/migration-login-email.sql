-- ============================================================
-- 아이디 로그인 유지 + 이메일 기반 비밀번호 재설정
-- Supabase → SQL Editor → 전체 붙여넣기 → Run (여러 번 실행해도 안전)
-- ============================================================

-- 1) profiles.username(아이디) 컬럼 + 기존 회원 백필 --------------------
alter table profiles add column if not exists username text;
-- 기존 회원은 로그인 이메일이 '아이디@aptsquare.app' 형태라 앞부분이 곧 아이디
update profiles set username = split_part(email, '@', 1)
  where (username is null or username = '') and email is not null;
create index if not exists profiles_username_idx on profiles (lower(username));

-- 2) 가입 트리거: 이름·연락처·(실제)이메일·아이디(username) 저장 -----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone, email, username)
  values (new.id,
          new.raw_user_meta_data->>'name',
          new.raw_user_meta_data->>'phone',
          new.email,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        email    = coalesce(excluded.email, public.profiles.email);
  return new;
end; $$;

-- 3) 로그인용: 아이디(username) → 로그인 이메일 반환 ---------------------
create or replace function public.login_email(uname text)
returns text language sql security definer set search_path = public stable as $$
  select email from profiles where lower(username) = lower(uname) limit 1
$$;
grant execute on function public.login_email(text) to anon, authenticated;

-- 4) 아이디 찾기: 연락처(숫자만 비교) → 아이디 목록 --------------------
create or replace function public.find_login_ids(p_phone text)
returns table(username text) language sql security definer set search_path = public stable as $$
  select username from profiles
   where username is not null
     and regexp_replace(coalesce(phone, ''),  '[^0-9]', '', 'g') =
         regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
     and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') <> ''
$$;
grant execute on function public.find_login_ids(text) to anon, authenticated;

-- 완료! 'Success. No rows returned' 이 뜨면 정상입니다.
