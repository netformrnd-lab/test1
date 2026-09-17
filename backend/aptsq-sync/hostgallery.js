// 사진 모아보기 갤러리 페이지를 Supabase 공개 스토리지('web' 버킷)에 올린다.
//  → 앱 배포와 무관하게 공개 URL 로 열림. 잔디 링크가 이 주소를 가리킴.
//  업로드 파일: app/photos/index.html → web/gallery.html (Content-Type: text/html)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.log('❌ 키 없음'); process.exit(1); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

(async () => {
  const htmlPath = path.join(__dirname, '..', '..', 'app', 'photos', 'index.html');
  const html = fs.readFileSync(htmlPath);
  console.log('갤러리 HTML 읽음:', html.length, 'bytes');

  // 1) 공개 버킷 'web' 준비(있으면 그대로)
  const { error: bErr } = await sb.storage.createBucket('web', { public: true });
  if (bErr && !/already exists|duplicate/i.test(bErr.message)) console.log('버킷 생성 경고:', bErr.message);
  else console.log('버킷 web 준비 완료(public)');

  // 2) gallery.html 업로드 — content-type 을 확실히 text/html 로 지정(REST 직접 호출).
  //    (supabase-js upload 는 content-type 이 text/plain 으로 저장되어 브라우저가 렌더 안 함)
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/web/gallery.html`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'text/html; charset=utf-8',
      'x-upsert': 'true', 'cache-control': 'max-age=60',
    },
    body: html,
  });
  if (!upRes.ok) { console.log('❌ 업로드 실패:', upRes.status, await upRes.text().catch(() => '')); process.exit(1); }

  const url = `${SUPABASE_URL}/storage/v1/object/public/web/gallery.html`;
  console.log('✅ 업로드 완료:', url);

  // 3) 실제로 공개 접근되는지 확인(러너는 인터넷 됨)
  try {
    const r = await fetch(url + '?f=test.jpg');
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    const htmlType = /text\/html/i.test(ct);
    console.log('공개 확인: HTTP', r.status, '· content-type=', ct, '· html렌더?', htmlType ? 'O' : 'X(text/plain이면 소스로 보임)');
    if (r.status === 200 && htmlType && body.includes('현장 사진')) console.log('🎉 갤러리 페이지 정상 서비스(브라우저 렌더 OK)');
    else { console.log('⚠️ content-type 이 text/html 이 아님 → 렌더 안 됨'); process.exit(1); }
  } catch (e) { console.log('확인 요청 실패:', e.message); }

  console.log('\n잔디 링크 base 로 이 주소를 쓰세요:\n  ' + url);
})().catch((e) => { console.log('오류:', e.message); process.exit(1); });
