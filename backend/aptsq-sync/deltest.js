// POUR→아스퀘 '삭제 양방향' 검증:
//  ① 우리(aptsq) 일정 등록 → 트리거가 POUR RTDB(asq_<id>)로 보냄
//  ② POUR에서 지운 것처럼 RTDB 노드를 직접 삭제 → Firebase 함수 del()이
//     before._origin='aptsq' 를 보고 우리 Supabase 원본까지 삭제해야 함
//  ③ Supabase 원본이 사라졌는지 확인 (사라지면 성공)
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rget = async (p) => { const r = await fetch(`${RTDB}/${p}.json`); return r.ok ? r.json() : null; };
const rdel = async (p) => { await fetch(`${RTDB}/${p}.json`, { method: 'DELETE' }); };
const metaOf = (name) => ({ type: 'asq', dateType: 'confirmed', status: '확정', mainCategory: '재도장',
  date: '2026-12-27', time: '14:00', siteName: name, title: name, workType: '외벽 재도장', address: '',
  assignees: ['한인규'], note: '' });

(async () => {
  const A = 'DEL테스트-' + Date.now();
  const { data: ins, error } = await sb.from('schedules').insert({
    source: 'aptsq', category: 'asq', title: A, date: '2026-12-27', resident_visible: false, meta: metaOf(A),
  }).select('id').single();
  if (error) { console.log('❌ INSERT 실패:', error.message); process.exit(1); }
  const sid = 'asq_' + ins.id;
  console.log('삽입 id=', ins.id);
  await sleep(3500);
  const v1 = await rget('asq/' + sid);
  console.log(v1 ? '① 등록 후 POUR RTDB 있음 ✅ _origin=' + v1._origin + ' _aptsqId=' + v1._aptsqId
                 : '① 등록 후 POUR RTDB 없음 ❌ (트리거 확인 필요)');

  // ② POUR에서 삭제한 것처럼 RTDB 노드 직접 삭제 → 함수가 우리 원본을 지워야 함
  await rdel('asq/' + sid);
  console.log('② POUR RTDB 노드 삭제(=POUR에서 지운 상황)');
  await sleep(6000);

  // ③ Supabase 원본이 사라졌는지
  const { data: still } = await sb.from('schedules').select('id').eq('id', ins.id).maybeSingle();
  if (!still) { console.log('③ 우리 Supabase 원본도 삭제됨 ✅✅  (POUR→아스퀘 삭제 양방향 정상)'); }
  else {
    console.log('③ 우리 Supabase 원본 남아있음 ❌  함수 del() 미동작 → 정리 후 종료');
    await sb.from('schedules').delete().eq('id', ins.id);
    process.exit(1);
  }
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
