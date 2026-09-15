// meta 포함 '수정(UPDATE)' 왕복 진단: 등록 → RTDB 확인 → 수정 → RTDB가 사라지지 않고 갱신되는지 확인 → 삭제
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rget = async (p) => { const r = await fetch(`${RTDB}/${p}.json`); return r.ok ? r.json() : null; };
const metaOf = (name) => ({ type: 'asq', dateType: 'confirmed', status: '확정', mainCategory: '재도장',
  date: '2026-12-29', time: '14:00', siteName: name, title: name, workType: '외벽 재도장', address: '',
  requester: '', participants: '', competitor: '', ptProduct: '', assignees: ['한인규'], ptAssignee: '',
  assignee: '', location: '', note: '', expectedMonth: '', dateNote: '', bidDeadline: '' });

(async () => {
  const A = 'UPD테스트-' + Date.now();
  const { data: ins, error } = await sb.from('schedules').insert({
    source: 'aptsq', category: 'asq', title: A, date: '2026-12-29', resident_visible: false, meta: metaOf(A),
  }).select('id').single();
  if (error) { console.log('❌ INSERT 실패:', error.message); process.exit(1); }
  const sid = 'asq_' + ins.id;
  console.log('삽입 id=', ins.id);
  await sleep(3000);
  const v1 = await rget('asq/' + sid);
  console.log(v1 ? '① 등록 후 RTDB 있음 ✅ siteName=' + v1.siteName : '① 등록 후 RTDB 없음 ❌');

  // 수정 (siteName/title 변경)
  const B = A + '-수정';
  const { error: uerr } = await sb.from('schedules').update({ title: B, meta: metaOf(B) }).eq('id', ins.id);
  if (uerr) { console.log('❌ UPDATE 실패:', uerr.message); }
  await sleep(3500);
  const v2 = await rget('asq/' + sid);
  if (!v2) console.log('② 수정 후 RTDB 사라짐 ❌❌  ← 이게 "연결 끊김" 원인');
  else if (v2.siteName === B) console.log('② 수정 후 RTDB 있음 + 갱신됨 ✅ siteName=' + v2.siteName);
  else console.log('② 수정 후 RTDB 있음 but 갱신 안됨 ⚠️ siteName=' + v2.siteName);

  // 정리
  await sb.from('schedules').delete().eq('id', ins.id);
  await sleep(2500);
  console.log((await rget('asq/' + sid)) ? '③ 삭제 후 RTDB 잔여 ⚠️' : '③ 삭제 반영 ✅');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
