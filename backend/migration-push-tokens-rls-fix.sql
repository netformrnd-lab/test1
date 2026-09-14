-- device_tokens RLS 수정
-- 문제: 같은 폰(=같은 토큰)을 다른 계정으로 로그인해 가져오려 하면
--       기존 소유자(예: 감리사)와 auth.uid()가 달라 UPDATE의 USING 조건에 막혀 저장 실패.
-- 해결: 토큰은 '기기'에 종속되므로, 지금 그 기기에 로그인한 사용자가 소유하도록 허용.
--       (INSERT/UPDATE 모두 새 행의 user_id 는 반드시 본인이어야 함 = with check)

alter table public.device_tokens enable row level security;

drop policy if exists "dt_self"   on public.device_tokens;
drop policy if exists "dt_insert" on public.device_tokens;
drop policy if exists "dt_update" on public.device_tokens;
drop policy if exists "dt_delete" on public.device_tokens;

-- 내 것으로만 등록
create policy "dt_insert" on public.device_tokens for insert to authenticated
  with check (user_id = auth.uid());

-- 이 기기의 토큰을 현재 로그인 사용자가 이어받기(소유자 갱신) 허용
create policy "dt_update" on public.device_tokens for update to authenticated
  using (true) with check (user_id = auth.uid());

-- 정리(로그아웃 등) 허용
create policy "dt_delete" on public.device_tokens for delete to authenticated
  using (true);

-- 관리자 열람 (기존 유지)
drop policy if exists "dt_admin" on public.device_tokens;
create policy "dt_admin" on public.device_tokens for select
  using (public.is_admin());
