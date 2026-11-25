-- ============================================================
-- 경영지원팀 업무관리(sq-biz · 세금계산서) 연동 — 콘솔 전용
-- 거래처 명부(partners) · 계약 건 연동 칸 · 청구 항목 연동 칸 · 그쪽 계약 캐시(biz_contracts) · 동기화 로그(biz_sync_log) · 사업자등록증 버킷
-- 앱(감리원·입주자)은 이 표들을 읽지 않습니다. 입금 합계는 지금처럼 site_contracts.received_amount → apartments.received_amount 로 복사됩니다.
-- 선행: backend/migration-site-contracts.sql, backend/migration-receivables.sql  ·  Supabase → SQL Editor → Run (재실행 안전)
-- ============================================================

-- 1) 거래처 명부 — 사업자등록증 상 정식 상호 기준 (경영지원팀 세금계산서 발행 기준과 동일)
create table if not exists public.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,            -- 정식 상호 (사업자등록증)
  reg_no         text,                     -- 사업자등록번호 000-00-00000
  rep_name       text,                     -- 대표자
  email          text,                     -- 세금계산서 수신 이메일
  phone          text,
  address        text,
  biz_type       text,                     -- 업태
  biz_item       text,                     -- 종목
  biz_cert_path  text,                     -- 사업자등록증 파일 (storage: partner-docs)
  biz_cert_name  text,
  biz_cert_type  text,
  biz_cert_at    timestamptz,
  biz_cert_sent_at timestamptz,            -- 경영지원팀 시스템에 이미 첨부해 보낸 시각 (두 번째 현장부터 생략)
  note           text,
  created_by     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table public.partners enable row level security;
drop policy if exists partners_admin_all on public.partners;
create policy partners_admin_all on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) 계약 건 ↔ 거래처 · 경영지원 연동
alter table public.site_contracts add column if not exists partner_id        uuid references public.partners(id) on delete set null;
alter table public.site_contracts add column if not exists biz_sync          boolean not null default false;  -- 연동 대상(시범 현장부터 켬)
alter table public.site_contracts add column if not exists biz_contract_id   text;     -- 경영지원 시스템 계약 문서 id
alter table public.site_contracts add column if not exists biz_contract_name text;     -- 그쪽 단지명 · 계약건명 (표시용)
alter table public.site_contracts add column if not exists biz_synced_at     timestamptz;
create index if not exists site_contracts_biz_idx on public.site_contracts(biz_sync) where biz_sync;

-- 3) 청구 항목 ↔ 경영지원 발행 요청
alter table public.receivable_items add column if not exists request_kind      text;        -- down / mid / final / downAndFinal (청구 구분)
alter table public.receivable_items add column if not exists biz_group         text;        -- 계약금+잔금 한 번에 → 두 항목이 같은 값
alter table public.receivable_items add column if not exists request_memo      text;        -- 발행 사유에 덧붙일 메모
alter table public.receivable_items add column if not exists biz_push          text;        -- null / pending(전송 대기) / sent(전송됨) / error
alter table public.receivable_items add column if not exists biz_push_at       timestamptz;
alter table public.receivable_items add column if not exists biz_error         text;
alter table public.receivable_items add column if not exists biz_request_id    text;        -- 그쪽 taxInvoiceRequests 문서 id
alter table public.receivable_items add column if not exists biz_request_no    text;        -- TIR-YY-NNNN
alter table public.receivable_items add column if not exists biz_request_status text;       -- 요청 / 검토중 / 발행완료 / 반려 / 취소 / 보류
alter table public.receivable_items add column if not exists biz_reject_reason text;
alter table public.receivable_items add column if not exists biz_deposit_ids   jsonb;       -- 매칭된 입금 문서 id 목록
alter table public.receivable_items add column if not exists biz_synced_at     timestamptz;
create index if not exists receivable_items_push_idx on public.receivable_items(biz_push) where biz_push = 'pending';

-- 4) 그쪽 계약 목록 캐시 — 콘솔은 Firestore에 직접 붙지 않고(키 노출 방지) 동기화 함수가 채운 이 표로 "계약 연결"을 고릅니다
create table if not exists public.biz_contracts (
  id             text primary key,         -- Firestore 문서 id
  complex_name   text,                     -- 단지명
  contract_name  text,                     -- 계약건명
  client_name    text,                     -- 발주처(거래처)
  site_address   text,
  contract_date  text,
  total_amount   bigint,
  phases         jsonb,                    -- {downPayment:{amount,invoiceId}, interimPayment:{...}, finalPayment:{...}}
  status         text,
  updated_at     text,
  fetched_at     timestamptz default now()
);
alter table public.biz_contracts enable row level security;
drop policy if exists bizc_admin_read on public.biz_contracts;
create policy bizc_admin_read on public.biz_contracts
  for select to authenticated using (public.is_admin());
-- 쓰기는 동기화 함수(service_role)만

-- 5) 동기화 로그
create table if not exists public.biz_sync_log (
  id         bigserial primary key,
  at         timestamptz default now(),
  source     text,                         -- cron / console
  direction  text,                         -- pull / push / info
  action     text,                         -- contracts-cache / link / invoice / deposit / create-contract / create-request / error
  ref        text,                         -- 우리 쪽 id 또는 그쪽 문서 id
  site       text,                         -- 현장명 (표시용)
  ok         boolean default true,
  detail     text
);
create index if not exists biz_sync_log_at_idx on public.biz_sync_log(at desc);
alter table public.biz_sync_log enable row level security;
drop policy if exists bizlog_admin_read on public.biz_sync_log;
create policy bizlog_admin_read on public.biz_sync_log
  for select to authenticated using (public.is_admin());

-- 6) 사업자등록증 저장 버킷 (비공개 · 콘솔 관리자만)
insert into storage.buckets (id, name, public) values ('partner-docs', 'partner-docs', false) on conflict (id) do nothing;
drop policy if exists "partner_docs_admin_all" on storage.objects;
create policy "partner_docs_admin_all" on storage.objects
  for all to authenticated using (bucket_id = 'partner-docs' and public.is_admin()) with check (bucket_id = 'partner-docs' and public.is_admin());

-- 7) 시범 현장 켜기 (콘솔의 계약 건 수정 모달에서 체크해도 됩니다)
-- update public.site_contracts sc set biz_sync = true
--   from public.apartments a where a.id = sc.apartment_id and a.name in ('영통SK뷰아파트','태전e편한세상아파트');

-- ============================================================
-- 8) 10분마다 동기화 (함수 배포 뒤 실행) — pg_cron + pg_net + vault
--    ① Dashboard → Database → Extensions 에서 pg_cron, pg_net 켜기
--    ② 아래 vault 줄에 동기화 비밀값(아무 긴 문자열)을 넣어 1회 실행. 같은 값을 Edge Function Secret BIZ_SYNC_SECRET 에도 넣습니다.
--    ③ <ANON_KEY> 는 Project Settings → API 의 anon public 키 (비밀 아님)
-- ============================================================
-- select vault.create_secret('여기에-긴-임의-문자열', 'biz_sync_secret');
-- select cron.unschedule('biz-sync') where exists (select 1 from cron.job where jobname = 'biz-sync');
-- select cron.schedule('biz-sync', '*/10 * * * *', $$
--   select net.http_post(
--     url     := 'https://gndktayoicegyqyllybk.supabase.co/functions/v1/biz-sync',
--     headers := jsonb_build_object('Content-Type','application/json',
--                                   'Authorization','Bearer <ANON_KEY>',
--                                   'x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'biz_sync_secret')),
--     body    := '{"source":"cron"}'::jsonb)
-- $$);
