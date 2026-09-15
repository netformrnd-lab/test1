-- ============================================================
-- 아스퀘(Supabase) → POUR(RTDB) "즉시" 동기화
--   우리(source='aptsq') 일정을 추가/수정/삭제하면 즉시 POUR RTDB 로 전송.
--   pg_net 확장으로 DB에서 바로 HTTP 호출(추가 서버/비밀키 불필요, RTDB 권한 열림).
--   루프 방지: 보내는 객체에 _origin='aptsq' 를 붙여, POUR→아스퀘 함수가 되읽지 않음.
--             source='pour'(POUR에서 온 것)은 되돌려 보내지 않음.
-- Supabase → SQL Editor → 붙여넣고 Run (한 번만)
-- ============================================================

create extension if not exists pg_net;

create or replace function public.push_schedule_to_pour()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  rtdb  text := 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
  r     record;
  node  text;
  sid   text;
  url   text;
  title text;
  memo  text;
  obj   jsonb;
begin
  r := coalesce(NEW, OLD);

  -- 우리가 올린 일정만 내보낸다 (POUR에서 온 것/개인정산 등은 제외)
  if r.source is distinct from 'aptsq' then
    return coalesce(NEW, OLD);
  end if;

  -- category → POUR 노드 (work/분류없음 등은 내보내지 않음)
  node := case r.category
    when 'pt' then 'pt'
    when 'bids' then 'briefing'
    when 'sales' then 'sales'
    when 'seminar' then 'seminar'
    when 'personal' then 'personal'
    when 'meeting' then 'meetings'
    when 'vacation' then 'vacation'
    when 'asq' then 'asq'
    else null end;
  if node is null then
    return coalesce(NEW, OLD);
  end if;

  sid := 'asq_' || r.id::text;
  url := rtdb || '/' || node || '/' || sid || '.json';

  -- 삭제 → RTDB 에서도 삭제 (POST + method override DELETE)
  if (TG_OP = 'DELETE') then
    perform net.http_post(
      url := url,
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json","X-HTTP-Method-Override":"DELETE"}'::jsonb
    );
    return OLD;
  end if;

  -- 추가/수정 → RTDB 에 set (POST + method override PUT)
  title := coalesce(NEW.title, '');
  memo  := coalesce(NEW.description, '');
  obj := jsonb_build_object(
    'id', sid,
    'date', coalesce(NEW.date::text, ''),
    '_origin', 'aptsq',
    '_aptsqId', NEW.id::text,
    '_syncedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  obj := obj || case node
    when 'pt'       then jsonb_build_object('siteName', title, 'note', memo, 'ptAssignee','', 'workType','', 'status','')
    when 'briefing' then jsonb_build_object('siteName', title, 'assignee','', 'time', memo)
    when 'sales'    then jsonb_build_object('company', title, 'content', memo, 'assignee','')
    when 'meetings' then jsonb_build_object('title', title, 'time', memo, 'location','', 'attendees', '[]'::jsonb)
    when 'vacation' then jsonb_build_object('title', title, 'assignees', '[]'::jsonb)
    else                 jsonb_build_object('title', title, 'time', memo, 'location','', 'assignees', '[]'::jsonb)
  end;

  perform net.http_post(
    url := url,
    body := obj,
    headers := '{"Content-Type":"application/json","X-HTTP-Method-Override":"PUT"}'::jsonb
  );

  return NEW;
end;
$$;

drop trigger if exists trg_push_schedule_to_pour on public.schedules;
create trigger trg_push_schedule_to_pour
  after insert or update or delete on public.schedules
  for each row execute function public.push_schedule_to_pour();

-- 참고:
--  · 추가/수정/삭제 모두 즉시 반영됩니다(양방향 수정 지원).
--  · 5분 배치 동기화는 그대로 두면 '보정(누락 방지)' 역할을 합니다.
