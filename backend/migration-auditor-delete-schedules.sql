-- ============================================================
-- 감리사가 '앱에서' 우리(내부) 일정을 삭제할 수 있게 — 재실행 안전
-- Supabase → SQL Editor → 붙여넣고 Run
--
-- 배경: 기존엔 감리사가 '자기 개인 일정' 또는 '배정된 단지 일정'만 삭제 가능해서,
--       그 밖의 내부 일정(다른 단지·관리자가 만든 일정 등)은 앱에서 삭제해도
--       조용히 막혀(에러 없이) 그대로 남았습니다. 관리자 대시보드에선 지워지고요.
-- 조치: 감리사(role=auditor)는 우리 내부 일정(source가 'pour'가 아님)을 삭제할 수 있게 함.
--       ※ POUR 영업시스템에서 온 일정(source='pour')은 여기서 지워도 POUR 원본이 남아
--         보정 배치가 다시 가져오므로 제외합니다(POUR 일정은 POUR에서 삭제).
-- ============================================================

drop policy if exists "schedules_auditor_delete_internal" on public.schedules;
create policy "schedules_auditor_delete_internal" on public.schedules for delete to authenticated
  using (
    public.is_admin()
    or (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'auditor')
      and coalesce(source, 'aptsq') <> 'pour'
    )
  );

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- (기존 owner/단지 삭제 정책은 그대로 두며, 이 정책이 OR로 더해집니다.)
