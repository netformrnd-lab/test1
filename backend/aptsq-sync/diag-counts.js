// 배포 전 정리용: 각 테이블 건수 확인(무엇이 테스트/실데이터인지 판단).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co', SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TABLES = ['profiles', 'apartments', 'apartment_auditors', 'schedules', 'reports', 'field_updates',
  'chat_messages', 'chat_reads', 'surveys', 'notices', 'cases', 'contracts', 'dong_progress',
  'roadmap_items', 'roadmap_manual', 'site_notes', 'control_sites', 'sales_leads', 'doc_files',
  'leaflets', 'credentials', 'business_cards'];
async function cnt(t, filt) {
  let q = sb.from(t).select('*', { count: 'exact', head: true });
  if (filt) q = filt(q);
  const { count, error } = await q;
  return error ? `에러(${error.message.slice(0, 40)})` : count;
}
(async () => {
  console.log('── 테이블별 건수 ──');
  for (const t of TABLES) console.log(`  ${t}: ${await cnt(t)}`);
  console.log('\n── sales_leads(아임웹/영업) 세부 ──');
  console.log(`  전체: ${await cnt('sales_leads')}`);
  console.log(`  owner='홈페이지'(웹문의): ${await cnt('sales_leads', q => q.eq('owner', '홈페이지'))}`);
  console.log(`  stage='inquiry': ${await cnt('sales_leads', q => q.eq('stage', 'inquiry'))}`);
  console.log('\n── profiles 역할별 ──');
  for (const r of ['admin', 'auditor', 'manager', 'resident']) console.log(`  ${r}: ${await cnt('profiles', q => q.eq('role', r))}`);
  console.log('\n✅ 완료');
})().catch(e => { console.log(e); process.exit(1); });
