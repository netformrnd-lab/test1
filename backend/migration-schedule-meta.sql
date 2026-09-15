-- ============================================================
-- POUR식 분류별 상세 일정: 일정에 meta(jsonb) + 단지에 주소(address) 추가
--   · schedules.meta : POUR 노드로 보낼 상세 필드 세트(현장명/공종/주소/요청사/참여인원/
--                       경쟁사/공고문공법/담당자[]/일정타입 등)를 그대로 담는다.
--                       → 동기화 시 meta 를 그대로 POUR RTDB 모양으로 전송.
--   · apartments.address : 단지 주소(일정 등록 시 자동입력용).
-- Supabase → SQL Editor → 붙여넣고 Run (여러 번 실행해도 안전)
-- ============================================================
alter table public.schedules  add column if not exists meta    jsonb;
alter table public.apartments add column if not exists address text;
