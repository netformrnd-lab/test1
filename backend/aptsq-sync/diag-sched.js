// 진단 전용: '예정월/미정' 일정(date=null) 등록이 왜 실패하는지 실제 insert로 재현.
//   service_role 로 넣으므로 RLS 는 우회됨 → 실패하면 '컬럼 제약(NOT NULL 등)' 문제로 확정.
//   성공하면 즉시 삭제(테스트 흔적 안 남김). 컬럼 존재 여부(meta/resident_visible)도 함께 확인.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  // 아무 단지 하나 확보(아스퀘 일정 재현용)
  const { data: apts } = await sb.from('apartments').select('id,name').limit(1);
  const aptId = apts && apts[0] ? apts[0].id : null;
  console.log('테스트 단지:', apts && apts[0] ? apts[0].name : '(없음 → apartment_id=null 로 테스트)');

  const MARK = '__DIAG_PREDATE__' + Date.now();

  // 1) 확정일 등록(대조군) — 이건 되는지
  console.log('\n[1] 확정일(date 있음) insert 테스트…');
  const okRow = { date: '2099-01-01', title: MARK + '_confirmed', category: 'asq', source: 'aptsq',
    description: null, assignee_name: null, assignee_id: null, meta: { test: true },
    apartment_id: aptId, owner_id: null, resident_visible: false };
  {
    const { data, error } = await sb.from('schedules').insert(okRow).select('id').single();
    if (error) console.log('   ❌ 확정일도 실패:', error.message, '| details:', error.details || '-', '| hint:', error.hint || '-');
    else { console.log('   ✅ 확정일 성공 (id=' + data.id + ') → 삭제'); await sb.from('schedules').delete().eq('id', data.id); }
  }

  // 2) 예정월/미정 등록(문제 재현) — date=null
  console.log('\n[2] 예정/미정(date=null) insert 테스트…');
  const nullRow = { date: null, title: MARK + '_predate', category: 'asq', source: 'aptsq',
    description: null, assignee_name: null, assignee_id: null,
    meta: { type: 'asq', dateType: 'expected', status: '예정' },
    apartment_id: aptId, owner_id: null, resident_visible: false };
  {
    const { data, error } = await sb.from('schedules').insert(nullRow).select('id').single();
    if (error) {
      console.log('   ❌ 실패:', error.message);
      console.log('      code:', error.code || '-', '| details:', error.details || '-', '| hint:', error.hint || '-');
      if (String(error.message).match(/null value|not-null|not null/i))
        console.log('      → 원인 확정: schedules.date 가 아직 NOT NULL. 해결: alter table public.schedules alter column date drop not null;');
    } else {
      console.log('   ✅ 성공 (id=' + data.id + ') → date=null 등록 정상! (DB 제약은 이미 풀림) → 삭제');
      await sb.from('schedules').delete().eq('id', data.id);
      console.log('      ⇒ DB는 정상이므로, 앱/대시보드 실패는 다른 원인(RLS/권한 or 캐시)일 수 있음.');
    }
  }

  // 3) 남은 테스트 흔적 정리(혹시 select 실패로 안 지워졌을 경우)
  await sb.from('schedules').delete().like('title', MARK + '%');

  // 4) 실제로 사용자가 등록한 '예정/미정'(date=null) 일정이 DB에 있는지 확인
  //    → 있으면: 저장은 되고 있고 '화면에 안 보이는' 문제. 없으면: 저장 자체가 안 됨.
  console.log('\n[3] DB에 저장된 예정/미정(date=null) 일정 조회…');
  const { data: nulls, error: nerr } = await sb.from('schedules')
    .select('id,title,category,source,apartment_id,meta,created_at')
    .is('date', null).order('created_at', { ascending: false }).limit(20);
  if (nerr) { console.log('   조회 에러:', nerr.message); }
  else {
    console.log('   date=null 일정 총 ' + (nulls ? nulls.length : 0) + '건(최근 20):');
    (nulls || []).forEach(r => {
      const dt = r.meta && r.meta.dateType ? r.meta.dateType : '?';
      console.log(`     · [${r.source}/${r.category}] "${String(r.title || '').slice(0, 24)}" dateType=${dt} em=${r.meta && r.meta.expectedMonth || '-'} ${String(r.created_at || '').slice(0, 16)}`);
    });
    if (nulls && nulls.length) console.log('   ⇒ 저장은 정상! 캘린더가 날짜없는 일정을 안 그려서 "안 보이는" 문제로 확정.');
    else console.log('   ⇒ date=null 일정이 하나도 없음 → 저장 자체가 막히는 중(RLS 등).');
  }
  console.log('\n✅ 진단 완료');
})().catch(e => { console.error(e); process.exit(1); });
