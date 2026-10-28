-- 테스트로 제출한 만족도(NPS) 한 건 삭제용.
-- Supabase → SQL Editor 에서 ① 목록 확인 → 지울 id 복사 → ② 삭제

-- ① 제출된 만족도 목록 (작성자·단지·별점·날짜로 테스트 건 식별)
select s.id, a.name as 단지, p.name as 작성자, s.respondent_role as 역할,
       s.overall as 전체별점, s.comment as 의견, s.created_at
from public.surveys s
left join public.apartments a on a.id = s.apartment_id
left join public.profiles  p on p.id = s.respondent_id
order by s.created_at desc;

-- ② 위에서 확인한 테스트 건의 id 를 넣고 실행 (한 건만 삭제)
-- delete from public.surveys where id = '여기에-복사한-id';

-- ───────────────────────────────────────────────
-- id가 화면에 안 보일 때: 단지+역할+날짜로 콕 집어 삭제
-- (먼저 select로 '딱 1건' 나오는지 확인 후 delete)
-- select s.id, a.name, s.respondent_role, s.overall, s.comment, s.created_at
--   from public.surveys s join public.apartments a on a.id=s.apartment_id
--  where a.name ilike '%이편한세상한강신도시2차%' and s.respondent_role='manager' and s.created_at::date='2026-07-27';
--
-- delete from public.surveys s using public.apartments a
--  where s.apartment_id=a.id and a.name ilike '%이편한세상한강신도시2차%'
--    and s.respondent_role='manager' and s.created_at::date='2026-07-27';
