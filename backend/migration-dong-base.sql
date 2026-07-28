-- 단지별 '동 번호 100단위 보정' 설정
-- 예: 세종조치원처럼 동이 121·112동인데 제목엔 21·12동으로 짧게 적히는 단지 → 100 지정
-- (2자리 동을 자동으로 1xx동으로 보정)
alter table apartments add column if not exists dong_base int;
