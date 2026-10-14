-- 감리일지(reports) 회차 자동화용 '공종' 컬럼
-- 회차는 «단지 + 공종» 기준으로 센다(남대전 옥상방수 1차·2차·3차…).
-- 점검앱/대시보드가 저장 시 worktype 을 채우고, 대시보드는 '같은 단지+공종의 생성순 위치'로
-- 1,2,3회차를 자동 표시한다. (기존 행은 worktype 이 비어 있어 단지별로 묶여 번호가 매겨짐)

alter table public.reports add column if not exists worktype text;

create index if not exists reports_apt_worktype_idx
  on public.reports (apartment_id, worktype, created_at);
