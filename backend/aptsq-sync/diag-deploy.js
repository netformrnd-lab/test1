// 진단: 배포된(Cloudflare) 대시보드/앱에 '예정일 date=null' 수정이 반영돼 있는지 확인.
//   러너는 인터넷 되므로 실제 배포본을 받아 코드 패턴을 검사한다.
const BASE = 'https://floral-cherry-6860.squarecm.workers.dev';
const TARGETS = [
  ['대시보드(콘솔)', BASE + '/console/index.html'],
  ['대시보드(콘솔) /', BASE + '/console/'],
  ['감리사앱 JS', BASE + '/js/supabase-app.js'],
];
// 최신 코드에만 있는 표식들
const NEW_MARKERS = [
  "dateType==='confirmed'?date:null",   // 예정이면 date=null 전송(최신)
  'dateType === \'confirmed\' ? date : null',
];
(async () => {
  for (const [label, url] of TARGETS) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      const body = await r.text().catch(() => '');
      const hasNew = NEW_MARKERS.some(m => body.includes(m));
      const hasMeta = body.includes('sm-datetype') || body.includes('sc-datetype'); // 일정타입 드롭다운
      const hasAsqBlue = body.includes('#2563eb');  // 오늘 캘린더 파란색 수정
      console.log(`[${r.status}] ${label}  (${body.length}bytes)`);
      console.log(`   · 예정=date:null 최신코드? ${hasNew ? 'O(반영됨)' : 'X(옛버전!)'}`);
      console.log(`   · 일정타입(예정/미정) 드롭다운? ${hasMeta ? 'O' : 'X'}`);
      console.log(`   · 캘린더 파란색(#2563eb) 반영? ${hasAsqBlue ? 'O' : 'X'}`);
    } catch (e) {
      console.log(`[ERR] ${label} ${url} → ${e.message}`);
    }
  }
  console.log('\n✅ 배포 진단 완료');
})();
