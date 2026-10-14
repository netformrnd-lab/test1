-- ============================================================
-- 배포 전 정리 (안전판) — 실제 데이터 분석 결과 반영
--
-- 분석(2026-09):
--   · field_updates(현장현황) 801건 = 전부 아임웹 임포트(content 전부 비어있음) → ★유지★
--   · reports(감리일지)   153건 = 146건 임포트(내용 없는 PDF) + 7건만 앱에서 작성 → 임포트분 ★유지★
--   · apartments(단지)     32건 = 임포트 때 생성된 실단지 → ★유지★
--   · sales_leads(아임웹/영업)·schedules(POUR)·profiles(계정) → ★유지★
--
--   → '테이블째 삭제'나 '날짜 기준 삭제'는 실데이터가 날아가므로 하지 않습니다.
--      아래는 '테스트로 보이는 것'만 콕 집어 지웁니다.
--
-- ⚠️ 되돌릴 수 없습니다. 실행 전 Supabase → Database → Backups 에서 백업 확인.
-- 실행: Supabase → SQL Editor
-- ============================================================


-- ── 0) 먼저 '확인'만 (지우지 않음) — 무엇이 지워질지 눈으로 보세요 ──
-- 앱에서 직접 쓴(내용 채워진) 감리일지 = 테스트 후보:
select id, title, (select name from public.apartments a where a.id = r.apartment_id) as 단지,
       left(content, 40) as 내용미리보기, created_at
from public.reports r
where content is not null and btrim(content) <> ''
order by created_at desc;

-- 단지 목록(단지별 현장현황/감리일지 건수) — 테스트 단지 찾기용:
select a.name as 단지,
       (select count(*) from public.field_updates f where f.apartment_id = a.id) as 현장현황,
       (select count(*) from public.reports r where r.apartment_id = a.id) as 감리일지,
       a.created_at
from public.apartments a
order by a.created_at;


-- ============================================================
-- ── 1) 삭제: 채팅 기록 (채팅 기능을 카카오톡으로 대체했으므로) ──
--    채팅은 업무기록이 아니라 대화로그라 지워도 안전. 남기려면 이 블록을 통째로 주석 처리.
-- ============================================================
do $$ begin
  if to_regclass('public.chat_reads')    is not null then delete from public.chat_reads;    end if;
  if to_regclass('public.chat_messages') is not null then delete from public.chat_messages; end if;
  raise notice '채팅 기록 삭제 완료';
end $$;


-- ============================================================
-- ── 2) 선택 — 위 0)에서 확인 후, 정말 테스트가 맞으면 '--' 지우고 실행 ──
-- ============================================================

-- (선택) 앱에서 테스트로 쓴 감리일지(내용 채워진 것)만 삭제 — 임포트 PDF(내용 없음)는 보존:
--   ※ 진짜 작성한 실일지가 섞여 있을 수 있으니 위 0) 확인 후에만!
-- delete from public.reports where content is not null and btrim(content) <> '';

-- (선택) 테스트 설문(NPS) 삭제:
-- delete from public.surveys;

-- (선택) 특정 '테스트 단지'만 통째로 삭제 — 위 0)에서 이름 확인해 채워서:
-- with del as (select id from public.apartments where name in ('여기에 테스트 단지명 넣기'))
-- , _a as (delete from public.apartment_auditors where apartment_id in (select id from del))
-- , _f as (delete from public.field_updates      where apartment_id in (select id from del))
-- , _r as (delete from public.reports            where apartment_id in (select id from del))
-- delete from public.apartments where id in (select id from del);

-- ============================================================
-- 완료! 앱·대시보드에서 Ctrl+F5 로 확인.
-- ============================================================
