-- ============================================================
-- 관리자 콘솔 디자인 개편(2026-11) — 콘솔 전용 추가분. 앱(감리원·입주자)은 이 컬럼·테이블을 읽지 않습니다.
-- Supabase → SQL Editor → 붙여넣고 Run (재실행 안전)
-- ============================================================

-- 1) 현장 상세 '단계별 준비 체크리스트' 저장 (팀 공유용 · 단지별)
--    형태: {"contract-0": {"by":"조현식","at":"2026-11-04T01:23:45Z"}, "docs-3": true, ...}
alter table public.apartments add column if not exists checklist jsonb default '{}'::jsonb;

-- 2) 현장 정보 카드 · 안내문구 {공사명} 빈칸용
alter table public.apartments add column if not exists work_name text;

-- 3) 안내문구(이메일) 템플릿
create table if not exists public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 문구 이름 (예: 착공서류 요청)
  category    text not null default '기타',  -- 계약 / 착공서류 / 기성금 / 준공 / 기타
  subject     text,                          -- 메일 제목 ({현장명} 같은 빈칸 가능)
  body        text,                          -- 본문
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  created_by  uuid references public.profiles(id) on delete set null
);
alter table public.message_templates enable row level security;
drop policy if exists mt_admin_all on public.message_templates;
create policy mt_admin_all on public.message_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) 처음 문구 4개 (표가 비어 있을 때만 1회)
insert into public.message_templates (name, category, subject, body)
select * from (values
  ('계약금 청구','계약','[{현장명}] 계약금 청구서 송부',
   E'안녕하세요, {시공사} 담당자님.\n{보내는사람}입니다.\n\n{현장명} {공사명} 감리 계약과 관련하여 계약금 청구서를 보내드립니다.\n\n- 계약금액: {계약금액}\n- 청구 금액(계약금 50%): {계약금}\n\n확인 부탁드립니다.\n\n감사합니다.\n{보내는사람} 드림'),
  ('착공서류 요청','착공서류','[{현장명}] 착공서류 제출 요청',
   E'안녕하세요, {시공사} 담당자님.\n{보내는사람}입니다.\n\n{현장명} {공사명} 착공과 관련하여 아래 서류를 보내주시기 바랍니다.\n\n1. 착공계(착공신고서)\n2. 현장대리인 선임계 · 자격증 사본\n3. 예정공정표\n4. 안전관리계획서\n5. 산재·고용보험 가입증명\n6. 사용자재 목록·시험성적서\n7. MSDS, 자재공급승인원\n\n감사합니다.\n{보내는사람} 드림'),
  ('중도금 청구서 날인 요청','기성금','[{현장명}] 중도금 청구서 날인 및 확인 공문 회신 요청',
   E'안녕하세요, {시공사} 담당자님.\n{보내는사람}입니다.\n\n{현장명} 중도금 청구서 날인 및 확인 공문 회신을 부탁드립니다.\n공정률확인서도 함께 확인 부탁드립니다.\n\n감사합니다.\n{보내는사람} 드림'),
  ('준공완료보고서 발송','준공','[{현장명}] 준공완료보고서 송부',
   E'안녕하세요, {시공사} 담당자님.\n{보내는사람}입니다.\n\n{현장명} {공사명} 준공완료보고서를 보내드립니다.\n잔금청구서(잔금 {잔금})와 통장사본을 첨부하였으니 확인 부탁드립니다.\n\n감사합니다.\n{보내는사람} 드림')
) as v(name, category, subject, body)
where not exists (select 1 from public.message_templates);

-- 완료! 'Success' 가 나오면 콘솔을 새로고침하세요.
