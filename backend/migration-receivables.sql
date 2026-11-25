-- ============================================================
-- 미수금 관리 (콘솔 전용) — 청구 항목(receivable_items) · 운영/경영지원 메모(receivable_notes) · 계약 건 처리 상태 컬럼
-- 앱(감리원·입주자)은 이 표를 읽지 않습니다. 입금 합계는 지금처럼 site_contracts.received_amount → apartments.received_amount 로 복사됩니다.
-- 선행: backend/migration-site-contracts.sql (계약 건)  ·  Supabase → SQL Editor → Run (재실행 안전)
-- ============================================================

-- 1) 청구 항목: 계약 건마다 계약금 / (중도금) / 잔금 한 줄씩 (콘솔이 자동 생성)
create table if not exists public.receivable_items (
  id               uuid primary key default gen_random_uuid(),
  site_contract_id uuid not null references public.site_contracts(id) on delete cascade,
  apartment_id     uuid references public.apartments(id) on delete cascade,
  kind             text not null,                -- down(계약금) / mid(중도금) / final(잔금)
  amount_override  bigint,                       -- 비우면 계약금액 × 지급 비율
  request_at       date,                         -- 청구 요청일 = 회수 알림 기준일
  request_by       text,
  invoice_at       date,                         -- 세금계산서 발행일 (경영지원)
  invoice_amount   bigint,
  invoice_by       text,
  check1_at        timestamptz, check1_by text, check1_result text,   -- D+7  1차 입금 확인 (unpaid / paid)
  check2_at        timestamptz, check2_by text, check2_result text,   -- D+14 2차 입금 확인
  mail_at          date, mail_by text,                                 -- 정산 요청 메일 발송
  call_at          date, call_by text, call_note text,                 -- 메일 +3일 전화 확인
  last_check_at    date, last_check_by text,                           -- 이후 주 1회 재확인
  paid_at          date, paid_amount bigint, paid_by text,             -- 입금 (경영지원)
  status           text not null default 'open',                       -- open / paid
  note             text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (site_contract_id, kind)
);
create index if not exists receivable_items_apt_idx on public.receivable_items(apartment_id);
alter table public.receivable_items enable row level security;
drop policy if exists ri_admin_all on public.receivable_items;
create policy ri_admin_all on public.receivable_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) 운영본부 ↔ 경영지원팀 메모·회신
create table if not exists public.receivable_notes (
  id               uuid primary key default gen_random_uuid(),
  site_contract_id uuid not null references public.site_contracts(id) on delete cascade,
  apartment_id     uuid references public.apartments(id) on delete cascade,
  team             text not null default 'ops',  -- ops(운영본부) / fin(경영지원팀)
  body             text not null,
  author           text,
  created_at       timestamptz default now()
);
create index if not exists receivable_notes_sc_idx on public.receivable_notes(site_contract_id, created_at);
alter table public.receivable_notes enable row level security;
drop policy if exists rn_admin_all on public.receivable_notes;
create policy rn_admin_all on public.receivable_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) 계약 건 처리 상태 (미수금 탭)
alter table public.site_contracts add column if not exists ar_status      text;        -- check/request/mailed/wait/hold/inprog/paid, 비우면 자동
alter table public.site_contracts add column if not exists ar_next        text;        -- 다음 할 일
alter table public.site_contracts add column if not exists ar_next_due    date;
alter table public.site_contracts add column if not exists ar_hold_until  date;        -- 보류 재확인일
alter table public.site_contracts add column if not exists ar_hold_reason text;
alter table public.site_contracts add column if not exists fin_checked_at timestamptz; -- 경영지원팀 확인
alter table public.site_contracts add column if not exists fin_checked_by text;
alter table public.site_contracts add column if not exists ops_done_at    timestamptz; -- 운영 완료
alter table public.site_contracts add column if not exists ops_done_by    text;
