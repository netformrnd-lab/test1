// 실제 저장소 점검 — 개수·시각만 출력 (파일 이름·내용은 출력하지 않음)
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: KEY, authorization: 'Bearer ' + KEY }
async function json(name) {
  const r = await fetch(`${URL_}/storage/v1/object/studio/${name}.json?t=${Date.now()}`, { headers: h })
  return r.ok ? r.json() : { __status: r.status }
}
const photos = await json('photos'), sources = await json('sources'), jobs = await json('jobs')
const list = await fetch(`${URL_}/storage/v1/object/list/studio`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'files/', limit: 1000 }) }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
const arr = (x) => (Array.isArray(x) ? x : [])
const P = arr(photos)
console.log('== 사진 자료실 (photos.json) ==', Array.isArray(photos) ? '' : JSON.stringify(photos))
console.log('등록 사진:', P.length, '| 업로드', P.filter((p) => p.source === 'upload').length, '| AI 생성', P.filter((p) => p.source === 'ai').length, '| AI 설명 있음', P.filter((p) => p.desc).length)
console.log('가장 최근 등록:', P[0] ? P[0].created : '-', '| 가장 처음:', P.length ? P[P.length - 1].created : '-')
console.log('== 저장소 파일 폴더(files/) 수 ==', Array.isArray(list) ? list.length : JSON.stringify(list).slice(0, 200))
console.log('== 브랜드 자료 ==', arr(sources).length, '| 원본 파일 있음', arr(sources).filter((s) => s.file).length)
for (const x of arr(sources)) console.log('  · 자료:', x.title, '|', x.file ? `${x.file.name} (${x.file.size}B)` : '파일 없음', '| 승인', !!x.approved, '| 등록', x.created_at || x.created || '', '| 글', String(x.content || '').length + '자', '| 전문감리기관', String(x.content || '').split('전문감리기관').length - 1, '회')
const J = arr(jobs)
console.log('== 제작 작업 ==', J.length, JSON.stringify(J.reduce((a, j) => ((a[j.status] = (a[j.status] || 0) + 1), a), {})))
const logs = await json('logs')
console.log('== 화면 기록 (최근 40건, 파일 이름 없음) ==', Array.isArray(logs) ? logs.length + '건' : JSON.stringify(logs))
for (const l of arr(logs).slice(0, 40)) console.log(l.time, `[${l.kind}]`, l.ext ? `(.${l.ext})` : '', l.msg, l.kind === 'js' || l.kind === 'scan' ? '| ' + l.ua : '')

// 삭제 대상 확인용 (읽기만): files/ 폴더 전체를 세고, 브랜드 자료 원본 / 사진 기록 / 기록 없는 업로드로 나눈다
const all = []
for (let offset = 0; ; offset += 1000) {
  const a = await fetch(`${URL_}/storage/v1/object/list/studio`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'files/', limit: 1000, offset }) }).then((r) => r.json())
  if (!Array.isArray(a)) { console.log('목록 실패', JSON.stringify(a).slice(0, 200)); break }
  all.push(...a.map((x) => x.name)); if (a.length < 1000) break
}
const srcDirs = new Set(arr(sources).filter((s) => s.file && s.file.path).map((s) => s.file.path.split('/')[1]))
const photoDirs = new Set(P.flatMap((p) => [p.path, p.thumbPath]).filter(Boolean).map((x) => x.split('/')[1]))
console.log('== 삭제 대상 확인 == files/ 폴더 전체', all.length, '| 브랜드 자료 원본(보존)', all.filter((d) => srcDirs.has(d)).length, '| 사진 기록 있음', all.filter((d) => photoDirs.has(d)).length, '| 기록 없음', all.filter((d) => !srcDirs.has(d) && !photoDirs.has(d)).length)

