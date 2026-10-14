// 우리 Supabase 에 '예정(meta.dateType=expected)' 일정이 실제로 있는지 + 매핑 결과 확인.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const M = require('./mapping');
const { SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co', SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  // 전체/소스별 건수 먼저(데이터 유실 여부 확인)
  const { count: total } = await sb.from('schedules').select('*', { count: 'exact', head: true });
  const { count: cAptsq } = await sb.from('schedules').select('*', { count: 'exact', head: true }).eq('source', 'aptsq');
  const { count: cPour } = await sb.from('schedules').select('*', { count: 'exact', head: true }).eq('source', 'pour');
  const { count: cNull } = await sb.from('schedules').select('*', { count: 'exact', head: true }).is('source', null);
  console.log(`[전체 schedules] 총 ${total}건 · aptsq ${cAptsq} · pour ${cPour} · null(옛날) ${cNull}`);
  const { data, error } = await sb.from('schedules')
    .select('id,title,category,source,date,meta').eq('source', 'aptsq').order('created_at', { ascending: false }).limit(500);
  if (error) { console.log('조회 오류', error.message); return; }
  const exp = (data || []).filter(r => r.meta && r.meta.dateType === 'expected');
  const tbd = (data || []).filter(r => r.meta && r.meta.dateType === 'tbd');
  console.log(`aptsq 일정 ${data.length}건 중 · 예정(expected) ${exp.length}건 · 미정(tbd) ${tbd.length}건`);
  exp.slice(0, 10).forEach(r => {
    console.log(`\n[예정] id=${r.id} cat=${r.category} title="${r.title}" date=${r.date} meta.dateType=${r.meta.dateType} meta.date=${r.meta.date} em=${r.meta.expectedMonth}`);
    const obj = M.supabaseToPour(r);
    console.log('   → POUR 전송 예정:', obj ? JSON.stringify({ dateType: obj.dateType, date: obj.date, status: obj.status, siteName: obj.siteName, title: obj.title, expectedMonth: obj.expectedMonth }) : 'null(전송안함)');
  });
  if (!exp.length) console.log('\n⇒ 현재 우리 DB에 예정(expected) 일정이 하나도 없음 → POUR에 0건인 건 정상. 앱/대시보드에서 예정으로 새로 등록해야 흐름 확인 가능.');
  console.log('\n✅ 완료');
})().catch(e => { console.log(e); process.exit(1); });
