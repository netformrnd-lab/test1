// 방향 B 만 빠르게: 우리(source='aptsq') 일정을 전부 POUR RTDB 로 재전송(느린 POUR 임포트 생략)
const { createClient } = require('@supabase/supabase-js');
const M = require('./mapping.js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
async function rtdbPut(path, obj) {
  const res = await fetch(`${RTDB}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${await res.text().catch(() => '')}`);
}
(async () => {
  const out = []; const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await sb.from('schedules').select('*').eq('source', 'aptsq').order('created_at', { ascending: false }).range(from, from + SIZE - 1);
    if (error) { console.log('조회 실패:', error.message); process.exit(1); }
    if (!data || !data.length) break;
    out.push(...data); if (data.length < SIZE) break;
  }
  console.log(`우리(aptsq) 일정 ${out.length}건 재전송 시작`);
  let ok = 0, skip = 0, fail = 0;
  for (const row of out) {
    const node = M.CATEGORY_TO_NODE[row.category];
    if (!node) { skip++; continue; }
    const obj = M.supabaseToPour(row);
    if (!obj) { skip++; continue; }
    try { await rtdbPut(`${node}/${M.safeId(obj.id)}`, obj); ok++; }
    catch (e) { fail++; if (fail <= 5) console.log('  전송실패:', row.id, e.message); }
  }
  console.log(`✅ 완료 — 전송 ${ok} · 건너뜀(work/분류없음) ${skip} · 실패 ${fail}`);
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
