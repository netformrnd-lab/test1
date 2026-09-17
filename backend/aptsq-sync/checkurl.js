// 후보 주소들이 실제로 열리는지 + 갤러리 페이지인지 확인(러너는 인터넷 됨)
const URLS = [
  'https://gamri-app.vercel.app/',
  'https://gamri-app.vercel.app/photos/',
  'https://gamri-app.vercel.app/photos/index.html',
  'https://floral-cherry-6860.squarecm.workers.dev/',
  'https://floral-cherry-6860.squarecm.workers.dev/photos/',
];
(async () => {
  for (const u of URLS) {
    try {
      const r = await fetch(u, { redirect: 'follow' });
      const ct = r.headers.get('content-type') || '';
      const body = await r.text().catch(() => '');
      const isGallery = body.includes('현장 사진') && body.includes('grid');
      const isApp = /감리|아파트스퀘어|<title/i.test(body);
      console.log(
        `[${r.status}] ${u}\n   content-type=${ct} · 갤러리페이지?=${isGallery ? 'O' : 'X'} · 앱/HTML?=${isApp ? 'O' : 'X'} · ${body.length}bytes`
      );
    } catch (e) {
      console.log(`[ERR] ${u} → ${e.message}`);
    }
  }
})();
