// 아스퀘(Supabase) → POUR(RTDB) "즉시" 동기화 왕복 진단
//  1) 기존 RTDB 각 노드에 asq_ 항목이 이미 있는지 카운트
//  2) Supabase schedules 에 테스트행(source='aptsq', sales) INSERT
//  3) 몇 초 대기 후 RTDB sales/asq_<id> 가 생겼는지 폴링
//  4) 제목 UPDATE → RTDB 에 반영되는지
//  5) DELETE → RTDB 에서 사라지는지
//  6) 테스트행 정리
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const NODES = ['pt', 'briefing', 'sales', 'seminar', 'personal', 'meetings', 'vacation', 'asq'];

if (!KEY) { console.log('❌ SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rget(node, sid) {
  const p = sid ? `${node}/${sid}` : node;
  const res = await fetch(`${RTDB}/${p}.json`);
  if (!res.ok) throw new Error(`RTDB GET ${p} → ${res.status}`);
  return res.json();
}

(async () => {
  // 1) 기존 asq_ 항목 현황
  console.log('===== 현재 RTDB 노드별 asq_ 항목 수 =====');
  for (const node of NODES) {
    try {
      const data = await rget(node);
      const keys = data ? Object.keys(data) : [];
      const asq = keys.filter((k) => k.startsWith('asq_'));
      console.log(`  ${node}: 전체 ${keys.length}개, asq_ ${asq.length}개` + (asq.length ? `  예:${asq.slice(0, 3).join(',')}` : ''));
    } catch (e) { console.log(`  ${node}: 읽기오류 ${e.message}`); }
  }

  // 2) 테스트행 INSERT
  const mark = 'PGNET테스트-' + Date.now();
  console.log('\n===== 왕복 테스트 INSERT =====', mark);
  const { data: ins, error: insErr } = await sb.from('schedules').insert({
    source: 'aptsq', category: 'sales', title: mark,
    description: '자동진단', date: '2026-12-31', owner_id: null, apartment_id: null,
  }).select('id,source,category,title,date').single();
  if (insErr) { console.log('❌ INSERT 실패:', insErr.message); process.exit(1); }
  const id = ins.id; const sid = 'asq_' + id;
  console.log('  삽입됨 id=', id, '→ RTDB 기대경로 sales/' + sid);

  // 3) RTDB 폴링 (최대 ~25초)
  let found = null;
  for (let i = 0; i < 12; i++) {
    await sleep(2200);
    const v = await rget('sales', sid).catch(() => null);
    if (v) { found = v; console.log(`  ✅ ${(i + 1) * 2.2}s 후 RTDB에 나타남`); break; }
    console.log(`  … ${(i + 1) * 2.2}s 대기 (아직 없음)`);
  }
  if (found) {
    console.log('  RTDB 내용:', JSON.stringify(found));
  } else {
    console.log('  ❌ RTDB에 끝내 안 나타남 → pg_net 트리거가 전송하지 못함(또는 pg_net 미동작)');
  }

  // 4) UPDATE
  if (found) {
    console.log('\n===== UPDATE 테스트 =====');
    await sb.from('schedules').update({ title: mark + '-수정' }).eq('id', id);
    let upd = null;
    for (let i = 0; i < 8; i++) {
      await sleep(2200);
      const v = await rget('sales', sid).catch(() => null);
      if (v && (v.company === mark + '-수정')) { upd = v; break; }
    }
    console.log(upd ? '  ✅ 수정 반영됨: ' + JSON.stringify(upd) : '  ⚠️ 수정 미반영(RTDB company 그대로)');
  }

  // 5) DELETE
  console.log('\n===== DELETE 테스트 =====');
  await sb.from('schedules').delete().eq('id', id);
  let gone = false;
  for (let i = 0; i < 8; i++) {
    await sleep(2200);
    const v = await rget('sales', sid).catch(() => null);
    if (!v) { gone = true; break; }
  }
  console.log(gone ? '  ✅ RTDB에서도 삭제됨' : '  ⚠️ RTDB에 아직 남아있음(삭제 미반영)');

  // 6) 혹시 남았으면 직접 정리
  if (!gone) {
    await fetch(`${RTDB}/sales/${sid}.json`, { method: 'DELETE' }).catch(() => {});
    console.log('  (RTDB 잔여 항목 직접 삭제 시도)');
  }

  console.log('\n===== 결론 =====');
  if (found) console.log('✅ 아스퀘→POUR 즉시 전송 경로 정상. POUR 앱에서 안 보이면 "앱 표시(읽기)" 문제일 가능성.');
  else console.log('❌ pg_net 트리거가 RTDB로 전송하지 못함. Supabase에서 pg_net/트리거 점검 필요.');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
