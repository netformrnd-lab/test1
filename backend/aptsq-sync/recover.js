// 삭제된 함수(us-central1)의 소스 zip 이 Storage 에 남아있는지 찾는다.
const { GoogleAuth } = require('google-auth-library');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT = 'test-168a4';
(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const b = await client.request({ url: `https://storage.googleapis.com/storage/v1/b?project=${PROJECT}` });
  const buckets = (b.data.items || []).map((x) => x.name);
  console.log('버킷 목록:', buckets.join(', ') || '(없음)');
  for (const bk of buckets) {
    let pageToken = '', shown = 0;
    do {
      let url = `https://storage.googleapis.com/storage/v1/b/${bk}/o?maxResults=1000`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      let o;
      try { o = await client.request({ url }); }
      catch (e) { console.log(`[${bk}] 목록 실패:`, e.message.slice(0, 100)); break; }
      const items = o.data.items || [];
      const cand = items.filter((x) => /(source|gcf|function|us-central1|\.zip)/i.test(x.name));
      if (cand.length && shown < 60) {
        console.log(`\n[${bk}]`);
        cand.slice(0, 60 - shown).forEach((x) => { console.log('  ', x.name, '·', x.updated, '·', Math.round((x.size || 0) / 1024) + 'KB'); shown++; });
      }
      pageToken = o.data.nextPageToken || '';
    } while (pageToken && shown < 60);
  }
  console.log('\n— 검색 완료 —');
})().catch((e) => console.log('오류:', e.message));
