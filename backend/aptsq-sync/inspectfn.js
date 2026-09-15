// 삭제된 함수의 최신 소스 zip 을 Storage 에서 내려받는다.
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const BUCKET = 'gcf-sources-955362696992-us-central1';
// 2026-12-26 마지막 배포본(모든 알림 함수 코드가 이 한 zip 에 들어있음)
const OBJ = 'sendDailyNotification-71372573-0d06-400e-8192-3f2660f2235d/version-3/function-source.zip';
(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  const client = await auth.getClient();
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(OBJ)}?alt=media`;
  const res = await client.request({ url, responseType: 'arraybuffer' });
  fs.writeFileSync('restore-src.zip', Buffer.from(res.data));
  console.log('✅ 다운로드 완료:', fs.statSync('restore-src.zip').size, 'bytes');
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
