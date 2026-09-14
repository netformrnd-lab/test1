-- 실시간(Realtime) 켜기: 아래 표가 바뀌면(추가·삭제·수정) 앱이 즉시 반영하도록
-- supabase_realtime 발행(publication)에 표를 추가한다. 이미 있으면 건너뜀(중복 에러 방지).

do $$
declare t text;
begin
  foreach t in array array['notices','reports','field_updates','schedules','apartments','chat_messages']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
