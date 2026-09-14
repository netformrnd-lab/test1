-- 보안: 채팅 쓰기를 '로그인한 본인 단지 사람'으로 제한.
-- (기존엔 비로그인/누구나 아무 단지 스레드에 메시지를 넣을 수 있었음 → 스팸·사칭 여지)
-- 로그인 전 상담은 앱에서 이미 카카오톡 채널로 안내하므로 게스트 채팅 경로는 불필요.

-- 쓰기: 관리자, 또는 그 단지의 입주민/담당 감리사(대표·조인)만
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert to authenticated
with check (
  public.is_admin()
  or (chat_messages.apartment_id is not null and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
     or exists (select 1 from public.apartments a where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
     or chat_messages.apartment_id in (select apartment_id from public.apartment_auditors where auditor_id = auth.uid())
  ))
);

-- 비로그인(anon) 게스트 채팅 열람 정책 제거 (이제 로그인 전 상담은 카카오톡)
drop policy if exists chat_guest_read on public.chat_messages;
