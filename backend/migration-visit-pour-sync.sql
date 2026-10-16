-- 정기 방문(🔧 정기 방문) 일정을 POUR로 연동되게 분류·소스 보정 (기존 데이터 백필)
--
-- 원인: 정기 방문 일정은 category 가 비어 있어서, POUR 동기화(aptsq-sync)의
--       category→POUR노드 매핑(CATEGORY_TO_NODE[category])이 매칭을 못 찾아 건너뛰었음.
-- 해결: 정기 방문을 POUR의 'asq'(아스퀘) 노드로 보내도록 category='asq', source='aptsq' 부여.
--       (앱 표시는 제목(🔧 정기 방문) 기준이라 그대로 초록 '방문'으로 유지됨)
--
-- 새로 생기는 방문은 콘솔 코드(_visitRow)에서 이미 category='asq', source='aptsq' 로 저장됨.
-- 이 SQL은 '이미 쌓여 있던' 방문들을 한 번 보정하는 용도.

update public.schedules
   set category = 'asq',
       source   = 'aptsq'
 where title like '🔧 정기 방문%'
   and category is null;
