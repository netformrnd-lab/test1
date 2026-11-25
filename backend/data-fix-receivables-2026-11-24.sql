-- ============================================================
-- 미수금 확인표(2026-11-24 · 경영지원팀 회신 반영) → 청구 항목 데이터 보정
-- 운영본부가 경영지원팀 대시보드를 보고 정리한 발행·입금 내역을 receivable_items / site_contracts 에 채웁니다.
-- 선행: migration-receivables.sql, migration-biz-sync.sql 실행 + 콘솔을 한 번 열어 청구 항목이 자동 생성된 뒤 실행
-- 재실행 안전(같은 값을 다시 씀). 사람이 콘솔에서 직접 적은 값이 있어도 이 확인표 값으로 덮어씁니다(확인표가 더 최신).
-- 날짜를 모르는 발행·입금은 기준일 2026-11-24 로 넣고 메모에 '일자 미확인'을 남깁니다. 경영지원 연동이 붙으면 그쪽 실제 날짜로 자동 교정됩니다(invoice_by/paid_by 를 비워 둠).
-- 실행 뒤 맨 아래 SELECT 결과(처리 보고)를 확인하세요. '현장 못 찾음'이 있으면 그 줄만 현장명을 맞춰 다시 실행하면 됩니다.
-- ============================================================

drop table if exists fx_items; drop table if exists fx_contracts; drop table if exists fx_report;
create temp table fx_items (
  site text, kind text, amount_override bigint, request_at date, invoice_at date, invoice_amount bigint,
  paid_at date, paid_amount bigint, paid_full boolean default false, check_unpaid boolean default false, mail_at date, note text
);
create temp table fx_contracts (
  site text, pay_ratio jsonb, ar_status text, ar_hold_until date, ar_hold_reason text, ar_next text, pick text  -- pick: done(준공 건) / live(진행 건) / null(대표 건)
);
create temp table fx_report (ord serial, site text, result text);


-- ───────── 계약 건 설정 (지급 비율 · 처리 상태 · 다음 할 일) ─────────
insert into fx_contracts (site, pay_ratio, ar_status, ar_hold_until, ar_hold_reason, ar_next, pick) values
 ('가온12단지더하이스트', null, 'hold', '2026-12-09', '이사님 확인 중 · 다온건축으로 계약금 받았는지 조이사님 확인 중', null, null),
 ('세종 도램마을 1단지', null, 'hold', '2026-12-09', '이슈 현장으로 청구 보류 · 조이사님 시공사 확인 예정', null, null),
 ('성남 위례역푸르지오 4,5,6단지 아파트', null, 'mailed', null, null, '잔금 정산 재요청 메일(11/24) 회신 확인 · 11/27 전화', null),
 ('서울 삼성 광나루 아파트', '{"down":34,"mid":33,"final":33}', null, null, null, null, null),
 ('용인 신봉동부센트레빌5단지', '{"down":0,"mid":0,"final":100}', null, null, null, null, null),
 ('용인 장미마을 래미안2차 아파트', '{"down":30,"mid":0,"final":70}', null, null, null, null, null),
 ('수원 영통SK뷰아파트', null, null, null, null, '계약서 재작성 진행 확인 → 완료 후 청구 (계약금 4,000,000원 VAT별도 기준)', null),
 ('마포 동양엔파트(방수)', null, null, null, null, '계약금액 · 보증금 차감 여부 확인 → 실제 받을 금액 확정 후 미수 반영', null),
 ('시흥 해가든더클래식', null, null, null, null, '계약금 1,375,000원(26.6.17 발행) 5개월 미입금 · 재요청 메일 발송 여부 결정', null),
 ('창원 중리동신1차아파트(재도장)', null, null, null, null, null, 'done'),
 ('창원 중리동신1차아파트(보도블럭)', null, null, null, null, null, 'live');

