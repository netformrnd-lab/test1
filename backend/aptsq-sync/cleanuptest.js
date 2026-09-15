// 남은 테스트 일정 정리: source='aptsq' 이고 title 이 '테스투'/'ㅂ' 인 것만 조회 후 삭제.
// (우리 원본을 지우면 pg_net 트리거가 POUR RTDB 짝(asq_<id>)도 함께 삭제)
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const TITLES = ['테스투', 'ㅂ'];

(async () => {
  const { data, error } = await sb
    .from('schedules').select('id,title,date,source,category')
    .eq('source', 'aptsq').in('title', TITLES);
  if (error) { console.log('❌ 조회 실패:', error.message); process.exit(1); }
  if (!data || !data.length) { console.log('정리할 테스트 일정 없음(이미 삭제됨) ✅'); return; }
  console.log('삭제 대상 ' + data.length + '건:');
  for (const r of data) console.log(`  · id=${r.id} title=${r.title} date=${r.date}`);
  const ids = data.map((r) => r.id);
  const { error: derr } = await sb.from('schedules').delete().in('id', ids);
  if (derr) { console.log('❌ 삭제 실패:', derr.message); process.exit(1); }
  console.log('✅ Supabase 원본 삭제 완료 → 트리거가 POUR 짝도 삭제');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
