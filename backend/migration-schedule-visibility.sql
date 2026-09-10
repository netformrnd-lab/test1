-- ============================================================
-- 일정 공개 범위: 입주민에겐 '지정한(공개)' 일정만 보이게
--   + 외부 일정 시스템(POUR 영업일정) 연동 대비 칸 추가
-- Supabase → SQL Editor → 붙여넣고 Run
-- ============================================================

-- 1) 칸 추가 -------------------------------------------------
alter table public.schedules add column if not exists resident_visible boolean not null default false;  -- 입주민 공개 여부(기본 비공개)
alter table public.schedules add column if not exists source          text;         -- 'aptsq' | 'pour' (어디서 온 일정인지)
alter table public.schedules add column if not exists sync_id         text;         -- 외부 시스템 일정 매핑용(양방향 연동 대비)
alter table public.schedules add column if not exists ext_updated_at  timestamptz;  -- 외부에서 수정된 시각(충돌 판정용)
create index if not exists schedules_sync_id_idx on public.schedules(sync_id);

-- 2) 기존 데이터 표시 ---------------------------------------
--   우리 앱에서 만든 기존 일정은 'aptsq'로 표시
update public.schedules set source = 'aptsq' where source is null;

--   [현재 동작 보존] 지금까지 입주민이 보던 '단지 일정'은 그대로 보이게 유지한다.
--   (이번 '기본 비공개'는 앞으로 새로 만드는 일정에 적용됨)
--   ※ 기존 것도 전부 숨기고 깨끗하게 시작하려면 이 UPDATE 를 지우면 됩니다.
update public.schedules
   set resident_visible = true
 where apartment_id is not null and source = 'aptsq' and resident_visible = false;

-- 3) 읽기 권한(RLS) 재정의 ----------------------------------
--   기존 '단지 일정' 통합 정책을 '입주민(공개된 것만)' + '감리사(전부)'로 분리
drop policy if exists "schedules_read_apartment" on public.schedules;

--   입주민: 우리 단지 + resident_visible = true 인 일정만
drop policy if exists "schedules_read_resident" on public.schedules;
create policy "schedules_read_resident" on public.schedules for select using (
  apartment_id is not null
  and resident_visible = true
  and apartment_id = (select apartment_id from profiles where id = auth.uid())
);

--   감리사: 담당 단지 일정은 공개 여부와 무관하게 전부
drop policy if exists "schedules_read_auditor_apt" on public.schedules;
create policy "schedules_read_auditor_apt" on public.schedules for select using (
  apartment_id is not null
  and apartment_id in (select id from apartments where auditor_id = auth.uid())
);

-- 참고:
--  · 개인 일정(schedules_read_owner) · 관리자 전체(schedules_admin_all) 정책은 그대로 유지됩니다.
--  · 앞으로 POUR 영업일정을 끌어와도 source='pour' + resident_visible=false 로 들어와
--    입주민에겐 원천적으로 안 보입니다. (감리사/관리자만 열람)
