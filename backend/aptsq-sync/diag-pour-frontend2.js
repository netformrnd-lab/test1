// (1) RTDB에서 우리 예정 항목의 현재 dateType 확인
// (2) POUR 번들에서 '달력 셀에 일정을 배치하는 조건'을 넓은 문맥으로 추출
const RTDB = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app';
const BASE = 'https://schedules-cip.pages.dev';
async function j(u){ const r=await fetch(u); return r.json(); }
async function t(u){ const r=await fetch(u); return r.text(); }
function ctx(hay, needle, pad, max){
  const out=[]; let i=0,n=0; while((i=hay.indexOf(needle,i))!==-1 && n<(max||4)){ out.push(hay.slice(Math.max(0,i-pad),i+needle.length+pad).replace(/\s+/g,' ')); i+=needle.length; n++; } return out;
}
(async()=>{
  // (1) 우리 항목 상태
  try{
    const asq=await j(`${RTDB}/asq.json`);
    const ours=Object.entries(asq||{}).filter(([k,v])=>k.startsWith('asq_')||(v&&v._origin==='aptsq'));
    const nonConf=ours.filter(([,v])=>v&&v.dateType&&v.dateType!=='confirmed');
    console.log(`[RTDB asq] 우리것 ${ours.length}건, 비확정 ${nonConf.length}건`);
    nonConf.slice(0,5).forEach(([k,v])=>console.log(`   ${k} dateType=${v.dateType} date=${v.date} expectedMonth=${v.expectedMonth} status=${v.status}`));
  }catch(e){ console.log('RTDB 오류',e.message); }

  // (2) 번들 분석
  const idx=await t(BASE+'/');
  const m=idx.match(/["']([^"']*\/assets\/index-[^"']+\.js)["']/);
  const bundleUrl = m ? (m[1].startsWith('http')?m[1]:BASE+m[1].replace(/^\.?\//,'/')) : null;
  if(!bundleUrl){ console.log('번들 URL 못찾음'); return; }
  const b=await t(bundleUrl);
  console.log(`\n[번들] ${bundleUrl} (${b.length}b)`);

  // 달력 셀 필터: 일정을 날짜별로 거르는 곳(대개 .filter + date 비교, dateType 조건)
  console.log('\n=== "monthOnly" 넓은 문맥 ===');
  ctx(b,'monthOnly',220,8).forEach(s=>console.log('  …'+s+'…'));
  console.log('\n=== dateType==="confirmed" 필터/조건 문맥 ===');
  ['dateType==="confirmed"','dateType===\'confirmed\'','.dateType==="confirmed"'].forEach(k=>ctx(b,k,160,8).forEach(s=>console.log('  …'+s+'…')));
  console.log('\n=== 달력 그리드(날짜 매칭) 후보: ".date===" ===');
  ctx(b,'.date===',150,6).forEach(s=>console.log('  …'+s+'…'));
  console.log('\n=== "getDate(" 주변(달력 셀 생성 추정) ===');
  ctx(b,'getDate(',120,4).forEach(s=>console.log('  …'+s+'…'));
  console.log('\n✅ 완료');
})().catch(e=>{console.log('오류:',e.message);process.exit(1);});
