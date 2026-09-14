// 진단 전용: Supabase 주요 테이블 건수 + POUR 일정 월별/종류별 집계 (읽기만).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cnt(table) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  return error ? `에러(${error.message})` : `${count}건`;
}

(async () => {
  // 1) 핵심 테이블 건수 — 회원/단지/공사관리 데이터가 실제로 있는지
  console.log('── 핵심 테이블 건수 ──');
  const TABLES = ['profiles', 'apartments', 'schedules', 'reports', 'field_updates',
    'cases', 'notices', 'contracts', 'dong_progress', 'roadmap_items',
    'roadmap_manual', 'site_notes', 'control_sites', 'sales_leads', 'doc_files'];
  for (const t of TABLES) console.log(`  ${t}: ${await cnt(t)}`);

  // 2) schedules source 별
  console.log('\n── schedules source별 ──');
  for (const src of ['pour', 'aptsq', null]) {
    let q = sb.from('schedules').select('*', { count: 'exact', head: true });
    q = src === null ? q.is('source', null) : q.eq('source', src);
    const { count, error } = await q;
    console.log(`  source=${src === null ? 'null(옛날)' : src}: ${error ? '에러 ' + error.message : count + '건'}`);
  }

  // 3) POUR 일정 월별/종류별
  const byMonth = {}, byCat = {}; let total = 0, noDate = 0, min = '9999', max = '0000';
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('schedules')
      .select('date,category').eq('source', 'pour').order('date').range(from, from + 999);
    if (error) { console.log('조회 에러:', error.message); break; }
    if (!data || !data.length) break;
    for (const r of data) {
      total++;
      if (!r.date) { noDate++; continue; }
      const ym = String(r.date).slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + 1;
      byCat[r.category || '(없음)'] = (byCat[r.category || '(없음)'] || 0) + 1;
      if (r.date < min) min = r.date; if (r.date > max) max = r.date;
    }
    if (data.length < 1000) break;
  }
  console.log(`\n── POUR 일정 총 ${total}건 · 범위 ${min}~${max} ──`);
  console.log('[월별]'); Object.keys(byMonth).sort().forEach(ym => console.log(`  ${ym}: ${byMonth[ym]}`));
  console.log('[종류별]'); Object.keys(byCat).sort().forEach(c => console.log(`  ${c}: ${byCat[c]}`));
  console.log('\n✅ 진단 완료');
})().catch(e => { console.error(e); process.exit(1); });
