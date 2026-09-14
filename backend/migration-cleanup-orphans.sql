-- ============================================================
-- 삭제된 단지의 남은 데이터(동·현장기록 등) 일괄 정리 · 1회 실행
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ 지금 이미 삭제된 단지의 '고아 데이터'를 지웁니다. (앞으로는 앱에서 단지 삭제 시 자동 삭제됨)
-- ============================================================

-- apartments 에 더 이상 존재하지 않는 apartment_id 를 가진 행 삭제
delete from public.dong_progress  where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.field_updates  where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.reports        where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.schedules      where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.contracts      where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.surveys        where apartment_id is not null and apartment_id not in (select id from public.apartments);
delete from public.manager_forms  where apartment_id is not null and apartment_id not in (select id from public.apartments);

-- (참고) 삭제된 단지에 배정돼 있던 회원의 소속을 비워 '없는 단지'를 가리키지 않게 정리
update public.profiles set apartment_id = null
  where apartment_id is not null and apartment_id not in (select id from public.apartments);

-- 완료! 'Success. No rows returned' 또는 삭제 건수가 뜨면 정상입니다.
