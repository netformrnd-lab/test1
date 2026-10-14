// 임포트(옛 날짜)vs 테스트(최근) 구분용: 테이블별 created_at 월별 분포.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co', SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all(table, cols) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) { console.log(`  ${table} 조회오류: ${error.message}`); break; }
    if (!data || !data.length) break;
    out = out.concat(data); if (data.length < 1000) break;
  }
  return out;
}
function byMonth(rows) {
  const m = {}; rows.forEach(r => { const k = String(r.created_at || '').slice(0, 7) || '(날짜없음)'; m[k] = (m[k] || 0) + 1; });
  return m;
}
function printM(label, m) {
  console.log(`\n── ${label} (총 ${Object.values(m).reduce((a, b) => a + b, 0)}) ──`);
  Object.keys(m).sort().forEach(k => console.log(`  ${k}: ${m[k]}`));
}
(async () => {
  const fu = await all('field_updates', 'created_at,content');
  printM('field_updates(현장현황) 월별', byMonth(fu));
  const nullC = fu.filter(r => r.content == null || r.content === '').length;
  console.log(`  · content 비어있음(=임포트 추정): ${nullC} / 채워짐(=앱작성 추정): ${fu.length - nullC}`);

  const rp = await all('reports', 'created_at,content');
  printM('reports(감리일지) 월별', byMonth(rp));
  const rpNull = rp.filter(r => r.content == null || r.content === '').length;
  console.log(`  · content 비어있음: ${rpNull} / 채워짐: ${rp.length - rpNull}`);

  const dp = await all('dong_progress', 'created_at');
  printM('dong_progress(동별진행) 월별', byMonth(dp));

  const ap = await all('apartments', 'created_at');
  printM('apartments(단지) 월별 생성', byMonth(ap));

  console.log('\n✅ 완료');
})().catch(e => { console.log(e); process.exit(1); });
