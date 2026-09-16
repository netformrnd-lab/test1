// POUR → 아파트스퀘어(가져오기) 진단:
//  POUR 각 노드의 비(非)aptsq 일정이 우리 Supabase(sync_id=pour:node:id)에 들어왔는지 대조.
//  안 들어왔으면 원인(날짜 못읽음 / 미도착)까지 표기.
const { createClient } = require('@supabase/supabase-js');
const M = require('./mapping');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const rget = async (p) => { const r = await fetch(`${RTDB}/${p}.json`); return r.ok ? r.json() : null; };

(async () => {
  // 우리 DB의 pour sync_id 전부 수집(페이지네이션)
  const have = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('schedules').select('sync_id').eq('source', 'pour').range(from, from + 999);
    if (error) { console.log('Supabase 조회 실패:', error.message); process.exit(1); }
    if (!data || !data.length) break;
    for (const r of data) if (r.sync_id) have.add(r.sync_id);
    if (data.length < 1000) break;
  }
  console.log('우리 DB의 POUR 일정 수:', have.size, '\n');

  const missingWithDate = [];   // 날짜 있는데 우리 DB에 없음 = 진짜 문제(함수 미전송)
  const missingNoDate = [];     // 날짜 못읽어 스킵(설계상). 예정월/미정 등
  for (const node of M.SYNC_NODES) {
    const val = (await rget(node)) || {};
    let total = 0, inDb = 0, nd = 0, missD = 0;
    for (const [id, s] of Object.entries(val)) {
      if (!s || typeof s !== 'object') continue;
      if (s._origin === 'aptsq') continue;      // 우리가 내보낸 건 제외
      total++;
      const sid = `pour:${node}:${id}`;
      const has = have.has(sid);
      const d = M.pickDate(s);
      if (has) { inDb++; continue; }
      if (!d) { nd++; missingNoDate.push({ node, id, s }); }
      else { missD++; missingWithDate.push({ node, id, s, d }); }
    }
    console.log(`${node}: 전체 ${total} · 우리DB에 있음 ${inDb} · 없음(날짜O) ${missD} · 없음(날짜X) ${nd}`);
  }

  const show = (arr, title, n) => {
    console.log(`\n== ${title} (${arr.length}건) ==`);
    for (const x of arr.slice(0, n)) {
      const t = x.s.siteName || x.s.title || x.s.company || x.s.requester || '(제목?)';
      console.log(` · ${x.node}/${x.id} "${String(t).slice(0,22)}" 날짜필드=${M.dateFieldOf(x.s) || '없음'} type=${x.s.type||''} dateType=${x.s.dateType||''}`);
      console.log(`     키들: ${Object.keys(x.s).slice(0,16).join(', ')}`);
    }
  };
  show(missingWithDate, '❌ 날짜 있는데 우리DB에 없음(진짜 문제)', 12);
  show(missingNoDate, '⚠️ 날짜 못읽어 스킵(예정월/미정 등 가능)', 8);
  console.log('\n판독: ❌가 있으면 함수/트리거가 그 일정을 안 넣은 것. ⚠️는 날짜필드를 못 읽어 스킵.');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
