-- 공지사항을 누구나(비회원 포함) 읽을 수 있게 (홍보성 안내이므로 공개)
drop policy if exists "notices_read" on notices;
create policy "notices_read" on notices for select using (true);
