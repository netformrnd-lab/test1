-- ============================================================
-- 보안 강화 (2026-07) — 채팅 스팸·사칭 차단 + 게스트 대화 노출 차단
-- Supabase → SQL Editor → New query → 아래 전체 붙여넣기 → Run
-- (여러 번 실행해도 안전합니다)
-- ============================================================

-- 배경: publishable(anon) 키는 공개용이라 누구나 사용할 수 있습니다.
-- 기존 채팅 정책은 anon(비로그인)도 '아무 스레드에나' 글을 넣고
-- 게스트 대화 전체를 읽을 수 있어, 스팸·사칭·대화 노출 위험이 있었습니다.

-- 1) 채팅 전송: 로그인한 '우리 단지' 사용자만, 자기 단지 스레드에만 전송 --------
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages
  for insert to authenticated with check (
    apartment_id is not null and (
      exists (select 1 from profiles p
                where p.id = auth.uid() and p.apartment_id = chat_messages.apartment_id)
      or exists (select 1 from apartments a
                where a.id = chat_messages.apartment_id and a.auditor_id = auth.uid())
    )
  );
-- (관리자는 chat_admin_all 로 모든 스레드 송·수신, 읽기는 chat_apt_read 로 자기 단지)

-- 2) 게스트 스레드 비로그인 열람 정책 제거 (anon 이 전체 게스트 대화를 읽던 것 차단) --
drop policy if exists chat_guest_read on chat_messages;

-- 3) 담당 감리사 '전화번호' 조회 함수: 비로그인(anon) 접근 차단 → 로그인 사용자만 ----
revoke execute on function public.apartment_auditor_phone(uuid) from anon;

-- 완료! 'Success. No rows returned' 이 뜨면 정상입니다.
