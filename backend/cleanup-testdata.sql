-- ============================================================
-- 배포 전 '테스트 콘텐츠' 한 번에 정리
--   유지: sales_leads(아임웹/영업), profiles(계정), apartments(단지),
--         schedules(POUR 자동동기화), 리플렛·인증·명함·사례·공지·계약 등
--   삭제: 테스트로 쌓인 콘텐츠 — 감리일지/현장현황/채팅/동별진행/현장메모/설문
--
-- ⚠️ 되돌릴 수 없습니다. 실행 전 반드시:
--    Supabase → Database → Backups 에서 최신 백업(스냅샷) 확인.
--    (불안하면 Table Editor에서 각 테이블 Export CSV 로 먼저 내보내기)
--
-- 실행: Supabase → SQL Editor → 아래 전체 붙여넣고 Run
-- ============================================================

-- ── 1) 기본: 테스트 콘텐츠 비우기 (없는 테이블은 자동 건너뜀) ──
do $$
declare t text;
begin
  foreach t in array array[
    'chat_reads',      -- 채팅 읽음표시
    'chat_messages',   -- 채팅 메시지 (117건)
    'reports',         -- 감리일지 (153건)
    'field_updates',   -- 현장현황 (801건)
    'dong_progress',   -- 동별 진행 (198건)
    'site_notes',      -- 현장 메모
    'surveys'          -- 만족도/NPS 설문 (1건)
  ] loop
    if to_regclass('public.'||t) is not null then
      execute 'delete from public.'||t;
      raise notice '비움: %', t;
    end if;
  end loop;
end $$;

-- 여기까지만 실행해도 "테스트 콘텐츠"는 모두 정리됩니다.
-- (단지/계정/영업리드/일정은 그대로 유지)


-- ============================================================
-- ── 2) 선택 항목 — 필요할 때만 '--' 를 지우고(주석 해제) 실행 ──
--    ※ 이건 단지·계정까지 건드리므로 꼭 필요한 것만 신중히.
-- ============================================================

-- (선택) 공지·우수사례가 테스트면:
-- delete from public.notices;
-- delete from public.cases;

-- (선택) 공사관리(control_sites) 테스트 데이터 비우기:
-- delete from public.control_sites;

-- (선택) 로드맵 테스트:
-- delete from public.roadmap_items;
-- delete from public.roadmap_manual;

-- (선택) 특정 '테스트 단지'만 삭제 — 남길 단지는 빼고 이름을 정확히 채워서:
--   단지를 지우면 그 단지의 배정도 함께 지워야 FK 오류가 안 납니다.
-- with del as (select id from public.apartments where name in ('테스트단지','데모','샘플'))
-- , _a as (delete from public.apartment_auditors where apartment_id in (select id from del))
-- delete from public.apartments where id in (select id from del);

-- ============================================================
-- 완료! 'Success' 이면 정상. 앱/대시보드에서 Ctrl+F5 로 확인하세요.
-- ============================================================
