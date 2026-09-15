// Firebase 서비스 계정(FIREBASE_SERVICE_ACCOUNT 시크릿)이 올바른지 검사 (비밀키는 출력 안 함)
const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
if (!raw.trim()) { console.log('❌ FIREBASE_SERVICE_ACCOUNT 시크릿이 비어 있어요. GitHub Secret 을 확인하세요.'); process.exit(1); }

let sa;
try { sa = JSON.parse(raw); }
catch (e) {
  console.log('❌ JSON 파싱 실패 — 다운로드한 파일 "내용 전체"를 넣었는지 확인하세요.');
  console.log('   (첫 40자:', JSON.stringify(raw.slice(0, 40)), '...)');
  console.log('   오류:', e.message);
  process.exit(1);
}

console.log('── 서비스 계정 내용 ──');
console.log('type        :', sa.type);
console.log('project_id  :', sa.project_id);
console.log('client_email:', sa.client_email);
console.log('private_key :', sa.private_key ? '있음(정상)' : '❌ 없음');
console.log('');

const okType = sa.type === 'service_account';
const okKey = !!sa.private_key;
const okProj = sa.project_id === 'test-168a4';

if (!okType) console.log('⚠️ type 이 "service_account" 가 아니에요. 잘못된 파일일 수 있어요(firebaseConfig 아님).');
if (!okKey) console.log('⚠️ private_key 가 없어요. 서비스 계정 키가 아니에요.');

if (okType && okKey && okProj) {
  console.log('✅ 정상! test-168a4 프로젝트의 서비스 계정이 맞습니다. 즉시 연동 준비 완료.');
} else if (okType && okKey && !okProj) {
  console.log(`⚠️ 서비스 계정은 맞는데 프로젝트가 "${sa.project_id}" 예요.`);
  console.log('   우리 영업일정은 test-168a4 에 있어요. 담당자에게 test-168a4 프로젝트의 키인지 확인하거나,');
  console.log('   RTDB(test-168a4-default-rtdb)가 이 프로젝트 소속인지 확인이 필요해요.');
  process.exit(2);
} else {
  console.log('❌ 서비스 계정 키가 아닌 것 같아요. 다시 받아주세요.');
  process.exit(1);
}
