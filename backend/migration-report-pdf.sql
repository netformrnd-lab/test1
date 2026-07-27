-- 감리일지 입주민 공개용 PDF (관리자가 감리사 작성 내용을 보고 문서화해서 업로드)
alter table reports add column if not exists pdf_url text;
alter table reports add column if not exists pdf_name text;
