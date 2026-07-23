-- 감리일지(reports)를 입주민 현장현황(field_updates)으로 공개하는 연결
-- field_updates에 원본 감리일지 링크 (감리일지 삭제 시 함께 제거)
alter table field_updates add column if not exists source_report_id uuid references reports(id) on delete cascade;
-- reports에 입주민 공개 설정 저장 (관리자가 카드에서 선택)
alter table reports add column if not exists pub_title text;                 -- 입주민 현장현황에 보일 제목
alter table reports add column if not exists pub_mode  text;                 -- null/''=비공개, 'photo'=사진만, 'full'=사진+글
