-- ============================================================
-- /console Phase B · 영업(CRM)·업무 로드맵·자료실 (재실행 안전)
-- Supabase → SQL Editor → 붙여넣고 Run
-- ※ migration-SETUP-ALL.sql (is_admin() 포함) 을 먼저 실행한 상태에서 돌리세요.
-- 모두 '관리자 전용' 데이터입니다.
-- ============================================================

-- ── 1) 영업 파이프라인 (sales_leads) ─────────────────────────
create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text,                     -- 단지/고객명
  region text,                   -- 지역
  contact text,                  -- 담당자·연락처
  construction_type text,        -- 예상 공종
  stage text default 'inquiry',  -- inquiry(문의) meeting(미팅) quote(견적) contract(계약) won(성사) lost(실패)
  amount bigint,                 -- 예상/계약 금액(원)
  owner text,                    -- 영업 담당
  next_action text,              -- 다음 할 일
  next_date date,                -- 다음 일정
  memo text,
  apartment_id uuid references public.apartments(id) on delete set null, -- 성사 시 연결된 단지
  sort int default 0,
  stage_changed_at timestamptz default now(), -- 마지막 단계 이동 시각(정체 딜 계산용)
  created_at timestamptz default now()
);
alter table public.sales_leads add column if not exists stage_changed_at timestamptz default now();
alter table public.sales_leads enable row level security;
drop policy if exists sales_leads_admin on public.sales_leads;
create policy sales_leads_admin on public.sales_leads for all to authenticated using (is_admin()) with check (is_admin());

-- ── 2) 업무 로드맵 (roadmap_items) ──────────────────────────
create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid references public.apartments(id) on delete cascade, -- 특정 단지(없으면 공통)
  phase text,                    -- 준비/계약/착공/시공/준공 등 단계
  title text,                    -- 할 일 제목
  status text default 'todo',    -- todo(예정) doing(진행) done(완료)
  due_date date,
  memo text,
  sort int default 0,
  created_at timestamptz default now()
);
alter table public.roadmap_items enable row level security;
drop policy if exists roadmap_items_admin on public.roadmap_items;
create policy roadmap_items_admin on public.roadmap_items for all to authenticated using (is_admin()) with check (is_admin());

-- ── 3) 자료실 (doc_files) ───────────────────────────────────
create table if not exists public.doc_files (
  id uuid primary key default gen_random_uuid(),
  category text,                 -- 분류(예: 계약양식/점검표/보고서양식)
  title text,                    -- 자료명
  file_url text,                 -- 파일 링크(report-photos 버킷 docs/) 또는 외부 URL
  kind text default 'file',      -- pdf/image/link/file
  memo text,
  sort int default 0,
  created_at timestamptz default now()
);
alter table public.doc_files enable row level security;
drop policy if exists doc_files_admin on public.doc_files;
create policy doc_files_admin on public.doc_files for all to authenticated using (is_admin()) with check (is_admin());

-- ── 4) 현장개요 + 계약·수금 (apartments 컬럼) ───────────────
alter table public.apartments add column if not exists overview text;          -- 현장개요 메모
alter table public.apartments add column if not exists contract_amount bigint; -- 총 계약금액(공사비)
alter table public.apartments add column if not exists supervision_fee bigint; -- 감리비(우리 매출)
alter table public.apartments add column if not exists received_amount bigint; -- 수금액(받은 금액) · 미수금 = 감리비-수금액

-- ── 5) 현장 히스토리 (site_notes) ───────────────────────────
create table if not exists public.site_notes (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid references public.apartments(id) on delete cascade,
  body text,                     -- 히스토리 내용(방문/통화/이슈 등)
  author_name text,              -- 작성자 표시명
  created_at timestamptz default now()
);
alter table public.site_notes enable row level security;
drop policy if exists site_notes_admin on public.site_notes;
create policy site_notes_admin on public.site_notes for all to authenticated using (is_admin()) with check (is_admin());

-- 완료! 'Success. No rows returned' 이면 정상입니다.
-- 자료실 파일은 기존 'report-photos' 버킷(공개)의 docs/ 경로에 올라갑니다. 새 버킷 필요 없어요.
