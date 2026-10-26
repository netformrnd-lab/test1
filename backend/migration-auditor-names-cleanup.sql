-- ============================================================
-- 감리원 이름 정리 — '조현식/대표', '이필선본부장' 처럼 직함이 섞인 이름을 이름만으로 통일
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
-- 대상: 조현식, 황윤선, 이필선, 한준엽, 김성민, 정정훈, 김영성
-- 이름은 profiles.name 한 곳에만 있어서 여기만 고치면 콘솔(대표 감리원·일괄배정·배치표)과
-- 감리원·입주민 앱에 모두 같은 이름으로 보입니다.
-- ============================================================

-- 1) 먼저 어떤 행이 바뀔지 확인 (실행 결과를 보고 이상 없으면 2)로)
select id, name, role, email
from public.profiles
where name ~ '(조현식|황윤선|이필선|한준엽|김성민|정정훈|김영성)'
  and name not in ('조현식','황윤선','이필선','한준엽','김성민','정정훈','김영성')
order by name;

-- 2) 통일: 이름에 해당 성명이 들어 있으면 성명만 남김
update public.profiles set name = '조현식' where name ~ '조현식' and name <> '조현식';
update public.profiles set name = '황윤선' where name ~ '황윤선' and name <> '황윤선';
update public.profiles set name = '이필선' where name ~ '이필선' and name <> '이필선';
update public.profiles set name = '한준엽' where name ~ '한준엽' and name <> '한준엽';
update public.profiles set name = '김성민' where name ~ '김성민' and name <> '김성민';
update public.profiles set name = '정정훈' where name ~ '정정훈' and name <> '정정훈';
update public.profiles set name = '김영성' where name ~ '김영성' and name <> '김영성';

-- 3) 확인
select name, role, count(*) from public.profiles
where name in ('조현식','황윤선','이필선','한준엽','김성민','정정훈','김영성')
group by name, role order by name;

-- 완료! 콘솔을 새로고침하면 바뀐 이름으로 보입니다.
