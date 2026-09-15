// POUR RTDB 각 노드의 '실제 데이터 모양'을 덤프한다.
//  · POUR이 직접 만든 항목(키에 asq_ 없음, _origin 없음)과
//    우리가 넣은 항목(asq_ 접두사, _origin='aptsq')을 나란히 보여줌 → 필드 차이 파악.
//  · 특히 asq(아스퀘) 노드에서 POUR-native 항목이 있으면 그 모양을 그대로 맞추면 됨.
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const NODES = ['pt', 'briefing', 'sales', 'seminar', 'personal', 'meetings', 'vacation', 'asq'];

async function rget(node) {
  const res = await fetch(`${RTDB}/${node}.json`);
  if (!res.ok) throw new Error(`GET ${node} → ${res.status}`);
  return res.json();
}
const isOurs = (k, v) => k.startsWith('asq_') || (v && v._origin === 'aptsq');

(async () => {
  for (const node of NODES) {
    let data;
    try { data = await rget(node); } catch (e) { console.log(`\n### ${node}: 읽기오류 ${e.message}`); continue; }
    const entries = Object.entries(data || {});
    const pour = entries.filter(([k, v]) => !isOurs(k, v));
    const ours = entries.filter(([k, v]) => isOurs(k, v));
    console.log(`\n############### ${node}  (전체 ${entries.length} · POUR직접 ${pour.length} · 우리것 ${ours.length}) ###############`);
    // POUR 직접 만든 항목 필드 모양 (키 이름 유추 포함)
    if (pour.length) {
      console.log('  ── POUR-native 예시 2건 (이 필드 모양을 우리가 맞춰야 함) ──');
      pour.slice(0, 2).forEach(([k, v]) => console.log(`   [${k}] fields=[${Object.keys(v || {}).join(', ')}]\n       ${JSON.stringify(v)}`));
      // 필드별 등장 빈도(어떤 필드가 필수인지 감 잡기)
      const freq = {};
      pour.forEach(([, v]) => Object.keys(v || {}).forEach((f) => { freq[f] = (freq[f] || 0) + 1; }));
      console.log('   필드 빈도:', JSON.stringify(freq));
    } else {
      console.log('  ── POUR-native 항목 없음 (POUR에서 이 노드에 직접 만든 게 없음) ──');
    }
    if (ours.length) {
      console.log('  ── 우리가 넣은 항목 예시 1건 ──');
      const [k, v] = ours[0];
      console.log(`   [${k}] fields=[${Object.keys(v || {}).join(', ')}]\n       ${JSON.stringify(v)}`);
    }
  }
  console.log('\n===== 끝 =====');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
