-- 현장현황(field_updates)에서 '감리일지 공개 시 자동 복사됐던' 항목만 제거
-- → 이제 현장현황은 직접 올린 현장사진만, 감리일지는 감리일지만 (겹침 해소)
-- (직접 올린 현장사진은 source_report_id가 비어있어 지워지지 않아요)
delete from field_updates where source_report_id is not null;