// Manus 결과 구조 확인 (최근 Manus 작업 1건 — 응답 형식 파악용)
const mj = arr(jobs).find((j) => j.input && j.input.tool === 'manus' && j.data && j.data.videoId)
if (mj) {
  const d = mj.data
  console.log('== 최근 Manus 작업 ==', mj.status, '|', d.error || '', '| task', JSON.stringify(d.manusTask || {}))
  console.log('찾은 파일:', JSON.stringify(d.manusFilesFound || []).slice(0, 800))
  console.log('Manus 답변(앞 600자):', String(d.manusText || '').slice(0, 600))
  if (d.manusRaw) {
    const shape = (v, depth = 0) => depth > 4 || v == null ? typeof v : Array.isArray(v) ? `[${v.length}]` + (v.length ? shape(v[0], depth + 1) : '') : typeof v === 'object' ? '{' + Object.keys(v).slice(0, 25).map((k) => `${k}:${shape(v[k], depth + 1)}`).join(', ') + '}' : typeof v
    try { console.log('응답 구조:', shape(JSON.parse(d.manusRaw)).slice(0, 3000)) } catch (e) { console.log('원문 앞부분:', d.manusRaw.slice(0, 1500)) }
  } else console.log('응답 원문 없음 (이전 버전에서 처리된 작업 — ‘결과 다시 확인’을 누르면 저장됨)')
} else console.log('== 최근 Manus 작업 없음 ==')

// 최근 작업 제작 기록 (허브 연결 등 확인용, 최근 1건)
const lj = arr(jobs)[0]
if (lj) { console.log('== 최근 작업 기록 ==', lj.status, (lj.input || {}).tool || '', (lj.input || {}).keywords || ''); for (const e of (lj.data && lj.data.events) || []) console.log(' ·', String(e.text || '').slice(0, 300)) }

// 상세: 허브 항목 형식, Manus 응답 상세
if (lj && lj.data && lj.data.hub) {
  console.log('== 허브 항목 ==', lj.data.hub.items.length)
  for (const it of lj.data.hub.items) console.log(' ·', it.kind, '|', it.name, '| url:', it.url ? it.url.replace(/key=[^&]+/, 'key=***').slice(0, 120) : '(없음)', '| note:', (it.note || '').slice(0, 60))
}
if (mj && mj.data && mj.data.manusRaw) {
  try {
    const all = JSON.parse(mj.data.manusRaw)
    const t = all.task && (all.task.task || all.task)
    console.log('== Manus 상세 == status', t && t.status, '| credit', t && t.credit_usage, '| 추가 주소 응답:', Object.keys(all).filter((k) => k !== 'task').join(',') || '없음')
    for (const o of (t && t.output) || []) console.log(' · output', o.role, o.type, o.status, '| content types:', (o.content || []).map((c) => c.type + (c.fileName ? ':' + c.fileName : '')).join(', '))
  } catch (e) { console.log('Manus 상세 파싱 실패', e.message) }
}
if (lj && lj.data && lj.data.hub) for (const it of lj.data.hub.items) console.log(' · 항목 필드', it.name, JSON.stringify(it.keys || []))
if (mj && mj.data && mj.data.manusProbe) console.log('== Manus 추가 주소 응답 코드 ==', JSON.stringify(mj.data.manusProbe))

