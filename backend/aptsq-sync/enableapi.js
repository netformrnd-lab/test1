// 함수 배포에 필요한 Google API 들을 켠다 (SA가 소유자/serviceusage 권한 있을 때).
const { GoogleAuth } = require('google-auth-library');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT = 'test-168a4';
const APIS = [
  'cloudbilling.googleapis.com',
  'serviceusage.googleapis.com',
  'cloudfunctions.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'run.googleapis.com',
  'eventarc.googleapis.com',
  'pubsub.googleapis.com',
  'cloudscheduler.googleapis.com',
  'firebasedatabase.googleapis.com',
];
(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  for (const api of APIS) {
    try {
      await client.request({
        url: `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${api}:enable`,
        method: 'POST', data: {},
      });
      console.log('✅ 활성화 요청:', api);
    } catch (e) {
      const code = e.response && e.response.status;
      console.log(`⚠️ ${api} (HTTP ${code || '?'}):`, e.message.slice(0, 120));
    }
  }
  console.log('— API 활성화 시도 완료 (전파에 1~2분 걸릴 수 있음) —');
})().catch((e) => { console.log('오류:', e.message); });
