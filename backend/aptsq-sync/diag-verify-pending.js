// 검증: 우리가 POUR로 보낸 항목(asq_ 접두사, _origin='aptsq') 중
//   dateType 별로 몇 건인지, 특히 예정(pending)이 실제로 들어갔는지 확인.
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const NODES = ['pt', 'briefing', 'sales', 'seminar', 'personal', 'meetings', 'vacation', 'asq'];
const isOurs = (k, v) => k.startsWith('asq_') || (v && v._origin === 'aptsq');
(async () => {
  let pendingTotal = 0;
  for (const node of NODES) {
    let data;
    try { const r = await fetch(`${RTDB}/${node}.json`); data = await r.json(); }
    catch (e) { console.log(`### ${node}: 오류 ${e.message}`); continue; }
    const ours = Object.entries(data || {}).filter(([k, v]) => isOurs(k, v));
    if (!ours.length) continue;
    const freq = {};
    ours.forEach(([, v]) => { const d = (v && v.dateType) || '(없음)'; freq[d] = (freq[d] || 0) + 1; });
    console.log(`\n###### ${node}: 우리것 ${ours.length}건 · dateType=${JSON.stringify(freq)}`);
    ours.filter(([, v]) => v && v.dateType === 'pending').forEach(([k, v]) => {
      pendingTotal++;
      console.log(`   [예정/pending] ${k} date=${v.date} expectedMonth=${v.expectedMonth} status=${v.status} title=${v.title || v.siteName || ''}`);
    });
  }
  console.log(`\n⇒ 우리가 POUR에 넣은 예정(pending) 총 ${pendingTotal}건`);
  console.log(pendingTotal ? '✅ 예정이 POUR에 pending 으로 반영됨(POUR 달력에 표시).' : '⚠️ pending 항목이 아직 없음(배치 재실행/SQL 확인 필요).');
})().catch(e => { console.log('오류:', e.message); process.exit(1); });
