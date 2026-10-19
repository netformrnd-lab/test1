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
