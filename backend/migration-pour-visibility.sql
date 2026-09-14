-- ============================================================
-- POUR 영업일정이 감리사/관리자 앱 캘린더에도 보이게 (읽기 권한)
--
--  문제:  POUR 에서 넘어온 일정은 특정 단지가 아니라 '회사 전체 일정'이라
--         apartment_id 가 비어(null) 있음. 그런데 기존 권한 규칙은
--         감리사에게 '담당 단지 일정'만 보여줘서, POUR 일정이 감리사에겐
--         하나도 안 보였음(관리자만 보였음).
--  해결:  source='pour' 인 일정을 감리사·관리자가 볼 수 있는 전용 읽기 정책 추가.
--         입주민에겐 여전히 안 보임.
--
--  Supabase → SQL Editor → 이 파일 하나만 붙여넣고 Run  (여러 번 돌려도 안전)
-- ============================================================

-- 0) 연동용 칸 보장 (migration-schedule-visibility.sql 를 안 돌렸어도 여기서 챙김) ---
alter table public.schedules add column if not exists resident_visible boolean not null default false;
alter table public.schedules add column if not exists source          text;         -- 'aptsq' | 'pour'
alter table public.schedules add column if not exists sync_id         text;         -- 외부 연동 매핑용
alter table public.schedules add column if not exists ext_updated_at  timestamptz;  -- 외부 수정 시각
create index if not exists schedules_sync_id_idx on public.schedules(sync_id);
alter table public.schedules replica identity full;   -- 삭제 실시간 반영에 필요

-- 1) 감리사·관리자는 POUR 영업일정(회사 전체)을 캘린더에서 볼 수 있게 --------------
drop policy if exists "schedules_read_pour_staff" on public.schedules;
create policy "schedules_read_pour_staff" on public.schedules for select to authenticated using (
  source = 'pour'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('auditor','admin') and p.approved
  )
);

-- 참고:
--  · 입주민에겐 POUR 일정이 여전히 안 보입니다(이 정책은 감리사·관리자에게만 허용).
--  · 관리자(schedules_admin_all)는 원래 전부 보이므로 이 정책은 감리사에게 의미가 큽니다.
--  · 앱 캘린더에서 POUR 일정은 빨간색으로 표시됩니다(📣 영업).
