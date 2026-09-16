// 즉시함수(POUR→아스퀘 upsert) 실측: RTDB에 새 POUR 일정을 써서 몇 초 안에
//  Supabase(sync_id=pour:sales:<id>)에 들어오는지 확인 → 정리.
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rput = async (p, o) => fetch(`${RTDB}/${p}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const rdel = async (p) => fetch(`${RTDB}/${p}.json`, { method: 'DELETE' });
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const id = 'functest_' + Date.now();
  const sid = `pour:sales:${id}`;
  const entry = { id, date: today, dateType: 'confirmed', type: 'sales',
    company: '함수테스트(자동삭제)', content: '즉시연동 점검', assignee: '', siteName: '함수테스트(자동삭제)' };
  console.log('① POUR sales 노드에 새 일정 쓰기:', id, 'date=', today);
  await rput('sales/' + id, entry);

  let found = null;
  for (let i = 1; i <= 6; i++) {           // 최대 ~12초 동안 2초 간격 확인
    await sleep(2000);
    const { data } = await sb.from('schedules').select('id,title,date').eq('sync_id', sid).maybeSingle();
    if (data) { found = data; console.log(`② ${i * 2}초 후 우리 DB에 들어옴 ✅ title=${data.title} date=${data.date}`); break; }
    console.log(`   ${i * 2}초… 아직 없음`);
  }
  if (!found) console.log('② 12초 내 우리 DB에 안 들어옴 ❌  ← 즉시함수(upsert)가 새 POUR 등록을 못 잡음');

  // 정리: RTDB 삭제 → 함수 del이 우리 것도 지움 + 안전하게 Supabase 직접 삭제
  await rdel('sales/' + id);
  await sleep(3000);
  await sb.from('schedules').delete().eq('sync_id', sid);
  const { data: left } = await sb.from('schedules').select('id').eq('sync_id', sid).maybeSingle();
  console.log(left ? '③ 정리 후 잔여 ⚠️' : '③ 정리 완료 ✅');
  process.exit(found ? 0 : 1);
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
