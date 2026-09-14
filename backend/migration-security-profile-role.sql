-- 보안: 일반 사용자가 자기 profiles의 role/approved 를 바꿔
-- 관리자 권한을 탈취하는 것(권한 상승)을 차단.
-- (profiles_update_self 정책은 자기 행 수정을 허용하지만 컬럼 제한이 없어,
--  role='admin' 자가 변경이 가능했음)
-- 관리자(is_admin)만 role/approved 를 바꿀 수 있고,
-- 일반 사용자는 바꿔도 조용히 원래 값으로 되돌림(이름·전화·이메일은 그대로 수정 가능).

create or replace function public.protect_profile_privfields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.approved is distinct from old.approved then
      new.approved := old.approved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_privfields();
