-- 담당 배정 요청(assign_requests)
-- 팀장(관리자)이 '담당 배정 안 된 현장'을 특정 감리원에게 요청 → 감리원이 앱에서 수락하면
-- 자동으로 그 현장 담당(apartment_auditors)에 추가된다.
--
-- 흐름:
--   1) 콘솔(관리자)에서 assign_requests INSERT  (apartment_id, auditor_id, requested_by)
--   2) Supabase Database Webhook(assign_requests INSERT) → /push → 해당 감리원에게 FCM 푸시
--   3) 감리원 앱에서 '수락' → accept_assign_request() 가 apartment_auditors 에 추가 + 상태 accepted
--
-- 적용 후: Supabase → Database → Webhooks 에서
--   테이블 assign_requests / 이벤트 INSERT → HTTP POST  {사이트}/push?secret=PUSH_WEBHOOK_SECRET
--   (reports/notices 등 기존 푸시 웹훅과 동일한 방식)

create table if not exists public.assign_requests (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  auditor_id   uuid not null references public.profiles(id)   on delete cascade,
  status       text not null default 'pending',   -- pending | accepted | declined | canceled
  requested_by uuid references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists assign_requests_auditor_idx on public.assign_requests (auditor_id, status);
create index if not exists assign_requests_apt_idx     on public.assign_requests (apartment_id, status);

alter table public.assign_requests enable row level security;

-- 관리자: 전체 열람/생성/수정/삭제
drop policy if exists "areq_admin_all" on public.assign_requests;
create policy "areq_admin_all" on public.assign_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 감리원: 자기한테 온 요청만 열람
drop policy if exists "areq_auditor_read" on public.assign_requests;
create policy "areq_auditor_read" on public.assign_requests for select to authenticated
  using (auditor_id = auth.uid());

-- 감리원: 자기한테 온 pending 요청의 상태만 변경(수락/거절) — 수락 로직은 아래 RPC 권장
drop policy if exists "areq_auditor_update" on public.assign_requests;
create policy "areq_auditor_update" on public.assign_requests for update to authenticated
  using (auditor_id = auth.uid()) with check (auditor_id = auth.uid());

-- ===== 수락: RLS 우회(security definer)로 담당 추가 + 상태 변경을 한 번에 =====
create or replace function public.accept_assign_request(p_request uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.assign_requests;
begin
  if auth.uid() is null then return 'not-authenticated'; end if;
  select * into r from public.assign_requests where id = p_request;
  if not found then return 'not-found'; end if;
  if r.auditor_id <> auth.uid() then return 'forbidden'; end if;
  if r.status <> 'pending' then return 'already-' || r.status; end if;

  -- 담당 감리원으로 추가(중복 방지)
  if not exists (
    select 1 from public.apartment_auditors
    where apartment_id = r.apartment_id and auditor_id = r.auditor_id
  ) then
    insert into public.apartment_auditors (apartment_id, auditor_id)
      values (r.apartment_id, r.auditor_id);
  end if;

  -- 대표 감리원이 비어 있으면 이 사람으로 채움
  update public.apartments
     set auditor_id = r.auditor_id
   where id = r.apartment_id and auditor_id is null;

  update public.assign_requests
     set status = 'accepted', responded_at = now()
   where id = p_request;

  return 'ok';
end;
$$;

grant execute on function public.accept_assign_request(uuid) to authenticated;

-- ===== 거절 =====
create or replace function public.decline_assign_request(p_request uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.assign_requests;
begin
  if auth.uid() is null then return 'not-authenticated'; end if;
  select * into r from public.assign_requests where id = p_request;
  if not found then return 'not-found'; end if;
  if r.auditor_id <> auth.uid() then return 'forbidden'; end if;
  if r.status <> 'pending' then return 'already-' || r.status; end if;

  update public.assign_requests
     set status = 'declined', responded_at = now()
   where id = p_request;
  return 'ok';
end;
$$;

grant execute on function public.decline_assign_request(uuid) to authenticated;