// 허브 실시간 확인: 저장된 허브 키를 복호화해 studio-feed.php 의 새 기능(search·file)을 시험 (키는 출력하지 않음)
try {
  const sec = await json('secrets')
  if (!sec || !sec.hub) console.log('== 허브 실시간 == 허브 키 없음')
  else {
    const { webcrypto: wc } = await import('node:crypto')
    const raw = await wc.subtle.digest('SHA-256', new TextEncoder().encode('aptsq-video-studio:' + KEY))
    const k = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const ub = (s) => Uint8Array.from(Buffer.from(s, 'base64'))
    const hubKey = new TextDecoder().decode(await wc.subtle.decrypt({ name: 'AES-GCM', iv: ub(sec.hub.iv) }, k, ub(sec.hub.cipher)))
    const HUB = 'https://netformrnd.synology.me/brand/studio-feed.php'
    const mask = (s) => String(s).split(hubKey).join('***').replace(/key=[^&"\s]+/g, 'key=***')
    const shape = (v, d = 0) => d > 4 || v == null ? typeof v : Array.isArray(v) ? `[${v.length}]` + (v.length ? shape(v[0], d + 1) : '') : typeof v === 'object' ? '{' + Object.keys(v).slice(0, 25).map((x) => `${x}:${shape(v[x], d + 1)}`).join(', ') + '}' : typeof v
    const call = async (qs) => {
      const r = await fetch(`${HUB}?${qs}&key=${encodeURIComponent(hubKey)}`).catch((e) => ({ ok: false, status: 'ERR ' + e.message, headers: new Map() }))
      const type = r.headers.get ? r.headers.get('content-type') : ''
      const body = r.text ? await r.text() : ''
      return { status: r.status, type, body }
    }
    const tryJson = (s) => { try { return JSON.parse(s) } catch { return null } }
    for (const qs of ['action=brands&t=' + Date.now(), 'action=help', 'action=search&q=' + encodeURIComponent('옥상방수'), 'action=search&q=' + encodeURIComponent('방수'), 'action=search&q=' + encodeURIComponent('브랜드북'), 'action=search&q=' + encodeURIComponent('아파트스퀘어 소개'), 'action=search&q=' + encodeURIComponent('소개서'), 'action=search&q=' + encodeURIComponent('아파트스퀘어')]) {
      const r = await call(qs)
      const j = tryJson(r.body)
      console.log(`== 허브 ${qs.split('&')[0]}${qs.includes('q=') ? ' q=' + decodeURIComponent(qs.split('q=')[1]) : ''} == HTTP ${r.status} | ${r.type} | ${r.body.length}자`)
      console.log('  구조:', j ? shape(j).slice(0, 1500) : '(JSON 아님) ' + mask(r.body.slice(0, 300)))
      if (j && qs.startsWith('action=search')) {
        const list = Array.isArray(j) ? j : j.results || j.items || j.files || j.data || []
        const big = /소개|아파트스퀘어/.test(decodeURIComponent(qs))
        for (const it of [].concat(list).slice(0, big ? 30 : 5)) console.log('   ·', big ? `${it.name} | ${String(it.path || '').replace(/^.*공유폴더\//, '')}` : mask(JSON.stringify(it).slice(0, 400)))
        const first = [].concat(list).find((x) => x && (x.path || x.url))
        if (first && !globalThis.__fileTried) {
          globalThis.__fileTried = true
          const fr = first.url && /^https?:/.test(first.url)
            ? await fetch(first.url.includes('key=') ? first.url : first.url).then(async (x) => ({ status: x.status, type: x.headers.get('content-type'), body: Buffer.from(await x.arrayBuffer()) }))
            : await fetch(`${HUB}?action=file&path=${encodeURIComponent(first.path)}&key=${encodeURIComponent(hubKey)}`).then(async (x) => ({ status: x.status, type: x.headers.get('content-type'), body: Buffer.from(await x.arrayBuffer()) }))
          console.log(`== 허브 action=file == HTTP ${fr.status} | ${fr.type} | ${fr.body.length} bytes | 앞부분: ${mask(fr.body.subarray(0, 8).toString('latin1'))}`)
        }
      }
      if (j && qs.startsWith('action=brands')) {
        const b = (j.brands || []).find((x) => String(x.name).includes('아파트')) || (j.brands || [])[0]
        if (b) for (const kind of ['자료', '문서']) for (const it of [].concat(b[kind] || []).slice(0, 3)) console.log(`   · ${kind}:`, mask(JSON.stringify(it).slice(0, 300)))
        const ap = (j.brands || []).find((x) => String(x.name).includes('아파트'))
        if (ap) {
          console.log('== 아파트스퀘어 허브 필드 ==', Object.keys(ap).join(', '))
          for (const k of Object.keys(ap)) if (Array.isArray(ap[k])) console.log(`   · ${k} (${ap[k].length}):`, mask(JSON.stringify(ap[k]).slice(0, 600)))
          const tg = String(ap['톤·가이드'] || '')
          console.log('== 받은때 ==', j['받은때'], '| 브랜드 목록:', (j.brands || []).map((x) => x.name + '(' + String(x['톤·가이드'] || '').length + '자)').join(', '))
          console.log('== 톤·가이드 (' + tg.length + '자) | 전문감리기관 ' + (tg.split('전문감리기관').length - 1) + '회 | 전문기관 ' + (tg.split('전문기관').length - 1) + '회 ==')
          for (const line of tg.split('\n')) if (/기관|정체|라벨|아파트스퀘어는/.test(line)) console.log('   >', line.slice(0, 300))
          console.log('== 첫 600자 ==\n' + tg.slice(0, 600))
        }
        console.log('== 위키 ==', mask(JSON.stringify(j['위키'] || []).slice(0, 600)), '| 안내:', String(j['안내'] || '').slice(0, 300))
      }
    }
  }
} catch (e) { console.log('== 허브 실시간 확인 실패 ==', String(e.message || e).slice(0, 300)) }
