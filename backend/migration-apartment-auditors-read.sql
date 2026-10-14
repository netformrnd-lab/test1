-- 감리일지 작성 시 '담당 감리원' 자동 표시를 위해,
-- 로그인한 사용자가 apartment_auditors(단지-담당감리원 매핑)를 읽을 수 있게 한다.
-- (배정 매핑 자체는 민감정보가 아니며, 담당 감리원은 이미 입주민 앱에도 노출됨.
--  기존 aa_self_read/aa_admin 정책에 OR로 더해져 더 넓게 읽힌다.)

drop policy if exists "aa_auth_read" on public.apartment_auditors;
create policy "aa_auth_read" on public.apartment_auditors
  for select to authenticated using (true);
