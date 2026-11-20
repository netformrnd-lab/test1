-- ============================================================
-- 감리원 도장 보호 (2026-11-20, APP-2026-004)
-- 감리원 도장 이미지는 저장소 report-photos 의 stamps/<회원 id>/ 폴더에 올립니다 (콘솔 → 회원 편집 → 🔏 감리원 도장).
-- 기존 정책(report_photos_upload)은 로그인한 누구나 report-photos 에 올릴 수 있어서,
-- 아래 restrictive 정책으로 stamps/ 폴더의 올리기·바꾸기·지우기는 '관리자만' 되게 막습니다.
-- (restrictive = 기존 허용 정책과 AND 로 함께 적용 → 다른 사진 업로드·조회는 그대로)
-- public.is_admin() 정의: backend/migration-fix-rls.sql (같은 내용이 backend/migration-SETUP-ALL.sql 에도 포함)
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
-- ============================================================

-- 올리기(INSERT)
drop policy if exists report_photos_stamp_admin_only on storage.objects;
create policy report_photos_stamp_admin_only on storage.objects
  as restrictive
  for insert to authenticated
  with check (bucket_id <> 'report-photos' or name not like 'stamps/%' or public.is_admin());

-- 바꾸기(UPDATE): 바꾸기 전 위치(using)와 바꾼 뒤 위치(with check) 모두 검사
drop policy if exists report_photos_stamp_admin_update on storage.objects;
create policy report_photos_stamp_admin_update on storage.objects
  as restrictive
  for update to authenticated
  using (bucket_id <> 'report-photos' or name not like 'stamps/%' or public.is_admin())
  with check (bucket_id <> 'report-photos' or name not like 'stamps/%' or public.is_admin());

-- 지우기(DELETE)
drop policy if exists report_photos_stamp_admin_delete on storage.objects;
create policy report_photos_stamp_admin_delete on storage.objects
  as restrictive
  for delete to authenticated
  using (bucket_id <> 'report-photos' or name not like 'stamps/%' or public.is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
