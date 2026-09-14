-- 기기 토큰 저장을 RLS 우회(security definer) 서버 함수로 처리.
-- 같은 폰(토큰)을 다른 계정으로 로그인해도, 지금 로그인한 사람 소유로 깔끔히 저장.
-- 클라이언트는 user_id 를 보내지 않고, 서버가 auth.uid() 로 채운다.

create or replace function public.save_device_token(p_token text, p_platform text default 'android')
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or length(p_token) = 0 then return 'empty'; end if;
  if auth.uid() is null then return 'not-authenticated'; end if;
  delete from public.device_tokens where token = p_token;               -- 이전 소유 제거
  insert into public.device_tokens (token, user_id, platform, updated_at)
    values (p_token, auth.uid(), coalesce(p_platform, 'android'), now());
  return 'ok';
end;
$$;

grant execute on function public.save_device_token(text, text) to authenticated;
