-- ============================================================
-- 감리원 도장 보호 (2026-11-20, APP-2026-004)
-- 감리원 도장 이미지는 저장소 report-photos 의 stamps/<회원 id>/ 폴더에 올립니다 (콘솔 → 회원 편집 → 🔏 감리원 도장).
-- 기존 정책(report_photos_upload)은 로그인한 누구나 report-photos 에 올릴 수 있어서,
-- 이 정책을 추가해 stamps/ 폴더에는 '관리자만' 올릴 수 있게 막습니다. (다른 사진 업로드는 그대로)
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
-- ============================================================

drop policy if exists report_photos_stamp_admin_only on storage.objects;
create policy report_photos_stamp_admin_only on storage.objects
  as restrictive
  for insert to authenticated
  with check (bucket_id <> 'report-photos' or name not like 'stamps/%' or public.is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
