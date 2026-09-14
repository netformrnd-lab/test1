-- 동(棟)별 공정 진행 상태 (관리자가 설정 · 입주민 현장현황에 표시)
-- stage = 현재 진행 단계 인덱스(0 = 시작 전, 공법 stages 기준). 공법은 apartments.method 사용.
create table if not exists dong_progress (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid references apartments(id) on delete cascade,
  dong          text not null,
  stage         int default 0,
  updated_at    timestamptz default now(),
  unique (apartment_id, dong)
);
alter table dong_progress enable row level security;

-- 로그인 사용자 열람 (입주민 현장현황용)
drop policy if exists dong_progress_read on dong_progress;
create policy dong_progress_read on dong_progress
  for select to anon, authenticated using (true);

-- 관리자만 등록/수정/삭제
drop policy if exists dong_progress_admin on dong_progress;
create policy dong_progress_admin on dong_progress
  for all using (is_admin()) with check (is_admin());
