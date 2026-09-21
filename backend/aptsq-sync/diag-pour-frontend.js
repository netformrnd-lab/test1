// POUR 프론트(schedules-cip.pages.dev) JS 번들을 받아 '달력 렌더 조건'을 분석.
//   특히 dateType/'pending'/'confirmed'/expectedMonth/asq 노드가 어떻게 필터링되는지 확인.
const BASE = 'https://schedules-cip.pages.dev';
async function txt(u) { const r = await fetch(u, { redirect: 'follow' }); return { status: r.status, body: await r.text().catch(() => '') }; }
function ctx(hay, needle, pad = 90) {
  const out = []; let i = 0, n = 0;
  while ((i = hay.indexOf(needle, i)) !== -1 && n < 6) {
    out.push(hay.slice(Math.max(0, i - pad), i + needle.length + pad).replace(/\s+/g, ' '));
    i += needle.length; n++;
  }
  return out;
}
(async () => {
  const idx = await txt(BASE + '/');
  console.log('index.html status=' + idx.status + ' len=' + idx.body.length);
  // 스크립트 번들 경로 추출
  const srcs = [...idx.body.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  const assets = [...idx.body.matchAll(/["']([^"']*\/assets\/[^"']+\.js)["']/g)].map(m => m[1]);
  let urls = [...new Set([...srcs, ...assets])].map(s => s.startsWith('http') ? s : BASE + (s.startsWith('/') ? s : '/' + s));
  console.log('발견한 JS 번들:', urls.length, JSON.stringify(urls.slice(0, 10)));
  // 각 번들에서 렌더 조건 키워드 탐색
  const KEYS = ['pending', 'confirmed', 'expectedMonth', 'dateType', 'originalType', "'asq'", '"asq"'];
  for (const u of urls) {
    let b;
    try { b = (await txt(u)).body; } catch (e) { console.log('  [ERR]', u, e.message); continue; }
    if (!b || b.length < 100) continue;
    const hits = KEYS.filter(k => b.includes(k));
    if (!hits.length) continue;
    console.log('\n=====================', u, '(' + b.length + 'b) hits=' + JSON.stringify(hits));
    for (const k of ['pending', 'expectedMonth', 'dateType']) {
      if (!b.includes(k)) continue;
      console.log(`  --- "${k}" 주변 ---`);
      ctx(b, k).forEach(s => console.log('    …' + s + '…'));
    }
  }
  console.log('\n✅ 프론트 분석 완료');
})().catch(e => { console.log('오류:', e.message); process.exit(1); });
