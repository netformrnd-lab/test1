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
