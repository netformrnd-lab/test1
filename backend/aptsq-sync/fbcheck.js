// Firebase 서비스 계정 검사 + 이 계정이 test-168a4(우리 데이터) 에 접근 가능한지 확인
const { GoogleAuth } = require('google-auth-library');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
if (!raw.trim()) { console.log('❌ FIREBASE_SERVICE_ACCOUNT 시크릿이 비어 있어요.'); process.exit(1); }
let sa;
try { sa = JSON.parse(raw); }
catch (e) { console.log('❌ JSON 파싱 실패 — 파일 내용 전체를 넣었는지 확인:', e.message); process.exit(1); }

console.log('── 서비스 계정 ──');
console.log('type        :', sa.type);
console.log('project_id  :', sa.project_id);
console.log('client_email:', sa.client_email);
console.log('private_key :', sa.private_key ? '있음' : '❌ 없음');
console.log('');

(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  async function listInstances(proj) {
    const url = `https://firebasedatabase.googleapis.com/v1beta/projects/${proj}/locations/-/instances`;
    const res = await client.request({ url });
    return res.data.instances || [];
  }

  // 1) 이 계정 소속 프로젝트의 RTDB 인스턴스
  try {
    const own = await listInstances(sa.project_id);
    console.log(`── 이 계정 프로젝트(${sa.project_id})의 RTDB 인스턴스 ──`);
    own.forEach(i => console.log('  ', i.name, '·', i.databaseUrl));
    if (!own.length) console.log('  (없음)');
    console.log('');
  } catch (e) { console.log('이 프로젝트 인스턴스 조회 실패:', e.message, '\n'); }

  // 2) 핵심: 이 계정이 test-168a4 프로젝트에 접근되는지 (즉시연동 함수 배포 가능 여부)
  console.log('── test-168a4 (우리 영업일정 데이터) 접근 가능한지 ──');
  try {
    const t = await listInstances('test-168a4');
    console.log('✅ 이 계정이 test-168a4 에 접근돼요! RTDB 인스턴스:');
    t.forEach(i => console.log('  ', i.name, '·', i.databaseUrl));
    console.log('\n➡️ 결론: 이 서비스 계정으로 즉시 연동(POUR→아스퀘) 설치 가능합니다.');
  } catch (e) {
    const code = e.response && e.response.status;
    console.log(`❌ test-168a4 접근 불가 (HTTP ${code || '?'}): ${e.message}`);
    console.log('\n➡️ 결론: 이 서비스 계정은 test-168a4(영업일정이 실제 있는 프로젝트)에');
    console.log('   접근 권한이 없어요. 즉시 연동 함수를 그 프로젝트에 설치할 수 없습니다.');
    console.log('   → test-168a4 프로젝트 자체의 서비스 계정 키가 필요하거나,');
    console.log('     POUR 앱을 고쳐서 아스퀘에도 함께 저장하는 방식으로 가야 해요.');
  }
})().catch(e => { console.log('오류:', e.message); process.exit(1); });
