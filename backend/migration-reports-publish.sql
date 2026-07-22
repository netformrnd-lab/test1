-- 감리보고서 워크플로우: 감리사 작성 → 관리자 재작성/공개 → 입주민 열람
alter table reports add column if not exists published boolean default false;

-- 기존의 넓은 읽기 정책 제거 (승인만 되면 모든 보고서 열람 가능하던 것)
drop policy if exists "reports_read_approved" on reports;

-- 감리사: 자기 담당 단지 보고서 열람 (초안 포함)
drop policy if exists "reports_read_auditor" on reports;
create policy "reports_read_auditor" on reports for select using (
  apartment_id in (select id from apartments where auditor_id = auth.uid())
);

-- 입주민·관리소장: '공개된' 우리 단지 보고서만 열람
drop policy if exists "reports_read_resident" on reports;
create policy "reports_read_resident" on reports for select using (
  published = true
  and apartment_id = (select apartment_id from profiles where id = auth.uid())
);

-- 관리자: 전체 열람·수정·공개 (reports_admin_all 은 migration-fix-rls 에 이미 있음)
