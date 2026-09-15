// 배포용 서비스계정이 App Engine 기본 SA(test-168a4@appspot)를 "act as" 할 수 있게
// roles/iam.serviceAccountUser 를 스스로에게 부여 시도. (SA가 그럴 권한이 있으면 성공)
const { GoogleAuth } = require('google-auth-library');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT = 'test-168a4';
const TARGET = `${PROJECT}@appspot.gserviceaccount.com`;
const ME = `serviceAccount:${sa.client_email}`;

(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const base = `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${TARGET}`;
  console.log('배포 SA :', sa.client_email);
  console.log('대상 SA :', TARGET);

  let pol;
  try {
    const r = await client.request({ url: `${base}:getIamPolicy`, method: 'POST', data: {} });
    pol = r.data || {};
  } catch (e) {
    console.log('❌ 이 배포 SA가 App Engine SA의 정책을 볼 권한이 없어요:', e.message);
    console.log('   → test-168a4 소유자가 직접 "서비스 계정 사용자" 권한을 줘야 해요.');
    process.exit(2);
  }
  pol.bindings = pol.bindings || [];
  let b = pol.bindings.find((x) => x.role === 'roles/iam.serviceAccountUser');
  if (!b) { b = { role: 'roles/iam.serviceAccountUser', members: [] }; pol.bindings.push(b); }
  if (!b.members.includes(ME)) b.members.push(ME);

  try {
    await client.request({ url: `${base}:setIamPolicy`, method: 'POST', data: { policy: pol } });
    console.log('✅ Service Account User 권한 자가부여 성공! 이어서 배포합니다.');
  } catch (e) {
    console.log('❌ 권한 부여 실패 (자가부여 권한 없음):', e.message);
    console.log('   → test-168a4 소유자가 IAM에서 직접 줘야 해요.');
    process.exit(2);
  }
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
