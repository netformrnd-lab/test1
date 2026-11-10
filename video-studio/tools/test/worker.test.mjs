import worker from './w.mjs'   // 만들기: video-studio/tools/test/run.sh
const STORE = {}, CALLS = { claude: 0, openai: 0 }
let SCORE = 95
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } })
const SRC = '외벽 재도장 공사는 바탕면 처리가 품질의 70%를 좌우합니다. 감리자는 크랙 보수와 고압세척 상태를 단계별로 확인합니다.'
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  if (url.endsWith('/auth/v1/user')) return J({ id: 'admin1' })
  if (url.includes('/rest/v1/profiles')) return J([{ role: 'admin' }])
  if (url.includes('/storage/v1/bucket')) return J({})
  if (url.includes('/storage/v1/object/sign/')) return J({ signedURL: '/object/sign/x?token=1' })
  const m = url.match(/\/storage\/v1\/object\/studio\/([^?]+)/)
  if (m) { if ((init.method || 'GET') === 'GET') return STORE[m[1]] ? new Response(STORE[m[1]]) : new Response('nf', { status: 404 }); STORE[m[1]] = init.body; return J({}) }
  if (url.startsWith('https://api.anthropic.com/v1/models')) return J({ data: [{ id: 'claude-opus-5', display_name: 'Opus' }] })
  if (url.startsWith('https://api.anthropic.com/v1/messages')) {
    CALLS.claude++
    const b = JSON.parse(init.body)
    const c0 = b.messages[0].content
    if (Array.isArray(c0) && c0[0].type === 'document') { globalThis.PDFCALLS = (globalThis.PDFCALLS || []).concat({ model: b.model, url: c0[0].source.url }); return J({ content: [{ type: 'text', text: '외벽 재도장 감리 지침 PDF 본문입니다. 감리자는 바탕면 처리 기록을 확인합니다.' }], usage: { input_tokens: 5, output_tokens: 5 } }) }
    const review = /독립 검수자/.test(b.system)
    const srcId = (JSON.parse(STORE['sources.json'] || '[]')[0] || {}).id
    const out = review ? { pass: SCORE >= 90, grounding: SCORE, brand: SCORE, clarity: SCORE, production: SCORE, issues: SCORE >= 90 ? [] : ['고칠 점'] }
      : { title: '외벽 재도장', blockers: [], scenes: [
        { seconds: 30, onScreen: '바탕면이 핵심', visual: '현장', citations: [{ sourceId: srcId, quote: '바탕면 처리가 품질의 70%를 좌우합니다', claim: 'c' }], cuts: [{ narration: '바탕면이 중요합니다.', photoId: '', imagePrompt: '', videoPrompt: '' }] },
        { seconds: 30, onScreen: '단계별 확인', visual: '점검', citations: [{ sourceId: srcId, quote: '감리자는 크랙 보수와 고압세척 상태를', claim: 'c' }], cuts: [{ narration: '단계별로 확인합니다.', photoId: '', imagePrompt: '', videoPrompt: '' }] }] }
    return J({ content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 10 } })
  }
  if (url.startsWith('https://netformrnd.synology.me/brand/studio-feed.php')) {
    if (!url.includes('key=hubkey')) return J({ ok: false, error: 'bad key' })
    const U = new URL(url), act = U.searchParams.get('action'), P = '/volume1/넷폼알앤디 공유폴더/마케팅 공유폴더 외장하드 백업/00. 브랜드 공유폴더/'
    if (act === 'search') { globalThis.SEARCHES = (globalThis.SEARCHES || []).concat(U.searchParams.get('q')); return J({ ok: true, q: U.searchParams.get('q'), count: 4, results: U.searchParams.get('q').includes('외벽') ? [
      { name: '외벽감리.txt', path: P + '010. 아파트스퀘어/외벽감리.txt', text: '외벽 재도장 감리 요약' },
      { name: 'POUR외벽.txt', path: P + '004. POUR스토어/POUR외벽.txt', text: '외벽 재도장 포어 자재' },
      { name: '카페.txt', path: P + '#_마케팅팀/카페.txt', text: '외벽 재도장은 포어스토어에서 셀프로' },
      { name: 'app.js', path: P + '#_마케팅팀/app.js', text: 'function x(){ var a = {외벽:1}; }' },
      { name: '섞인.txt', path: P + '#_마케팅팀/섞인.txt', text: '외벽 재도장 안내' },
      { name: '외벽지침.pdf', path: P + '010. 아파트스퀘어/외벽지침.pdf', text: '외벽 재도장 지침' }] : [] }) }
    if (act === 'file') { const fp = U.searchParams.get('path'); globalThis.FILES = (globalThis.FILES || []).concat(fp)
      if (fp.endsWith('.pdf')) return new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), { headers: { 'content-type': 'application/pdf' } })
      return new Response(fp.endsWith('외벽감리.txt') ? '외벽 재도장 감리 원본입니다. 감리자는 시공사가 제출한 바탕면 처리 기록을 확인하고 검토합니다. 단계마다 사진 기록을 남깁니다.' : '외벽 재도장 안내 원본. POUR공법 자재로 시공합니다.', { headers: { 'content-type': 'text/plain; charset=utf-8' } }) }
    return J({ ok: true, brands: [{ name: '아파트스퀘어', '톤·가이드': '신뢰감 있는 전문가 어조. 과장 금지.', 자료: [{ name: '로고 원본', url: 'https://nas/logo.ai' }, 'https://nas/photo1.jpg'], 문서: [{ title: '서비스 소개서', link: 'https://nas/intro.pdf' }, { title: '외벽 가이드', url: 'https://nas/guide.txt' }] }, { name: '다른브랜드', '톤·가이드': 'x', 자료: [], 문서: [] }, { name: 'POUR공법', '톤·가이드': 'y', 자료: [], 문서: [] }] })
  }
  if (url === 'https://nas/guide.txt') return new Response('외벽 재도장 바탕면 점검 가이드입니다. 감리자는 바탕면 상태를 사진으로 기록하고 단지에 공유합니다.', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  if (url.startsWith('https://api.manus.ai/v1/tasks')) {
    if (init.method === 'POST') { globalThis.LASTM = JSON.parse(init.body); return J({ task_id: 'mt9', task_url: 'https://manus.im/app/mt9' }) }
    return J({ data: [] })
  }
  if (url.includes('api.openai.com')) { CALLS.openai++; return J({ error: { message: 'no credits' } }, 429) }
  return J({ message: 'unmocked ' + url }, 404)
}
const env = { SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE: 'svc', PUBLIC_BASE: 'https://pub/studio' }
async function call(body) {
  const r = await worker.fetch(new Request('https://studio.local/api/studio', { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env)
  return { status: r.status, body: await r.json() }
}
let n = 0, f = 0
const ok = (c, m) => { if (c) n++; else { f++; console.log('FAIL', m) } }
await call({ action: 'connection', provider: 'claude', key: 'k', model: 'claude-opus-5', save: true })
await call({ action: 'source', source: { title: '외벽 시방서', provenance: '2026', content: SRC, approved: true } })
let st = (await call()).body
ok(st.settings.openaiReview === false, 'default openaiReview off')
const run = async (rid) => { const c = await call({ action: 'create', requestId: rid, input: { keywords: '외벽 재도장, 바탕면', audience: '입주자대표회의', seconds: 60, ratio: '16:9', tool: 'manus' } }); if (c.status !== 200) return c; let j = c.body.job; for (let i = 0; i < 20 && ['queued', 'drafting', 'reviewing', 'revising', 'preparing'].includes(j.status); i++) j = (await call({ action: 'advance', id: j.id })).body.job; return { status: 200, job: j } }
let r = await run('req-solo0001')
ok(r.job && r.job.status === 'ready' && r.job.openaiSkipped && CALLS.openai === 0, 'solo claude review → ready without OpenAI: ' + JSON.stringify(r.job ? [r.job.status, r.job.error] : r.body))
SCORE = 70
r = await run('req-solo0002')
ok(r.job.status === 'held' && CALLS.openai === 0 && r.job.issues.every((x) => !x.includes('[OpenAI]')), 'solo low score held, no OpenAI issues: ' + r.job.status)
SCORE = 95
await call({ action: 'prefs', imageModel: 'gpt-image-1', autoRender: false, openaiReview: true })
r = await run('req-solo0003')
ok(r.status === 400 && /OpenAI/.test(r.body.error), 'openaiReview on without OpenAI → blocked: ' + (r.body && r.body.error))
await call({ action: 'prefs', imageModel: 'gpt-image-1', autoRender: false })
ok((await call()).body.settings.openaiReview === true, 'prefs without field keeps value')
ok((await call({ action: 'connection', provider: 'hub', key: 'bad', save: false })).status === 400, 'hub bad key')
const hm = await call({ action: 'connection', provider: 'hub', key: 'hubkey', save: false })
ok(hm.body.models.map((x) => x.id).join() === '아파트스퀘어,다른브랜드,POUR공법', 'hub brands listed')
await call({ action: 'connection', provider: 'hub', key: 'hubkey', model: '아파트스퀘어', save: true })
await call({ action: 'prefs', imageModel: 'gpt-image-1', autoRender: false, openaiReview: false })
let lastDraft = ''
const of = globalThis.fetch; globalThis.fetch = async (u, i) => { if (String(u).includes('anthropic.com/v1/messages') && !/독립 검수자/.test(JSON.parse(i.body).system)) lastDraft = JSON.parse(i.body).messages[0].content; return of(u, i) }
r = await run('req-hub00001')
ok(r.job.status === 'ready' && lastDraft.includes('신뢰감 있는 전문가 어조') && r.job.prompt.includes('https://nas/intro.pdf') && r.job.prompt.includes('https://nas/photo1.jpg'), 'hub tone in draft + items in manus prompt: ' + r.job.status + ' ' + r.job.error)
ok(r.job.sources.some((x) => x.title === '브랜드 허브 · 외벽 가이드'), 'hub document used as source: ' + JSON.stringify(r.job.sources.map((x) => x.title)))
const tt = r.job.sources.map((x) => x.title)
ok(tt.includes('NAS · 외벽감리.txt') && !tt.some((x) => /POUR|카페|app\.js|섞인/.test(x)), 'NAS search used, other brand/code excluded: ' + JSON.stringify(tt))
ok(!(globalThis.FILES || []).some((x) => x.includes('POUR스토어')) && (globalThis.SEARCHES || []).includes('외벽 재도장'), 'searched keywords, POUR file never opened: ' + JSON.stringify([globalThis.SEARCHES, globalThis.FILES]))
const evs = JSON.stringify(r.job.events || [])
ok(/NAS 검색 \d+건/.test(evs) && !evs.includes('hubkey'), 'event shows NAS search, no key leak')
ok(!r.job.prompt.includes('hubkey') && !JSON.stringify(r.job).includes('key=hubkey'), 'hub key not in job/prompt')
ok(tt.includes('NAS · 외벽지침.pdf') && (globalThis.PDFCALLS || []).length === 1 && globalThis.PDFCALLS[0].model === 'claude-haiku-5-5' && !globalThis.PDFCALLS[0].url.includes('hubkey'), 'NAS PDF read by Claude via signed URL: ' + JSON.stringify(globalThis.PDFCALLS))
ok(Object.keys(STORE).some((k) => /^pdfcache\/.+\.txt$/.test(k)) && !Object.keys(STORE).some((k) => /^pdfcache\/.+\.pdf$/.test(k) && STORE[k]), 'PDF text cached, temp pdf deleted: ' + Object.keys(STORE).filter((k) => k.startsWith('pdf')))
const sg = (await call()).body
ok(sg.hubGuide && sg.hubGuide.name === '아파트스퀘어' && sg.hubGuide.tone.includes('신뢰감'), 'hub guide saved and shown: ' + JSON.stringify(sg.hubGuide))
const hg = await call({ action: 'hubGuide' })
ok(hg.status === 200 && hg.body.hubGuide && hg.body.hubGuide.fetched, 'hubGuide refresh action works')
const before = globalThis.PDFCALLS.length
await run('req-hub00002')
ok(globalThis.PDFCALLS.length === before, 'second job reuses cached PDF text (no new Claude PDF call)')
await call({ action: 'connection', provider: 'manus', key: 'mk', model: 'manus-1.6', save: true })
r = await run('req-brief001')
let mj = (await call({ action: 'render', id: r.job.id })).body.job
mj = (await call({ action: 'advance', id: mj.id })).body.job
const sent = globalThis.LASTM.prompt
const bu = (sent.match(/https:\/\/pub\/studio(\/brief\/[^\s]+)/) || [])[1]
ok(mj.status === 'rendering' && bu && sent.length < 2500 && sent.includes('[내레이션 원문]'), 'long brief linked, short prompt sent: ' + mj.status + ' len ' + sent.length + ' ' + mj.error)
const br = await worker.fetch(new Request('https://studio.local' + bu), env)
const btxt = await br.text()
ok(br.status === 200 && btxt.includes('[화면 스타일]') === false && btxt.includes('[내레이션 규칙]') && btxt.includes('[첨부 자료'), 'brief served: ' + br.status + ' ' + btxt.slice(0, 40))
ok((await worker.fetch(new Request('https://studio.local' + bu.replace(/[0-9a-f]{32}/, '0'.repeat(32))), env)).status === 404, 'wrong token 404')
console.log('ok', n, 'fail', f)
