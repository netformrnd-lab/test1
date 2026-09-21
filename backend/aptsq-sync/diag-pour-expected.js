// POUR가 '예정월/미정' 일정을 실제로 어떤 필드 모양으로 저장하는지 확인.
//   각 노드에서 POUR-native(우리가 넣지 않은) 항목 중 dateType!=='confirmed'
//   또는 status가 '예정/미정' 인 것을 찾아 그대로 출력.
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const NODES = ['pt', 'briefing', 'sales', 'seminar', 'personal', 'meetings', 'vacation', 'asq'];
const isOurs = (k, v) => k.startsWith('asq_') || (v && v._origin === 'aptsq');
const isExpected = v => {
  if (!v || typeof v !== 'object') return false;
  const dt = v.dateType || '';
  const st = String(v.status || '');
  return (dt && dt !== 'confirmed') || /예정|미정/.test(st) || (v.expectedMonth && !v.date);
};
(async () => {
  for (const node of NODES) {
    let data;
    try { const r = await fetch(`${RTDB}/${node}.json`); data = await r.json(); }
    catch (e) { console.log(`### ${node}: 오류 ${e.message}`); continue; }
    const entries = Object.entries(data || {});
    const pour = entries.filter(([k, v]) => !isOurs(k, v));
    const exp = pour.filter(([, v]) => isExpected(v));
    // dateType 분포
    const dtFreq = {};
    pour.forEach(([, v]) => { const d = (v && v.dateType) || '(없음)'; dtFreq[d] = (dtFreq[d] || 0) + 1; });
    console.log(`\n###### ${node} (POUR직접 ${pour.length}건) dateType분포=${JSON.stringify(dtFreq)}`);
    if (exp.length) {
      console.log(`  ── 예정/미정 POUR-native 예시 (최대 3건) ──`);
      exp.slice(0, 3).forEach(([k, v]) => console.log(`   [${k}] ${JSON.stringify(v)}`));
    } else {
      console.log('  ── 예정/미정 항목 없음 ──');
      if (pour.length) console.log(`   (참고) confirmed 예시 1건: ${JSON.stringify(pour[0][1])}`);
    }
  }
  console.log('\n===== 끝 =====');
})().catch(e => { console.log('오류:', e.message); process.exit(1); });
