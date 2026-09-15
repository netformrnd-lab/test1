// meta(POUR 상세 폼) 포함 왕복 진단: 폼이 만드는 것과 같은 meta 로 INSERT → RTDB 확인 → 삭제
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rget = async (p) => { const r = await fetch(`${RTDB}/${p}.json`); return r.ok ? r.json() : null; };

(async () => {
  const mark = 'META테스트-' + Date.now();
  // 앱/대시보드 폼이 만드는 것과 동일한 asq meta
  const meta = { type: 'asq', dateType: 'confirmed', status: '확정', mainCategory: '재도장',
    date: '2026-12-30', time: '14:00', siteName: mark, title: mark, workType: '외벽 재도장',
    address: '서울 노원구 테스트로 1', requester: '관리소장', participants: '3명', competitor: '',
    ptProduct: '', assignees: ['한인규', '조재연'], ptAssignee: '', assignee: '', location: '',
    note: '자동 meta 진단', expectedMonth: '', dateNote: '', bidDeadline: '' };
  console.log('===== meta 포함 INSERT =====', mark);
  const { data: ins, error } = await sb.from('schedules').insert({
    source: 'aptsq', category: 'asq', title: mark, description: '자동 meta 진단',
    date: '2026-12-30', resident_visible: false, meta,
  }).select('id').single();
  if (error) { console.log('❌ INSERT 실패:', error.message); process.exit(1); }
  const sid = 'asq_' + ins.id;
  console.log('  삽입 id=', ins.id, '→ asq/' + sid);
  let v = null;
  for (let i = 0; i < 12; i++) { await sleep(2200); v = await rget('asq/' + sid); if (v) break; console.log(`  … ${((i+1)*2.2).toFixed(1)}s 대기`); }
  if (v) {
    console.log('  ✅ RTDB 도착:', JSON.stringify(v));
    const ok = v.type === 'asq' && v.dateType === 'confirmed' && v.siteName === mark && Array.isArray(v.assignees) && v.assignees.length === 2;
    console.log(ok ? '  ✅ meta 필드 정상(type/dateType/siteName/담당자 배열)' : '  ⚠️ meta 필드 일부 누락/불일치');
  } else {
    console.log('  ❌ RTDB에 안 나타남 → meta 경로에서 트리거가 전송 실패(트리거 최신본 재실행 필요 가능성)');
  }
  // 정리
  await sb.from('schedules').delete().eq('id', ins.id);
  await sleep(2500);
  const gone = !(await rget('asq/' + sid));
  console.log(gone ? '  ✅ 삭제까지 반영' : '  ⚠️ 삭제 미반영(RTDB 잔여)');
  if (!gone) await fetch(`${RTDB}/asq/${sid}.json`, { method: 'DELETE' }).catch(() => {});
  console.log('\n결론:', v ? '✅ meta 경로 정상 — 백엔드 이상 없음(문제는 앱 업로드/표시 쪽)' : '❌ meta 경로 실패 — 트리거 SQL 최신본 재실행 필요');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
