-- 감리일지 '대표 사진' 지정용 컬럼.
-- reports.photos(전체 현장 사진) 중에서 PDF(공사감리일지 사진대지)에 실을 사진만 골라 담는다.
-- 비어 있으면(지정 안 함) 기존처럼 전체 사진이 PDF에 들어간다.
alter table public.reports add column if not exists cover_photos jsonb;
