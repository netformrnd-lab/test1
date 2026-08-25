-- ============================================================
-- 홈페이지(아임웹) 문의 폼 → 영업 자동 등록 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-console-phaseb.sql(sales_leads 포함)을 먼저 실행한 상태에서 돌리세요.
--
-- 원리: 방문자(로그인 안 한 anon)가 폼을 제출하면 이 함수가 '문의' 단계 카드를
--       sales_leads 에 안전하게 넣어줍니다. 함수는 정해진 항목만 받고 stage 는
--       무조건 'inquiry' 로 고정하므로, 금액·단계 같은 걸 조작할 수 없어요.
-- ============================================================

create or replace function public.submit_web_inquiry(
  p_name text,                       -- 아파트(단지)명
  p_contact text default null,       -- "성함(직급) 010-0000-0000" 형태로 폼에서 합쳐 보냄
  p_construction_type text default null, -- 공사 종류
  p_region text default null,        -- 지역
  p_message text default null        -- 문의 내용
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text := nullif(btrim(coalesce(p_name,'')), '');
  ct text := nullif(btrim(coalesce(p_contact,'')), '');
begin
  if nm is null and ct is null then
    raise exception '아파트명 또는 연락처를 입력해주세요';
  end if;
  insert into public.sales_leads(name, contact, construction_type, region, memo, stage, next_action, owner)
  values (
    left(coalesce(nm, '홈페이지 문의'), 120),
    left(ct, 200),
    left(nullif(btrim(coalesce(p_construction_type,'')), ''), 120),
    left(nullif(btrim(coalesce(p_region,'')), ''), 120),
    left(nullif(btrim(coalesce(p_message,'')), ''), 2000),
    'inquiry',
    '첫 연락',
    '홈페이지'
  );
end;
$$;

-- 로그인 안 한 방문자(anon)와 로그인 사용자 모두 제출 가능
grant execute on function public.submit_web_inquiry(text, text, text, text, text) to anon, authenticated;

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 이제 홈페이지 폼에서 이 함수를 호출하면 영업 '문의' 단계에 카드가 자동으로 생겨요.
