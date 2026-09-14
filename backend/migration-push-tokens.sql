-- 푸시 알림: 기기(폰)별 FCM 토큰 저장
-- 앱이 켜질 때 그 폰의 푸시 주소(token)를 여기에 저장한다.
-- 알림을 보낼 때 이 표에서 대상 사용자의 토큰을 찾아 발송한다.

create table if not exists public.device_tokens (
  token      text primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  platform   text default 'android',
  updated_at timestamptz default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

-- 본인 토큰만 등록/수정/삭제
drop policy if exists "dt_self" on public.device_tokens;
create policy "dt_self" on public.device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 관리자 열람 (선택)
drop policy if exists "dt_admin" on public.device_tokens;
create policy "dt_admin" on public.device_tokens for select
  using (public.is_admin());

-- 발송 서버는 service_role 키로 접근하므로 RLS를 우회해 전체 토큰을 조회한다.

-- 채팅 알림에서 "보낸 사람 본인"을 제외하기 위해 sender_id 기록
alter table public.chat_messages add column if not exists sender_id uuid;
