// 최근 우리(aptsq) 일정이 POUR RTDB 로 실제 갔는지 대조 진단
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const NODE = { pt: 'pt', bids: 'briefing', sales: 'sales', seminar: 'seminar', personal: 'personal', meeting: 'meetings', vacation: 'vacation', asq: 'asq' };
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const rget = async (p) => { const r = await fetch(`${RTDB}/${p}.json`); return r.ok ? r.json() : null; };

(async () => {
  const { data, error } = await sb.from('schedules')
    .select('id,category,date,title,source,meta,created_at,apartment_id')
    .eq('source', 'aptsq').order('created_at', { ascending: false }).limit(15);
  if (error) { console.log('조회 실패:', error.message); process.exit(1); }
  console.log(`최근 우리(aptsq) 일정 ${data.length}건 — RTDB 도착 대조\n`);
  for (const s of data) {
    const node = NODE[s.category];
    const line = `• [${s.created_at ? s.created_at.slice(0, 16).replace('T', ' ') : '?'}] "${(s.title || '').slice(0, 24)}" 분류=${s.category || '(없음)'} 날짜=${s.date || '(없음)'} meta=${s.meta ? 'O' : 'X'}`;
    if (!node) { console.log(line + `  → ⏹ POUR 대상 아님(${s.category === 'work' ? '공사일정' : '분류없음'})`); continue; }
    const v = await rget(`${node}/asq_${s.id}`);
    if (v) {
      const dt = v.dateType || '(none)';
      const shown = (node === 'sales' || node === 'meetings') ? true : (dt === 'confirmed');
      console.log(line + `  → ✅ RTDB ${node} 있음 (dateType=${dt}${shown ? '' : ' ⚠️예정/미정이라 POUR 달력엔 안뜸'})`);
    } else {
      console.log(line + `  → ❌ RTDB ${node} 에 없음!`);
    }
  }
  console.log('\n판독: ❌=트리거 미전송, ⏹=work/분류없음(정상적으로 POUR 안감), ⚠️=확정일 아님(POUR 달력 미표시)');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
