-- 회원 프로필의 '승인' 또는 '담당 단지'가 바뀌면 발송 Worker를 호출한다.
-- (approved 또는 apartment_id 가 실제로 변할 때만 실행 → 불필요한 호출 방지)
-- notify_push() 함수는 migration-push-tokens 이후 만든 트리거 함수를 재사용한다.

drop trigger if exists push_profiles on public.profiles;
create trigger push_profiles after update on public.profiles
  for each row
  when (old.approved is distinct from new.approved
        or old.apartment_id is distinct from new.apartment_id)
  execute function public.notify_push();
