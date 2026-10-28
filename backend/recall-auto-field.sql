-- 자동 생성됐던 현장현황(사진) 항목 정리
--  · 감리일지 '공개'로 자동 생성된 현장현황만 지웁니다(source_report_id 가 있는 것).
--  · 손으로 올린 현장기록(예: '20261026 [램프 수성...]')은 source_report_id 가 비어 있어 그대로 남습니다.
--  · 실행 후, 대시보드에서 해당 감리일지를 다시 '공개'하면 입력한 제목으로 깔끔하게 다시 생깁니다.
-- Supabase → SQL Editor → 붙여넣고 Run
delete from public.field_updates where source_report_id is not null;
