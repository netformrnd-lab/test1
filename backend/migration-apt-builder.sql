-- 단지(apartments)에 '시공사' 컬럼 추가
-- 단지 설정에서 시공사를 입력하면 공사감리일지 PDF 머리말의 '시공사' 칸에 자동 기재됩니다.
-- Supabase SQL Editor에서 한 번만 실행하세요. (이미 있으면 그대로 두고 넘어갑니다)

alter table public.apartments
  add column if not exists builder text;

comment on column public.apartments.builder is '시공사명 (공사감리일지 PDF 머리말에 자동 기재)';
