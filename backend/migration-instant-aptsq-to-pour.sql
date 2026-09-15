-- ============================================================
-- 아스퀘(Supabase) → POUR(RTDB) "즉시" 동기화  (v2: POUR과 '똑같은 데이터 모양'으로 전송)
--   우리(source='aptsq') 일정을 추가/수정/삭제하면 즉시 POUR RTDB 로 전송.
--   ★ POUR 캘린더는 type + dateType='confirmed' + status='확정' 가 있어야 달력에 그림.
--     (POUR 실데이터 필드를 그대로 맞춰야 POUR 화면에 뜬다)
--   루프 방지: _origin='aptsq' 표식 → POUR→아스퀘 함수가 되읽지 않음.
-- Supabase → SQL Editor → 붙여넣고 Run (다시 실행하면 최신 버전으로 교체됨)
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
  who   text;
  dt    text;
  ts    text;
  asgn  jsonb;
  obj   jsonb;
begin
  r := coalesce(NEW, OLD);

  -- 우리가 올린 일정만 내보낸다 (POUR에서 온 것 등은 제외)
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

  -- 삭제 → RTDB 에서도 삭제
  if (TG_OP = 'DELETE') then
    perform net.http_post(
      url := url,
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json","X-HTTP-Method-Override":"DELETE"}'::jsonb
    );
    return OLD;
  end if;

  -- 추가/수정 → POUR과 동일한 모양으로 set
  title := coalesce(NEW.title, '');
  memo  := coalesce(NEW.description, '');
  who   := coalesce(NEW.assignee_name, '');
  dt    := coalesce(NEW.date::text, '');
  ts    := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  asgn  := case when who <> '' then jsonb_build_array(who) else '[]'::jsonb end;

  -- meta(POUR 상세 폼)가 있으면 그대로 전송 (id/_origin/date 만 보정)
  if NEW.meta is not null then
    obj := NEW.meta || jsonb_build_object(
      'id', sid, '_origin', 'aptsq', '_aptsqId', NEW.id::text, '_syncedAt', ts,
      'date', coalesce(nullif(NEW.meta->>'date', ''), dt)
    );
    perform net.http_post(
      url := url, body := obj,
      headers := '{"Content-Type":"application/json","X-HTTP-Method-Override":"PUT"}'::jsonb
    );
    return NEW;
  end if;

  if node = 'sales' then
    -- 영업: POUR에서 type/dateType 없는 단순 구조
    obj := jsonb_build_object(
      'id', sid, 'date', dt,
      'company', title, 'content', memo, 'assignee', who,
      'contactPerson', '', 'contactPhone', '', 'followUp', '',
      '_origin', 'aptsq', '_aptsqId', NEW.id::text, '_syncedAt', ts
    );
  elsif node = 'meetings' then
    -- 회의
    obj := jsonb_build_object(
      'id', sid, 'date', dt, 'type', 'meeting', 'title', title,
      'time', '', 'location', '', 'attendees', asgn, 'responses', '{}'::jsonb, 'createdAt', ts,
      '_origin', 'aptsq', '_aptsqId', NEW.id::text, '_syncedAt', ts
    );
  else
    -- 공통(확정일정) 필드 — 이게 있어야 POUR 달력에 그려짐
    obj := jsonb_build_object(
      'id', sid, 'date', dt,
      'type', node, 'dateType', 'confirmed', 'status', '확정', 'mainCategory', '재도장',
      'address', '', 'competitor', '', 'dateNote', '', 'expectedMonth', '',
      'location', '', 'note', memo, 'participants', '', 'ptAssignee', '',
      'requester', '', 'time', '', 'workType', '',
      '_origin', 'aptsq', '_aptsqId', NEW.id::text, '_syncedAt', ts
    );
    if node = 'pt' then
      obj := obj || jsonb_build_object('siteName', title, 'title', '', 'ptAssignee', who);
    elsif node = 'briefing' then
      obj := obj || jsonb_build_object('siteName', title, 'title', '', 'assignee', who, 'ptProduct', '', 'bidDeadline', '');
    elsif node = 'asq' then
      obj := obj || jsonb_build_object('title', title, 'siteName', title, 'assignee', '', 'assignees', asgn, 'ptProduct', '', 'bidDeadline', '');
    else  -- seminar / personal / vacation
      obj := obj || jsonb_build_object('title', title, 'siteName', '', 'assignee', '', 'assignees', asgn, 'ptProduct', '', 'bidDeadline', '');
    end if;
  end if;

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
--  · type + dateType='confirmed' + status='확정' 를 넣어 POUR 달력에 바로 표시됩니다.
--  · 배치 동기화(sync.js)도 같은 모양으로 맞춰져 있어, 한 번 돌리면 기존 일정도 전부 반영됩니다.
