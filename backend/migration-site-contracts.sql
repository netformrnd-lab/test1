-- ============================================================
-- 계약 건(site_contracts) — 현장 하나 아래 계약을 여러 건 관리 (콘솔 전용)
-- 앱(감리원·입주자)은 이 표를 읽지 않습니다. 앱이 읽는 apartments.method/progress/status 는
-- 콘솔이 '지금 진행 중인 건' 값을 지금처럼 그대로 기록해 둡니다.
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
-- ============================================================

create table if not exists public.site_contracts (
  id              uuid primary key default gen_random_uuid(),
  apartment_id    uuid not null references public.apartments(id) on delete cascade,
  seq             int  not null default 1,          -- 차수 (1차, 2차 …)
  title           text,                             -- 공사명 (예: 외벽 재도장)
  methods         jsonb not null default '[]'::jsonb, -- 공법 키 목록 ["repaint","composite"]
  progress        jsonb not null default '{}'::jsonb, -- 공법별 끝낸 공정 수 {"repaint":3}
  stage           text  not null default '계약',     -- 계약 / 착공 / 공사중 / 준공처리중 / 준공
  stage_at        timestamptz default now(),
  contract_date   date,                             -- 계약일
  start_date      date,                             -- 착공일
  done_date       date,                             -- 준공일
  contract_amount bigint,                           -- 계약금액 (= 감리비)
  received_amount bigint,                           -- 수금액
  pay_ratio       jsonb,                            -- {"down":50,"mid":0,"final":50}
  checklist       jsonb not null default '{}'::jsonb, -- 준비 체크리스트 (건마다)
  memo            text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  created_by      uuid references public.profiles(id) on delete set null
);
create index if not exists site_contracts_apt_idx on public.site_contracts(apartment_id, seq);
alter table public.site_contracts enable row level security;
drop policy if exists sc_admin_all on public.site_contracts;
create policy sc_admin_all on public.site_contracts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 계약서 파일(contracts)을 계약 건에 연결 (비어 있으면 '현장 공통'으로 표시). 앱은 이 컬럼을 쓰지 않습니다.
alter table public.contracts add column if not exists site_contract_id uuid references public.site_contracts(id) on delete set null;

-- 기존 현장은 콘솔을 처음 열 때 현재 값(단계·공법·공정·금액·체크리스트)으로 1차 건이 자동 생성됩니다.
