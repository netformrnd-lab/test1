// 관리자 콘솔 화면 스크린샷 (목 데이터) — 디자인 전/후 비교용
// 사용법:  node tools/console-screenshots.js <출력폴더> [콘솔HTML경로]
//   예)    node tools/console-screenshots.js docs/screenshots/2026-10-30-before
// 준비:    npm install  →  npx playwright install chromium  (최초 1회)
// 실제 DB에 접속하지 않고 tools/mock-data.js 의 가짜 데이터로 그립니다.
const path = require('path'); const fs = require('fs')
const { chromium } = require('playwright')
const makeMock = require('./mock-data')
const OUT = path.resolve(process.argv[2] || 'docs/screenshots/shots')
const HTML = path.resolve(process.argv[3] || 'app/console/index.html')
const SHOTS = [
  { name: '01-관제센터', go: 'dashboard' },
  { name: '02-공사관리-리스트', go: 'projects', run: "projView='list';projStage='전체';renderProjList()" },
  { name: '03-공사관리-공사중필터', go: 'projects', run: "projView='list';projStage='공사중';renderProjList()" },
  { name: '04-공사관리-칸반', go: 'projects', run: "projView='kanban';projStage='전체';renderProjList()" },
  { name: '05-공사관리-카드', go: 'projects', run: "if(typeof setProjView==='function'){projStage='전체';setProjView('cards')}", optional: true },
  { name: '06-단지상세', go: 'projects', run: "openProj('a2')" },
  { name: '07-캘린더', go: 'calendar', run: "renderCalendar();renderAssignTable()" },
  { name: '08-회원', go: 'members' }, { name: '09-영업', go: 'sales' }, { name: '10-고객관리', go: 'orgs' }, { name: '11-활동기록', go: 'history' }
]
;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await pg.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await pg.addInitScript(() => {
    const mk = () => new Proxy(function () {}, { get (t, k) { if (k === 'then') return (res) => res({ data: null, error: null }); if (k === 'data' || k === 'error') return null; return mk() }, apply () { return mk() } })
    window.supabase = { createClient: () => mk() }; window.XLSX = {}
  })
  await pg.goto('file://' + HTML, { waitUntil: 'load' }); await pg.waitForTimeout(500)
  const mock = makeMock(); const stagesSrc = fs.readFileSync(path.resolve(path.dirname(HTML), '../js/stages.js'), 'utf8')
  await pg.evaluate(({ mock, stagesSrc }) => {
    if (!window.STAGE_SETS) { try { eval(stagesSrc) } catch (e) {} }
    Object.assign(window, mock); Object.keys(mock).forEach(k => { try { eval(k + '=window["' + k + '"]') } catch (e) {} })
    try { PHASEB_OK = { sales: true, roadmap: true, docs: true, csites: true } } catch (e) {}
    document.getElementById('login').style.display = 'none'; document.getElementById('app').style.display = ''
    try { renderAll() } catch (e) { console.warn('renderAll', e.message) }
  }, { mock, stagesSrc })
  for (const s of SHOTS) {
    try {
      await pg.evaluate(({ go: g, run }) => { try { go(g) } catch (e) {} if (run) { try { eval(run) } catch (e) { console.warn(run, e.message) } } window.scrollTo(0, 0) }, s)
      await pg.waitForTimeout(250)
      await pg.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: true })
      console.log('✓', s.name)
    } catch (e) { console.log('✗', s.name, e.message) }
  }
  await b.close(); console.log('→', OUT)
})()
