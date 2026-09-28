// 사진 자료실 전체 삭제 (사용자 요청) — 브랜드 자료 원본은 보존
// 대상: photos.json 에 기록된 사진·영상·미리보기 파일 + 기록 전에 끊긴 사진/영상 업로드(file.jpg·mp4·mov·webm·m4v)
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: KEY, authorization: 'Bearer ' + KEY }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MEDIA = /^file\.(jpg|jpeg|png|webp|mp4|mov|webm|m4v)$/
async function json(name) {
  const r = await fetch(`${URL_}/storage/v1/object/studio/${name}.json?t=${Date.now()}`, { headers: h })
  return r.ok ? r.json() : null
}
async function list(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const a = await fetch(`${URL_}/storage/v1/object/list/studio`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset }) }).then((r) => r.json())
    if (!Array.isArray(a)) throw new Error('목록 조회 실패 ' + JSON.stringify(a).slice(0, 200))
    out.push(...a); if (a.length < 1000) return out
  }
}
async function remove(paths) {
  let n = 0
  for (let i = 0; i < paths.length; i += 500) {
    const r = await fetch(`${URL_}/storage/v1/object/studio`, { method: 'DELETE', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }) })
    if (!r.ok) console.log('삭제 실패', r.status, (await r.text()).slice(0, 200)); else n += (await r.json()).length
  }
  return n
}
async function pass(no) {
  const sources = (await json('sources')) || []
  const keep = new Set(sources.filter((s) => s.file && s.file.path).map((s) => s.file.path.split('/')[1]))
  const photos = (await json('photos')) || []
  const paths = photos.flatMap((p) => [p.path, p.thumbPath]).filter((x) => x && !keep.has(x.split('/')[1]))
  const recorded = new Set(paths.map((x) => x.split('/')[1]))
  let orphan = 0, other = 0
  for (const d of (await list('files/')).map((f) => f.name)) {
    if (keep.has(d) || recorded.has(d)) continue
    for (const f of await list('files/' + d + '/')) { if (MEDIA.test(f.name)) { paths.push(`files/${d}/${f.name}`); orphan++ } else other++ }
  }
  const n = await remove(paths)
  const w = await fetch(`${URL_}/storage/v1/object/studio/photos.json`, { method: 'PUT', headers: { ...h, 'content-type': 'application/json', 'x-upsert': 'true' }, body: '[]' })
  console.log(`[${no}차] 사진 기록 ${photos.length}건 · 끊긴 업로드 ${orphan}개 · 삭제 ${n}/${paths.length}개 · 브랜드 자료 보존 ${keep.size}개 · 사진 아닌 기록없는 파일(보존) ${other}개 · 사진 목록 비움 HTTP ${w.status}`)
}
const WAIT = Number(process.env.WAIT_SECONDS || 0)
if (WAIT) { console.log(`업로드 중지 배포 대기 ${WAIT}초`); await sleep(WAIT * 1000) }
await pass(1)
await sleep(45000)
await pass(2)
console.log('남은 files/ 폴더:', (await list('files/')).length)
