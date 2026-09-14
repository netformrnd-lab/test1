// 진단 전용: Supabase schedules 에 POUR 일정이 실제로 몇 건, 어느 달에 있는지 센다.
// (동기화는 하지 않음. 읽기만.)  실행: node diag.js
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

(async () => {
  // 1) source 별 전체 건수
  for (const src of ['pour', 'aptsq', null]) {
    let q = sb.from('schedules').select('*', { count: 'exact', head: true });
    q = src === null ? q.is('source', null) : q.eq('source', src);
    const { count, error } = await q;
    console.log(`source=${src === null ? 'null(옛날)' : src} : ${error ? '에러 ' + error.message : count + '건'}`);
  }

  // 2) POUR 일정 전량을 페이지로 받아 월별/종류별 집계
  const byMonth = {}, byCat = {}; let total = 0, noDate = 0, min = '9999', max = '0000';
  const sampleSep = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('schedules')
      .select('date,category,title').eq('source', 'pour')
      .order('date').range(from, from + 999);
    if (error) { console.log('조회 에러:', error.message); break; }
    if (!data || !data.length) break;
    for (const r of data) {
      total++;
      if (!r.date) { noDate++; continue; }
      const ym = String(r.date).slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + 1;
      byCat[r.category || '(없음)'] = (byCat[r.category || '(없음)'] || 0) + 1;
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
      if (ym === '2026-09' && sampleSep.length < 5) sampleSep.push(`${r.date} [${r.category}] ${r.title}`);
    }
    if (data.length < 1000) break;
  }

  console.log(`\n── POUR 일정 총 ${total}건 (날짜없음 ${noDate}) · 날짜범위 ${min} ~ ${max} ──`);
  console.log('\n[월별 건수]');
  Object.keys(byMonth).sort().forEach(ym => console.log(`  ${ym} : ${byMonth[ym]}건`));
  console.log('\n[종류별 건수]');
  Object.keys(byCat).sort().forEach(c => console.log(`  ${c} : ${byCat[c]}건`));
  console.log(`\n[2026-09 샘플 ${sampleSep.length}건]`);
  sampleSep.forEach(s => console.log('  ' + s));
  console.log('\n✅ 진단 완료');
})().catch(e => { console.error(e); process.exit(1); });
