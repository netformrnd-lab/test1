-- ============================================================
-- 최종 점검 반영 · RLS 권한 조임 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql 을 먼저 실행한 상태에서 돌리세요.
-- ============================================================

-- 1) 만족도: 자기 소속(또는 담당) 단지에만 제출 가능 (아무 단지 통계 오염 방지)
drop policy if exists surveys_insert_self on surveys;
create policy surveys_insert_self on surveys
  for insert to authenticated with check (
    respondent_id = auth.uid()
    and (
      exists (select 1 from profiles p where p.id = auth.uid() and p.apartment_id = surveys.apartment_id)
      or exists (select 1 from apartments a where a.id = surveys.apartment_id and a.auditor_id = auth.uid())
    )
  );

-- 2) 감리사 작성물(감리일지·일정)은 '담당 단지'로만 (아무 단지에 못 쓰게)
--    ※ 관리자는 *_admin_all 로 전체 작성 가능하므로 PDF 대량등록 등에는 영향 없음
drop policy if exists "reports_write_auditor" on reports;
create policy "reports_write_auditor" on reports for insert to authenticated with check (
  apartment_id in (select id from apartments where auditor_id = auth.uid())
);
drop policy if exists "schedules_write_auditor" on schedules;
create policy "schedules_write_auditor" on schedules for insert to authenticated with check (
  apartment_id in (select id from apartments where auditor_id = auth.uid())
);

-- 3) 계약서: 담당 감리사만 자기 단지 것 읽기·쓰기 (남의 단지 계약 삭제/열람 차단)
drop policy if exists contracts_staff_read on contracts;
create policy contracts_staff_read on contracts for select to authenticated using (
  is_admin() or apartment_id in (select id from apartments where auditor_id = auth.uid())
);
drop policy if exists contracts_auditor_write on contracts;
create policy contracts_auditor_write on contracts for all to authenticated
  using (apartment_id in (select id from apartments where auditor_id = auth.uid()))
  with check (apartment_id in (select id from apartments where auditor_id = auth.uid()));

-- 4) report-photos 업로드: 감리사·관리자만 (아무 회원이 공개 버킷에 임의 파일 못 올리게)
drop policy if exists "report_photos_upload" on storage.objects;
create policy "report_photos_upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'report-photos'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('auditor','admin'))
);

-- 5) 단지 목록: 승인 회원은 '자기 단지'만 조회 (전체 단지 목록 노출 축소)
--    감리사=apartments_read_auditor, 관리자=apartments_admin_all 로 별도 커버됨
drop policy if exists "apartments_read_approved" on apartments;
create policy "apartments_read_approved" on apartments for select to authenticated using (
  id = (select apartment_id from profiles where id = auth.uid())
);

-- 완료! 'Success. No rows returned' 이면 정상입니다.
