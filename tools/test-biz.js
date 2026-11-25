// 경영지원 연동(거래처 명부 · 청구 요청 구분 · 연동 패널) 브라우저 테스트 — node tools/test-biz.js [screenshot.png]
const path=require('path'); const {chromium}=require('playwright'); const makeMock=require('./mock-data'); const fs=require('fs')
const HTML=path.resolve(__dirname,'../app/console/index.html'); const OUT=process.argv[2]
let fails=0; const ok=(c,m)=>{ console.log((c?'✓ ':'✗ ')+m); if(!c)fails++ }
;(async()=>{
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1600,height:1000}})
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message))
  await pg.route(/cdn\.jsdelivr\.net|cdnjs/,r=>r.fulfill({status:200,contentType:'application/javascript',body:''}))
  await pg.addInitScript(()=>{ window.__calls=[]; window.__idc=0
    const chain=(state)=>new Proxy(function(){},{ get(t,k){ if(k==='then')return (res)=>{ let data=null; if(state.op==='insert'){ const rows=Array.isArray(state.payload)?state.payload:[state.payload]; const w=rows.map(r=>({id:'gen-'+(++window.__idc),created_at:new Date().toISOString(),...r})); data=state.single?w[0]:w } if(state.op==='update'&&state.single)data={...state.payload}; res({data,error:null}) }
        if(k==='data'||k==='error')return null
        if(k==='functions'||k==='storage'||k==='auth')return chain(state)
        return (...args)=>{ const ns={...state}; if(k==='from')ns.table=args[0]; else if(k==='insert'){ns.op='insert';ns.payload=args[0]} else if(k==='update'){ns.op='update';ns.payload=args[0]} else if(k==='delete'){ns.op='delete'} else if(k==='single')ns.single=true; else if(k==='invoke'){ns.op='invoke'; window.__invoked=args} if(['insert','update','delete','upsert'].includes(k))window.__calls.push({table:ns.table,op:k,payload:args[0]}); return chain(ns) } }, apply(){ return chain(state) } })
    window.supabase={createClient:()=>chain({})}
    window.__prompts=[]; window.prompt=(q,d)=>{ window.__prompts.push(q); return d }; window.confirm=()=>true; window.alert=(m)=>{ (window.__alerts=window.__alerts||[]).push(m) } })
  await pg.goto('file://'+HTML,{waitUntil:'load'}); await pg.waitForTimeout(300)
  const mock=makeMock(); const stagesSrc=fs.readFileSync(path.resolve(__dirname,'../app/js/stages.js'),'utf8')
  await pg.evaluate(({mock,stagesSrc})=>{ if(!window.STAGE_SETS){try{eval(stagesSrc)}catch(e){}} Object.assign(window,mock); Object.keys(mock).forEach(k=>{try{eval(k+'=window["'+k+'"]')}catch(e){}}); PHASEB_OK={sales:true,roadmap:true,docs:true,csites:true,scontracts:true,receivables:true,partners:true}; SCONTRACTS=[]; RITEMS=[]; RNOTES=[]; PARTNERS=[]; BIZC=[{id:'B1',complex_name:'대전 파밀리에',contract_name:'외벽 감리',client_name:'(주)가나건설',total_amount:3300000,phases:{}},{id:'B2',complex_name:'아무단지',contract_name:'x',client_name:'y',total_amount:1}]; BIZLOG=[{at:'2026-11-25T01:00:00Z',direction:'info',action:'run',detail:'그쪽 계약 2건 읽음',ok:true}]; document.getElementById('login').style.display='none'; document.getElementById('app').style.display='' },{mock,stagesSrc})
  await pg.evaluate(async()=>{ await ensureContractsForApts(); await ensureReceivableItems(); renderAll(); go('receivables') }); await pg.waitForTimeout(150)
  // 1) 목록 툴바 버튼 · 레일 카드
  const r1=await pg.evaluate(()=>({btns:[...document.querySelectorAll('#arRoot .toolbar button')].map(b=>b.textContent.trim()),rail:!!document.querySelector('#arRoot .card h3')&&[...document.querySelectorAll('#arRoot .card h3')].some(h=>/경영지원팀 연동/.test(h.textContent))}))
  ok(r1.btns.includes('거래처 명부')&&r1.btns.some(x=>/경영지원 연동/.test(x))&&r1.rail,'미수금 탭: 거래처 명부 · 경영지원 연동 버튼 + 레일 카드')
  // 2) 거래처 명부: 추가 → 저장
  await pg.evaluate(()=>openPartners()); await pg.waitForTimeout(80)
  const emptyTxt=await pg.evaluate(()=>document.querySelector('#ptRoot').textContent)
  ok(/등록된 거래처가 없어요/.test(emptyTxt),'거래처 명부 빈 상태')
  await pg.evaluate(()=>openPartnerEdit(null)); await pg.waitForTimeout(50)
  await pg.fill('#pt-name','주식회사 한빛건설'); await pg.fill('#pt-reg_no','123-45-67890'); await pg.fill('#pt-rep_name','김대표'); await pg.fill('#pt-email','tax@hanbit.co.kr')
  await pg.evaluate(()=>{ window.__calls.length=0 }); await pg.evaluate(()=>savePartner(null)); await pg.waitForTimeout(100)
  const p1=await pg.evaluate(()=>({n:PARTNERS.length,name:PARTNERS[0]&&PARTNERS[0].name,calls:window.__calls.map(c=>c.table+'.'+c.op),rows:document.querySelectorAll('#ptRoot tbody tr').length,txt:document.querySelector('#ptRoot').textContent.replace(/\s+/g,' ')}))
  ok(p1.n===1&&p1.name==='주식회사 한빛건설'&&p1.calls.includes('partners.insert')&&p1.rows===1&&/없음/.test(p1.txt),'거래처 추가 저장 · 목록에 1건 · 사업자등록증 없음 표시')
  // 3) 계약 건 수정 모달: 거래처 선택 + 연동 체크
  const cid=await pg.evaluate(()=>aptContracts('a2')[0].id)
  await pg.evaluate((cid)=>openContractEdit(cid),cid); await pg.waitForTimeout(80)
  const m3=await pg.evaluate(()=>({sel:!!document.getElementById('sc-partner'),opts:[...document.querySelectorAll('#sc-partner option')].map(o=>o.textContent),chk:!!document.getElementById('sc-bizsync')}))
  ok(m3.sel&&m3.chk&&m3.opts.some(o=>/한빛건설/.test(o)),'계약 건 수정 모달: 거래처 select(명부 반영) + 연동 체크박스')
  // 연동 체크만 하고 거래처 없음 → 막힘
  await pg.check('#sc-bizsync'); await pg.evaluate((cid)=>submitContractEdit(cid),cid); await pg.waitForTimeout(80)
  const m3b=await pg.evaluate(()=>document.getElementById('m-msg')&&document.getElementById('m-msg').textContent)
  ok(/거래처를 골라/.test(m3b||''),'연동 체크 + 거래처 미선택 → 저장 차단 안내')
  await pg.selectOption('#sc-partner',{index:1}); await pg.evaluate((cid)=>submitContractEdit(cid),cid); await pg.waitForTimeout(100)
  const m3c=await pg.evaluate((cid)=>{ const c=SCONTRACTS.find(x=>x.id===cid); return {pid:c.partner_id,sync:c.biz_sync,up:window.__calls.filter(x=>x.table==='site_contracts'&&x.op==='update').pop()} },cid)
  ok(m3c.pid&&m3c.sync===true&&m3c.up&&m3c.up.payload.biz_sync===true&&m3c.up.payload.partner_id===m3c.pid,'거래처 + 연동 저장 → site_contracts.partner_id/biz_sync')
  // 새 거래처 인라인 생성 (계약 추가 모달)
  await pg.evaluate(()=>openContractAdd('a3')); await pg.waitForTimeout(60)
  await pg.evaluate(()=>toggleNewPartner()); await pg.fill('#sc-pn-name','태전종합건설(주)'); await pg.fill('#sc-ca','2200000')
  await pg.evaluate(()=>{ window.__calls.length=0 }); await pg.evaluate(()=>submitContractAdd('a3',2)); await pg.waitForTimeout(120)
  const m3d=await pg.evaluate(()=>({n:PARTNERS.length,last:PARTNERS[PARTNERS.length-1].name,calls:window.__calls.map(c=>c.table+'.'+c.op)}))
  ok(m3d.n===2&&m3d.last==='태전종합건설(주)'&&m3d.calls.indexOf('partners.insert')<m3d.calls.indexOf('site_contracts.insert'),'계약 건 추가 모달에서 새 거래처 인라인 생성 → 거래처 먼저 저장 후 계약 건 저장')
  // 4) 청구 요청 모달: 구분 선택 · 묶음 · biz_push pending
  const downId=await pg.evaluate((cid)=>{ const its=arItems(cid); its.forEach(i=>{ i.paid_amount=null; i.status='open'; i.request_at=null }); return its.find(i=>i.kind==='down').id },cid)
  await pg.evaluate((id)=>openArRequest(id),downId); await pg.waitForTimeout(80)
  const q1=await pg.evaluate(()=>({opts:[...document.querySelectorAll('input[name="arq-kind"]')].map(r=>r.value),txt:document.querySelector('#modalBox').textContent.replace(/\s+/g,' ')}))
  ok(q1.opts.join(',')==='down,downAndFinal'&&/자동 전송/.test(q1.txt)&&/사업자등록증 없음/.test(q1.txt),'청구 요청 모달: 계약금 / 계약금+잔금 선택 · 자동 전송 안내 · 등록증 없음 경고')
  await pg.check('input[name="arq-kind"][value="downAndFinal"]'); await pg.fill('#arq-memo','착공 후 일괄 청구')
  await pg.evaluate(()=>{ window.__calls.length=0 }); await pg.evaluate((id)=>submitArRequest(id),downId); await pg.waitForTimeout(150)
  const q2=await pg.evaluate((cid)=>{ const its=arItems(cid); return {items:its.map(i=>[i.kind,i.request_at,i.request_kind,i.biz_group,i.biz_push,i.request_memo]),ups:window.__calls.filter(x=>x.table==='receivable_items'&&x.op==='update').length,alerts:arAlerts(SCONTRACTS.find(x=>x.id===cid)).map(x=>x.step)} },cid)
  console.log('  항목:',JSON.stringify(q2.items))
  const dn=q2.items.find(x=>x[0]==='down'), fn=q2.items.find(x=>x[0]==='final')
  ok(dn&&fn&&dn[1]&&fn[1]===dn[1]&&dn[2]==='downAndFinal'&&fn[2]==='downAndFinal'&&dn[3]&&dn[3]===fn[3]&&dn[4]==='pending'&&fn[4]==='pending'&&dn[5]==='착공 후 일괄 청구'&&q2.ups===2,'계약금+잔금 한 번에 → 두 항목 같은 요청일·묶음 id·전송 대기')
  ok(!q2.alerts.includes('request'),'청구 후 "청구 필요" 알림 사라짐')
  // 5) 상세 카드: 경영지원 시스템 줄 · 묶음 배지 · 목록 셀 · 전송 오류 → 다시 전송
  await pg.evaluate((cid)=>openArDetail(cid),cid); await pg.waitForTimeout(80)
  const d1=await pg.evaluate(()=>({txt:document.querySelector('#arDetail').textContent.replace(/\s+/g,' '),bizRows:[...document.querySelectorAll('#arDetail .ar-st')].filter(e=>/경영지원 시스템/.test(e.textContent)).length,bundle:document.querySelectorAll('#arDetail .ar-item .pill[title]').length}))
  ok(d1.bizRows===2&&/전송 대기/.test(d1.txt)&&d1.bundle===2&&/거래처 주식회사 한빛건설/.test(d1.txt)&&/경영지원 연동/.test(d1.txt),'상세: 항목마다 경영지원 시스템 줄(전송 대기) · 묶음 배지 · 머리글 거래처/연동 표시')
  await pg.evaluate((id)=>{ const i=RITEMS.find(x=>x.id===id); i.biz_push='error'; i.biz_error='거래처가 지정되지 않아 전송하지 못함'; renderArDetail() },downId); await pg.waitForTimeout(50)
  const d2=await pg.evaluate(()=>({retry:[...document.querySelectorAll('#arDetail button')].some(b=>b.textContent==='다시 전송'),txt:document.querySelector('#arDetail').textContent}))
  ok(d2.retry&&/전송 오류/.test(d2.txt)&&/거래처가 지정되지 않아/.test(d2.txt),'전송 오류 → 사유 + 다시 전송 버튼')
  await pg.evaluate((id)=>arRetryPush(id),downId); await pg.waitForTimeout(80)
  const d3=await pg.evaluate((id)=>RITEMS.find(x=>x.id===id).biz_push,downId); ok(d3==='pending','다시 전송 → 전송 대기')
  // 그쪽에서 발행완료가 반영된 모습 (함수가 쓰는 값) → 상태 pill
  await pg.evaluate((id)=>{ const i=RITEMS.find(x=>x.id===id); Object.assign(i,{biz_push:'sent',biz_request_id:'R1',biz_request_no:'TIR-26-0003',biz_request_status:'발행완료',invoice_at:'2026-11-26',invoice_amount:1650000,invoice_by:'경영지원 연동'}); renderReceivables(); renderArDetail() },downId); await pg.waitForTimeout(80)
  const d4=await pg.evaluate(()=>({det:document.querySelector('#arDetail').textContent.replace(/\s+/g,' '),list:[...document.querySelectorAll('.ar-table tbody tr')].find(t=>/대전 파밀리에/.test(t.textContent)).textContent.replace(/\s+/g,' ')}))
  ok(/발행완료 · TIR-26-0003/.test(d4.det)&&/경영지원 발행완료/.test(d4.list)&&/2026-11-26/.test(d4.det),'발행완료 반영 → 상세 요청번호·발행일, 목록 셀 경영지원 상태')
  // 6) 연동 패널: 현황 · 비슷한 계약 제안 → 연결 · 로그 · 지금 동기화 호출
  await pg.evaluate(()=>openBizPanel()); await pg.waitForTimeout(80)
  const b1=await pg.evaluate(()=>({txt:document.querySelector('#bizRoot').textContent.replace(/\s+/g,' '),rows:document.querySelectorAll('#bizRoot tbody tr').length,sel:!!document.querySelector('#bizRoot tbody select'),selOpts:[...document.querySelectorAll('#bizRoot tbody select option')].map(o=>o.textContent)}))
  ok(b1.rows===1&&b1.sel&&b1.selOpts.some(o=>/대전 파밀리에 · 외벽 감리/.test(o))&&!b1.selOpts.some(o=>/아무단지/.test(o))&&/그쪽 계약 2건 읽음/.test(b1.txt)&&/마지막 2026-11-25/.test(b1.txt),'연동 패널: 연동 계약 1건 · 이름 비슷한 그쪽 계약만 제안 · 로그 · 마지막 동기화')
  await pg.evaluate((cid)=>bizLinkContract(cid,'B1'),cid); await pg.waitForTimeout(80)
  const b2=await pg.evaluate((cid)=>{ const c=SCONTRACTS.find(x=>x.id===cid); return {id:c.biz_contract_id,name:c.biz_contract_name,txt:document.querySelector('#bizRoot').textContent.replace(/\s+/g,' ')} },cid)
  ok(b2.id==='B1'&&b2.name==='대전 파밀리에 · 외벽 감리'&&/연결 해제/.test(b2.txt),'계약 연결 → biz_contract_id 저장 · 해제 링크')
  await pg.evaluate(()=>bizSyncNow()); await pg.waitForTimeout(150)
  const b3=await pg.evaluate(()=>({inv:window.__invoked,msg:(document.getElementById('biz-msg')||{}).textContent}))
  ok(b3.inv&&b3.inv[0]==='biz-sync'&&b3.inv[1].body.source==='console','지금 동기화 → biz-sync 함수 호출(source=console)'); console.log('  동기화 메시지:',b3.msg)
  // 7) 현장 상세 계약·수금 카드 거래처 줄
  await pg.evaluate(()=>{ closeModal(); go('projects'); openProj('a2') }); await pg.waitForTimeout(120)
  const pj=await pg.evaluate(()=>document.querySelector('#projDetail').textContent.replace(/\s+/g,' '))
  ok(/거래처 \(세금계산서\) ?주식회사 한빛건설/.test(pj)&&/경영지원 연동/.test(pj),'현장 상세 계약·수금 카드에 거래처 · 연동 표시'); if(!/한빛건설/.test(pj))console.log('   proj:',pj.slice(0,400))
  // 8) 엑셀 열 추가
  await pg.evaluate(()=>{ window.__sheets={}; window.XLSX={utils:{book_new:()=>({}),json_to_sheet:r=>r,book_append_sheet:(wb,ws,n)=>{window.__sheets[n]=ws}},writeFile:()=>{}}; exportArExcel() })
  const xl=await pg.evaluate(()=>Object.keys((window.__sheets['청구 항목']||[{}])[0]||{}))
  ok(xl.includes('청구구분')&&xl.includes('경영지원요청번호')&&xl.includes('경영지원상태'),'엑셀 청구 항목 시트에 청구구분 · 경영지원 열')
  if(OUT){ await pg.evaluate(()=>{ go('receivables'); renderReceivables(); openBizPanel() }); await pg.waitForTimeout(150); await pg.screenshot({path:OUT,fullPage:false}); await pg.evaluate((id)=>openArRequest(id),downId); await pg.waitForTimeout(120); await pg.screenshot({path:OUT.replace('.png','-request.png'),fullPage:false}) }
  console.log('alerts:',await pg.evaluate(()=>window.__alerts||[])); console.log('errors:',errs.filter(e=>!/reading 'user'|getUser/.test(e))); console.log(fails?'FAIL '+fails:'ALL PASS'); await b.close(); process.exit(fails?1:0)
})()
