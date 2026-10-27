-- ⚠️ PDF 일괄 올리기로 잘못 등록된 감리일지 회수(삭제) 스크립트
-- 이번 업로드 건의 공통 특징: 오늘(KST) 등록 · pdf_url 있음 · 점검내용(content) 비어있음
-- Supabase 대시보드 → SQL Editor 에서 ①먼저 미리보기 실행 → 목록 확인 → ②삭제 실행

-- ① 삭제 대상 미리보기 (반드시 먼저! 목록이 '회수할 것들'이 맞는지 눈으로 확인)
select id, title, pdf_name, apartment_id, created_at, published
from public.reports
where created_at >= '2026-10-27T00:00:00+09:00'
  and created_at <  '2026-10-28T00:00:00+09:00'
  and pdf_url is not null
  and content is null
order by created_at desc;

-- ② 위 목록이 전부 지워도 되는 것이면 실행 (되돌릴 수 없음)
delete from public.reports
where created_at >= '2026-10-27T00:00:00+09:00'
  and created_at <  '2026-10-28T00:00:00+09:00'
  and pdf_url is not null
  and content is null;