-- ───────── 청구 항목 값 (금액은 VAT 포함 · 원) ─────────
-- paid_full=true: 그 항목 금액 전액 입금 처리(입금일 모르면 paid_at 비움). check_unpaid=true: 1차·2차 확인 '미입금'으로 기록(→ 다음 단계 메일 작성).
insert into fx_items (site, kind, amount_override, request_at, invoice_at, invoice_amount, paid_at, paid_amount, paid_full, check_unpaid, mail_at, note) values
 -- 준공 현장
 ('가온12단지더하이스트','down',null,'2025-12-22','2025-12-22',1375000,'2025-12-26',1375000,false,false,null,'경영지원팀 회신: 계산서 25.12.22 발행 · 25.12.26 입금'),
 ('성남 위례역푸르지오 4,5,6단지 아파트','down',null,'2026-11-24','2026-11-24',null,null,1760000,false,true,'2026-11-24','확인표 11-24: 전액 발행(발행일 미확인) · 1,760,000원 입금 · 잔금 정산 재요청 메일 26.11.24'),
 ('성남 위례역푸르지오 4,5,6단지 아파트','final',null,'2026-11-24','2026-11-24',null,null,null,false,true,'2026-11-24','확인표 11-24: 발행(발행일 미확인) · 미입금 · 정산 재요청 메일 26.11.24'),
 ('용인 신갈신미주아파트','down',null,'2026-11-19','2026-11-20',null,null,null,false,false,null,'확인표 11-24: 11/19 청구 · 계산서 11/20 발행 (계약금·잔금 함께)'),
 ('용인 신갈신미주아파트','final',null,'2026-11-19','2026-11-20',null,null,null,false,false,null,'확인표 11-24: 11/19 청구 · 계산서 11/20 발행 (계약금·잔금 함께)'),
 ('창원 중리동신1차아파트(재도장)','down',null,'2025-10-15','2025-10-15',2200000,'2025-10-16',2200000,false,false,null,'경영지원팀 회신: 계산서 25.10.15 · 입금 25.10.16'),
 ('창원 중리동신1차아파트(재도장)','final',null,'2026-08-28','2026-09-28',2200000,'2026-08-28',2200000,false,false,null,'경영지원팀 회신: 입금 26.8.28 · 계산서 26.9.28'),
 ('서울 삼성 광나루 아파트','down',1100000,'2025-12-18','2025-12-18',1100000,null,null,true,false,null,'경영지원팀 회신: 계산서 25.12.18 110만원 · 전액 입금(입금일 미기재)'),
 ('서울 삼성 광나루 아파트','mid',1100000,'2026-05-06','2026-05-06',1100000,null,null,true,false,null,'경영지원팀 회신: 계산서 26.5.6 110만원 · 전액 입금(입금일 미기재)'),
 ('서울 삼성 광나루 아파트','final',1100000,'2026-08-19','2026-08-19',1100000,null,null,true,false,null,'경영지원팀 회신: 계산서 26.8.19 110만원 · 전액 입금(입금일 미기재)'),
 ('세종 조치원자이아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'경영지원팀 회신: 전액 발행·입금 (일자 미기재)'),
 ('세종 조치원자이아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'경영지원팀 회신: 전액 발행·입금 (일자 미기재)'),
 ('이천 증포신한아파트','down',null,'2026-04-24','2026-04-24',1100000,'2026-04-24',1100000,false,false,null,'경영지원팀 회신: 4/24 발행·입금'),
 ('이천 증포신한아파트','final',null,'2026-09-08','2026-09-08',1100000,'2026-09-23',1100000,false,false,null,'경영지원팀 회신: 9/8 발행 · 9/23 입금'),
 ('동탄역시범리슈빌아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('동탄역시범리슈빌아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('둔촌현대4차아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('둔촌현대4차아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('마포 동양엔파트(방수)','final',2200000,'2026-04-22','2026-04-22',2200000,null,null,false,true,null,'확인표 11-24: 잔금 2,200,000원 계산서 26.4.22 발행 후 입금 기록 없음 · 계약금액 미기재 · 보증금 차감 여부 확인'),
 ('소하동양아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('소하동양아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('여주 하리현대아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('여주 하리현대아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('의정부 산들마을 서광청구아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('의정부 산들마을 서광청구아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('인천 송도캐슬앤해모로아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 미수령으로 잔금 때 총액 청구 · 전액 발행 · 미수 0'),
 ('인천 송도캐슬앤해모로아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 잔금 때 총액 청구 · 전액 발행 · 미수 0'),
 ('평택 비전지웰푸르지오아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 ('평택 비전지웰푸르지오아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 전액 발행 · 미수 0 (일자 미확인)'),
 -- 준공처리 현장
 ('용인 신봉동부센트레빌5단지','final',null,'2026-11-24','2026-11-24',null,null,null,false,false,null,'확인표 11-24: 잔금 100%로 전액 발행(발행일 미확인) · 미입금'),
 ('용인 장미마을 래미안2차 아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 1,320,000원 입금(일자 미확인)'),
 ('용인 장미마을 래미안2차 아파트','final',null,'2026-11-24','2026-11-24',null,null,null,false,false,null,'확인표 11-24: 중도금 1,600,000원 포함 잔금 3,080,000원 청구·발행 완료 · 미입금'),
 ('고양 강선6단지금호한양','down',null,'2026-11-18','2026-11-18',null,null,null,false,false,null,'확인표 11-24: 11/18 청구 요청 · 계산서 발행 완료 (계약금·잔금 함께)'),
 ('고양 강선6단지금호한양','final',null,'2026-11-18','2026-11-18',null,null,null,false,false,null,'확인표 11-24: 11/18 청구 요청 · 계산서 발행 완료 (계약금·잔금 함께)'),
 ('여수 신월금호타운아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 발행·입금 (일자 미확인) · 잔금은 청구 전'),
 ('청담삼성1차아파트','down',null,'2026-11-11','2026-11-11',null,null,null,false,false,null,'확인표 11-24: 전액 발행 · 잔금 계산서 26.11.11 · 미입금'),
 ('청담삼성1차아파트','final',null,'2026-11-11','2026-11-11',null,null,null,false,false,null,'확인표 11-24: 잔금 계산서 26.11.11 발행 · 미입금'),
 ('수원 매탄임광아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 입금 (일자 미확인)'),
 ('수원 매탄임광아파트','final',null,'2026-11-24','2026-11-24',null,null,null,false,false,null,'확인표 11-24: 잔금 전액 발행 처리(발행일 미확인) · 미입금'),
 ('인천 옥련현대4차아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'경영지원팀 회신: 계약금 발행·입금 (일자 미확인)'),
 ('인천 옥련현대4차아파트','final',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'경영지원팀 회신: 잔금 1,100,000원 입금 확인'),
 -- 진행중 현장
 ('시흥 해가든더클래식','down',null,'2026-06-17','2026-06-17',1375000,null,null,false,true,null,'확인표 11-24: 계약금 계산서 26.6.17 발행 후 5개월 미입금'),
 ('김포 이편한세상한강신도시2차아파트','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 2,475,000원 발행·입금 (일자 미확인)'),
 ('홍도동신동아파밀리에','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 1,980,000원 발행·입금 (일자 미확인)'),
 ('창원 중리동신1차아파트(보도블럭)','down',null,'2026-11-24','2026-11-24',null,null,null,true,false,null,'확인표 11-24: 계약금 1,760,000원 발행·입금 (일자 미확인)');

-- ───────── 적용 ─────────
do $$
declare
  r record; apt record; sc record; it record;
  v_norm text; v_cnt int; v_ratio jsonb; v_amt bigint; v_down bigint; v_mid bigint; v_final bigint; v_ca bigint; v_paid bigint; v_status text; v_pick text;
  f_norm text := $f$lower(regexp_replace(regexp_replace(%s, '\([^)]*\)', '', 'g'), '\s|아파트|apt|·|-|_', '', 'gi'))$f$;
  by_tag constant text := '확인표 2026-11-24';
begin
  for r in (select distinct site from fx_items union select site from fx_contracts) loop
    -- 1) 현장 찾기: 괄호·공백·'아파트' 를 뺀 이름이 정확히 같은 현장 → 없으면 포함 관계
    execute format('select count(*) from public.apartments where %s = %s', format(f_norm,'name'), format(f_norm,'$1')) into v_cnt using r.site;
    if v_cnt = 0 then
      execute format('select count(*) from public.apartments where %s like ''%%''||%s||''%%'' or %s like ''%%''||%s||''%%''', format(f_norm,'name'), format(f_norm,'$1'), format(f_norm,'$1'), format(f_norm,'name')) into v_cnt using r.site;
      if v_cnt <> 1 then insert into fx_report(site,result) values (r.site, case when v_cnt=0 then '현장 못 찾음 — 콘솔 현장명과 다름' else '비슷한 현장이 '||v_cnt||'곳 — 수동 확인' end); continue; end if;
      execute format('select id,name from public.apartments where %s like ''%%''||%s||''%%'' or %s like ''%%''||%s||''%%'' limit 1', format(f_norm,'name'), format(f_norm,'$1'), format(f_norm,'$1'), format(f_norm,'name')) into apt using r.site;
    elsif v_cnt > 1 then
      -- 같은 이름이 여럿(예: 창원 중리동신1차 재도장/보도블럭이 현장 2개로 등록된 경우): 괄호까지 정확히 같은 이름 우선
      execute format('select id,name from public.apartments where lower(replace(name,'' '','''')) = lower(replace($1,'' '','''')) limit 1') into apt using r.site;
      if apt.id is null then insert into fx_report(site,result) values (r.site, '같은 이름 현장 '||v_cnt||'곳 — 수동 확인'); continue; end if;
    else
      execute format('select id,name from public.apartments where %s = %s limit 1', format(f_norm,'name'), format(f_norm,'$1')) into apt using r.site;
    end if;

    -- 2) 계약 건 고르기
    select pick into v_pick from fx_contracts where site = r.site;
    if v_pick = 'done' then
      select * into sc from public.site_contracts where apartment_id = apt.id and stage = '준공' order by seq desc limit 1;
    elsif v_pick = 'live' then
      select * into sc from public.site_contracts where apartment_id = apt.id and stage <> '준공' order by seq desc limit 1;
    else
      select * into sc from public.site_contracts where apartment_id = apt.id order by (stage <> '준공') desc, seq desc limit 1;
    end if;
    if sc.id is null then insert into fx_report(site,result) values (r.site, apt.name||' — 계약 건 없음(콘솔을 한 번 열어 자동 생성 후 재실행)'); continue; end if;

    -- 3) 계약 건 설정
    update public.site_contracts s set
      pay_ratio = coalesce(c.pay_ratio, s.pay_ratio),
      ar_status = case when c.ar_status is not null then c.ar_status else s.ar_status end,
      ar_hold_until = case when c.ar_status = 'hold' then c.ar_hold_until else s.ar_hold_until end,
      ar_hold_reason = case when c.ar_status = 'hold' then c.ar_hold_reason else s.ar_hold_reason end,
      ar_next = coalesce(c.ar_next, s.ar_next),
      updated_at = now()
    from fx_contracts c where c.site = r.site and s.id = sc.id;
    select * into sc from public.site_contracts where id = sc.id;

    -- 금액 계산 (콘솔 paySplit 과 같은 규칙)
    v_ratio := coalesce(sc.pay_ratio, '{"down":50,"mid":0,"final":50}'::jsonb);
    v_ca := coalesce(sc.contract_amount, 0);
    v_down := round(v_ca * coalesce((v_ratio->>'down')::numeric,50) / 100);
    v_mid := round(v_ca * coalesce((v_ratio->>'mid')::numeric,0) / 100);
    v_final := greatest(0, v_ca - v_down - v_mid);

    -- 4) 항목 보정
    for it in (select * from fx_items where site = r.site) loop
      insert into public.receivable_items (site_contract_id, apartment_id, kind) values (sc.id, apt.id, it.kind) on conflict (site_contract_id, kind) do nothing;
      v_amt := coalesce(it.amount_override, case it.kind when 'down' then v_down when 'mid' then v_mid else v_final end);
      v_paid := case when it.paid_full then v_amt else it.paid_amount end;
      v_status := case when v_paid is not null and v_amt > 0 and v_paid >= v_amt then 'paid' else 'open' end;
      update public.receivable_items i set
        amount_override = coalesce(it.amount_override, i.amount_override),
        request_at = coalesce(it.request_at, i.request_at), request_by = case when it.request_at is not null then by_tag else i.request_by end,
        request_kind = coalesce(i.request_kind, it.kind),
        invoice_at = coalesce(it.invoice_at, i.invoice_at), invoice_amount = coalesce(it.invoice_amount, case when it.invoice_at is not null then v_amt end, i.invoice_amount), invoice_by = null,
        paid_amount = coalesce(v_paid, i.paid_amount), paid_at = coalesce(it.paid_at, i.paid_at), paid_by = null,
        status = case when v_paid is not null then v_status else i.status end,
        check1_at = case when it.check_unpaid then coalesce(i.check1_at, now()) else i.check1_at end, check1_result = case when it.check_unpaid then 'unpaid' else i.check1_result end, check1_by = case when it.check_unpaid then coalesce(i.check1_by, by_tag) else i.check1_by end,
        check2_at = case when it.check_unpaid then coalesce(i.check2_at, now()) else i.check2_at end, check2_result = case when it.check_unpaid then 'unpaid' else i.check2_result end, check2_by = case when it.check_unpaid then coalesce(i.check2_by, by_tag) else i.check2_by end,
        mail_at = coalesce(it.mail_at, i.mail_at), mail_by = case when it.mail_at is not null then coalesce(i.mail_by, by_tag) else i.mail_by end,
        note = left(concat_ws(E'\n', nullif(i.note,''), '['||by_tag||'] '||it.note), 2000),
        updated_at = now()
      where i.site_contract_id = sc.id and i.kind = it.kind;
      insert into fx_report(site,result) values (r.site, apt.name||' · '||sc.stage||' · '||it.kind||' → 금액 '||v_amt||coalesce(' · 발행 '||it.invoice_at::text,'')||coalesce(' · 입금 '||v_paid::text,'')||case when v_status='paid' and v_paid is not null then ' (입금 완료)' else '' end);
    end loop;
    if not exists (select 1 from fx_items where site = r.site) then insert into fx_report(site,result) values (r.site, apt.name||' · 계약 건 설정만 반영'); end if;

    -- 5) 입금 합계 → 계약 건 수금액 → 현장 수금액 (콘솔 규칙과 동일)
    update public.site_contracts s set received_amount = (select coalesce(sum(paid_amount),0) from public.receivable_items where site_contract_id = s.id), updated_at = now() where s.id = sc.id;
    update public.apartments a set received_amount = (select coalesce(sum(received_amount),0) from public.site_contracts where apartment_id = a.id) where a.id = apt.id;
  end loop;
end $$;

-- 처리 보고
select ord, site as "확인표 현장명", result as "결과" from fx_report order by ord;
