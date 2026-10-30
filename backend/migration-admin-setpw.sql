-- 관리자가 회원 비밀번호를 재설정하는 함수 (security definer)
--  · 대시보드(콘솔)에서 sb.rpc('admin_set_password', { p_user_id, p_new_pw }) 로 호출
--  · 호출자가 관리자(admin)인지 확인한 뒤 auth.users 비밀번호를 bcrypt 로 설정
--  · 자동 생성된(모르는) 임시 비번을 관리자가 아는 비번으로 바꿀 때 사용
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_set_password(p_user_id uuid, p_new_pw text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  -- 호출자가 관리자일 때만 허용
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception '관리자만 비밀번호를 재설정할 수 있습니다.';
  end if;
  if p_new_pw is null or length(p_new_pw) < 6 then
    raise exception '비밀번호는 6자 이상이어야 합니다.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_new_pw, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
  if not found then
    raise exception '해당 회원을 찾지 못했습니다.';
  end if;
end;
$$;

revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
