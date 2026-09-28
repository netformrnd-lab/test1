// 아파트스퀘어 영상 제작 작업실 API
// 화면: ../index.html  ·  Firebase 연결: ../firebase/functions/index.js  ·  자동 배포: .github/workflows/deploy-studio.yml
// 데이터: Supabase Storage 비공개 버킷 'studio' (secrets/settings/sources/jobs .json) — SQL 실행 불필요
// 필요한 값: SUPABASE_URL, SUPABASE_SERVICE_ROLE (배포 워크플로가 GitHub Secret 에서 자동 주입)
//
// 흐름(한 번의 advance 요청 = 한 단계):
//   0 자료 검색 → 1 대본 작성(Claude) → 2 Claude 검수 → 3 OpenAI 검수 → 4 판정(미통과 시 최대 2회 수정)
//   → 5 HeyGen 제작 요청 → 6 렌더링 확인 → 7 완료
// 서버가 강제하는 규칙: 관리자만 접근 · 승인 자료 필수 · 아바타 사용 동의 필수 · 하루 접수 제한 ·
//   인용문이 원문에 실제로 있어야 함 · 양쪽 검수 4항목 90점 이상 + 지적 0건 · 중복 제작 방지.

const PROMPT_VERSION = 'studio-v1'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_REVISIONS = 2
// 공사 용어 사전(terms.json — build.mjs 가 TERMS 로 넣어 줌): 동의어·표기 통일·금지어
const T = typeof TERMS !== 'undefined' ? TERMS : { synonyms: [], spelling: [], banned: [], soften: {} }
// 기본 제공 자료(knowledge.json — build.mjs 가 KNOWLEDGE 로 넣어 줌): 건축 기본 지식·하자 실제 모습·하자 현상 원리
const K = typeof KNOWLEDGE !== 'undefined' ? KNOWLEDGE : []
// Claude 요금(1M 토큰당 USD, 입력/출력) — 예상 비용 표시용. 목록에 없는 모델은 토큰만 표시
const CLAUDE_PRICE = [
  ['claude-fable-5-1', 10, 50], ['claude-fable-5', 10, 50], ['claude-opus-5-5', 4, 20], ['claude-opus-5', 5, 25],
  ['claude-opus-4-8', 5, 25], ['claude-opus-4-7', 5, 25], ['claude-opus-4-6', 5, 25], ['claude-opus-4-5', 5, 25],
  ['claude-sonnet-5', 2, 10], ['claude-sonnet-4-6', 3, 15], ['claude-sonnet-4-5', 3, 15], ['claude-haiku-4-5', 1, 5],
]
const MAX_SOURCE_CHARS = 300000       // 자료 1개 본문 최대 글자 수 (PDF·PPT 에서 뽑은 글자 포함)
const MAX_FILE_BYTES = 50 * 1048576    // 원본 파일 최대 50MB
const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'preparing', 'submitting', 'rendering']
const DEFAULT_SETTINGS = {
  avatarId: '', avatarType: 'avatar', voiceId: 'fdd91d5eb0654e45a8b216b3f2c86eca',
  avatarName: '조현식 이사', consent: false, consentAt: '', maxDailyJobs: 5,
  imageModel: 'gpt-image-1', autoRender: true,
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    // 화면 파일(deploy/worker.js 로 빌드했을 때만 포함): /api 가 아닌 GET 요청은 화면을 돌려준다
    const path = new URL(request.url).pathname
    if (typeof STATIC_FILES !== 'undefined' && request.method === 'GET' && !path.startsWith('/api')) return serveStatic(path)
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) throw new HttpError(500, '서버 환경변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE)가 설정되지 않았습니다.')
      const user = await requireAdmin(request, env)
      if (request.method === 'GET') return json(await state(env))
      if (request.method !== 'POST') throw new HttpError(405, 'GET 또는 POST 만 지원합니다.')
      let body
      try { body = await request.json() } catch (e) { throw new HttpError(400, '요청 형식이 올바르지 않습니다.') }
      const handler = ACTIONS[body && body.action]
      if (!handler) throw new HttpError(400, '알 수 없는 요청입니다.')
      return json(await handler(env, body, user))
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.log('[studio] error', e && e.stack || e)
      return json({ error: String((e && e.message) || e) }, status)
    }
  },
}

// ─────────────────────────── 요청 처리 ───────────────────────────
const ACTIONS = {
  // API 키 확인(save=false: 모델 목록만) / 저장(save=true)
  async connection(env, { provider, key, model, save }) {
    if (!['claude', 'openai', 'heygen'].includes(provider)) throw new HttpError(400, '알 수 없는 서비스입니다.')
    let apiKey = String(key || '').trim()
    if (!apiKey) apiKey = await getKey(env, provider, false)
    if (!apiKey) throw new HttpError(400, 'API 키를 입력해 주세요.')
    const models = await listModels(provider, apiKey)
    if (!save) return { models }
    if (provider !== 'heygen') {
      if (!model) throw new HttpError(400, '사용할 모델을 선택해 주세요.')
      if (!models.some((m) => m.id === model)) throw new HttpError(400, '이 API 키로 사용할 수 없는 모델입니다.')
    }
    const { cipher, iv } = await encrypt(env, apiKey)
    await mutate(env, 'secrets', {}, (sec) => {
      sec[provider] = { cipher, iv, model: provider === 'heygen' ? '' : model, checked_at: now() }
    })
    return { ok: true }
  },

  async disconnect(env, { provider }) {
    await mutate(env, 'secrets', {}, (sec) => { delete sec[provider] })
    return { ok: true }
  },

  // HeyGen 개인 아바타 목록 (token = 다음 페이지 위치)
  async avatars(env, { token }) {
    const key = await getKey(env, 'heygen')
    return listAvatars(key, token)
  },

  async settings(env, { settings }) {
    const s = settings || {}
    const avatarId = String(s.avatarId || '').trim()
    const voiceId = String(s.voiceId || '').trim()
    if (!avatarId || !voiceId) throw new HttpError(400, '아바타와 음성을 선택해 주세요.')
    const max = Math.round(Number(s.maxDailyJobs))
    if (!(max >= 1 && max <= 20)) throw new HttpError(400, '하루 최대 제작 접수 건수는 1~20 사이로 입력해 주세요.')
    const prev = await getSettings(env)
    const consent = s.consent === true
    const data = {
      builtinOff: prev.builtinOff || [], imageModel: prev.imageModel || DEFAULT_SETTINGS.imageModel, autoRender: prev.autoRender !== false,
      avatarId, voiceId, maxDailyJobs: max, consent,
      avatarType: s.avatarType === 'talking_photo' ? 'talking_photo' : 'avatar',
      avatarName: String(s.avatarName || DEFAULT_SETTINGS.avatarName).slice(0, 80),
      consentAt: consent ? (prev.consent && prev.avatarId === avatarId && prev.voiceId === voiceId && prev.consentAt ? prev.consentAt : now()) : '',
    }
    await writeJSON(env, 'settings', data)
    return state(env)
  },

  async source(env, { source }, user) {
    const s = source || {}
    const title = String(s.title || '').trim()
    const provenance = String(s.provenance || '').trim()
    const content = String(s.content || '').trim()
    if (title.length < 2 || title.length > 150) throw new HttpError(400, '자료 제목은 2~150자로 입력해 주세요.')
    if (provenance.length < 2 || provenance.length > 500) throw new HttpError(400, '출처·작성일·버전을 입력해 주세요.')
    if (content.length < 30 || content.length > MAX_SOURCE_CHARS) throw new HttpError(400, `자료 본문은 30자 이상 ${MAX_SOURCE_CHARS.toLocaleString()}자 이하로 입력해 주세요.`)
    // 원본 파일(선택): 브라우저가 upload URL 로 먼저 올린 뒤 경로만 넘긴다
    let file = null
    if (s.file && s.file.path) {
      const path = String(s.file.path)
      if (!/^files\/[0-9a-f-]{36}\/file(\.[a-z0-9]{1,8})?$/.test(path)) throw new HttpError(400, '원본 파일 경로가 올바르지 않습니다.')
      file = { path, name: String(s.file.name || '').slice(0, 200), size: Number(s.file.size) || 0, type: String(s.file.type || '').slice(0, 120) }
    }
    await mutate(env, 'sources', [], (list) => {
      list.unshift({ id: crypto.randomUUID(), title, provenance, content, file, approved: s.approved === true, created_by: user.id, created_at: now() })
    })
    return state(env)
  },

  // 원본 파일 업로드용 1회성 주소 (브라우저가 파일을 Supabase Storage 에 직접 올림 — 큰 파일도 서버를 거치지 않음)
  async uploadUrl(env, { name, size }) {
    const n = Number(size) || 0
    if (n <= 0 || n > MAX_FILE_BYTES) throw new HttpError(400, `파일은 ${Math.round(MAX_FILE_BYTES / 1048576)}MB 이하만 올릴 수 있습니다.`)
    // Supabase Storage 경로는 영문·숫자만 허용(한글 이름은 400) → 저장 이름은 file.확장자, 원래 이름은 자료에 따로 기록
    const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1]
    const path = `files/${crypto.randomUUID()}/file${ext ? '.' + ext : ''}`
    await ensureBucket(env)
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encodePath(path)}`, {
      method: 'POST', headers: storageHeaders(env, { 'content-type': 'application/json' }), body: '{}',
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok || !out.url) throw new Error('업로드 주소 발급 실패: ' + apiError(out, r.status))
    return { path, url: env.SUPABASE_URL + '/storage/v1' + out.url }
  },

  // 원본 파일 내려받기용 임시 주소 (1시간)
  async fileUrl(env, { id }) {
    const src = (await readJSON(env, 'sources', [])).find((x) => x.id === id)
    if (!src || !src.file) throw new HttpError(404, '원본 파일이 없습니다.')
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodePath(src.file.path)}`, {
      method: 'POST', headers: storageHeaders(env, { 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: 3600 }),
    })
    const out = await r.json().catch(() => ({}))
    const signed = out.signedURL || out.signedUrl
    if (!r.ok || !signed) throw new Error('파일 주소 발급 실패: ' + apiError(out, r.status))
    return { url: env.SUPABASE_URL + '/storage/v1' + signed + '&download=' + encodeURIComponent(src.file.name || '') }
  },

  // ── 사진 자료실 ──
  // 브라우저가 uploadUrl 로 사진을 올린 뒤 호출 → AI(Claude)가 사진 설명을 자동으로 붙인다
  async photo(env, { path, name, size }) {
    if (!/^files\/[0-9a-f-]{36}\/file\.(jpg|jpeg|png|webp)$/.test(String(path))) throw new HttpError(400, '사진 경로가 올바르지 않습니다.')
    let desc = '', tags = []
    try {
      const url = await signedUrl(env, path, 600)
      const st = await state(env, { raw: true })
      if (st.readiness.claude) {
        const r = await callClaudeContent(await getKey(env, 'claude'), st.secrets.claude.model, PHOTO_SYSTEM,
          [{ type: 'image', source: { type: 'url', url } }, { type: 'text', text: '이 사진을 설명해 주세요.' }], PHOTO_SCHEMA)
        desc = String(r.desc || '').slice(0, 300); tags = (r.tags || []).map(String).slice(0, 10)
      }
    } catch (e) { desc = '' }
    const item = { id: 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), path, name: String(name || '').slice(0, 200), size: Number(size) || 0, desc, tags, source: 'upload', created: now() }
    await mutate(env, 'photos', [], (list) => { list.unshift(item) })
    return { photo: { id: item.id, name: item.name, size: item.size, desc: item.desc, tags: item.tags, source: item.source, created: item.created } }
  },
  async photoUpdate(env, { id, desc }) {
    await mutate(env, 'photos', [], (list) => {
      const p = list.find((x) => x.id === id)
      if (!p) throw new HttpError(404, '사진을 찾을 수 없습니다.')
      p.desc = String(desc || '').slice(0, 300)
    })
    return state(env)
  },
  async photoDelete(env, { id }) {
    let path = ''
    await mutate(env, 'photos', [], (list) => {
      const i = list.findIndex((x) => x.id === id)
      if (i < 0) throw new HttpError(404, '사진을 찾을 수 없습니다.')
      path = list[i].path; list.splice(i, 1)
    })
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { method: 'DELETE', headers: storageHeaders(env) }).catch(() => {})
    return state(env)
  },
  // 화면 표시용 사진 주소 (1시간)
  async photoUrls(env, { ids }) {
    const photos = await readJSON(env, 'photos', [])
    const want = new Set((ids || []).slice(0, 300))
    const out = {}
    await Promise.all(photos.filter((p) => want.has(p.id)).map(async (p) => { out[p.id] = await signedUrl(env, p.path, 3600).catch(() => '') }))
    return { urls: out }
  },
  // 영상 구성 설정 (AI 이미지 모델, 검수 통과 후 자동 제작 여부)
  async prefs(env, { imageModel, autoRender }) {
    await mutate(env, 'settings', {}, (st) => {
      st.imageModel = String(imageModel || DEFAULT_SETTINGS.imageModel).trim().slice(0, 60)
      st.autoRender = autoRender !== false
    })
    return state(env)
  },
  // '미리보기 후 제작' 모드에서 준비가 끝난 작업을 HeyGen 제작으로 넘긴다
  async render(env, { id }) {
    let row = null
    await mutate(env, 'jobs', [], (list) => {
      row = list.find((j) => j.id === id)
      if (!row) throw new HttpError(404, '작업을 찾을 수 없습니다.')
      if (row.status !== 'ready') throw new HttpError(409, '제작 대기 상태의 작업만 제작을 요청할 수 있습니다.')
      row.status = 'submitting'; row.step = 6
      row.data.events.push(ev('HeyGen 제작 요청 (미리보기 확인 후)'))
    })
    return { job: toJob(row) }
  },

  // 화면에서 생긴 업로드 오류·건너뛴 형식 기록 (파일 이름 없이 확장자·문구만, 최근 300건)
  async log(env, { entries }) {
    const list = (Array.isArray(entries) ? entries : []).slice(0, 50).map((e) => ({
      time: now(), kind: String(e.kind || '').slice(0, 30), msg: String(e.msg || '').slice(0, 300), ext: String(e.ext || '').slice(0, 20), ua: String(e.ua || '').slice(0, 120),
    }))
    if (list.length) await mutate(env, 'logs', [], (l) => { l.unshift(...list); l.splice(300) })
    return { ok: true }
  },

  // HeyGen 남은 크레딧
  async quota(env) {
    return { heygen: await heygenQuota(await getKey(env, 'heygen')) }
  },

  async approval(env, { id, approved }) {
    if (String(id).startsWith('builtin-')) {
      if (!K.some((k) => k.id === id)) throw new HttpError(404, '자료를 찾을 수 없습니다.')
      await mutate(env, 'settings', {}, (st) => {
        const off = new Set(st.builtinOff || [])
        if (approved === true) off.delete(id); else off.add(id)
        st.builtinOff = [...off]
      })
      return state(env)
    }
    await mutate(env, 'sources', [], (list) => {
      const src = list.find((x) => x.id === id)
      if (!src) throw new HttpError(404, '자료를 찾을 수 없습니다.')
      src.approved = approved === true
    })
    return state(env)
  },

  async create(env, { requestId, input }, user) {
    const rid = String(requestId || '').trim()
    if (rid.length < 8 || rid.length > 80) throw new HttpError(400, '요청 번호가 올바르지 않습니다.')
    // 같은 요청 번호가 이미 접수됐으면 새로 만들지 않고 그 작업을 돌려준다(중복 클릭·재전송 방지)
    const dup = (await readJSON(env, 'jobs', [])).find((j) => j.request_id === rid)
    if (dup) return { job: toJob(dup) }

    const inp = validateInput(input)
    const st = await state(env, { raw: true })
    const missing = readinessProblems(st)
    if (missing.length) throw new HttpError(400, '제작 전 확인이 필요합니다: ' + missing.join(' / '))
    if (st.jobs.some((j) => ACTIVE.includes(j.status))) throw new HttpError(409, '진행 중인 제작이 끝난 뒤 새 영상을 시작할 수 있습니다.')
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const todayCount = st.jobs.filter((j) => new Date(j.created_at) >= today).length
    if (todayCount >= st.settings.maxDailyJobs) throw new HttpError(429, `오늘(UTC) 제작 접수 한도 ${st.settings.maxDailyJobs}건을 모두 사용했습니다.`)

    const models = { claude: st.secrets.claude.model, openai: st.secrets.openai.model }
    const memory = memoryFrom(st.jobs)
    const row = {
      id: crypto.randomUUID(), request_id: rid, status: 'queued', step: 0, revision: 0, input: inp, created_by: user.id,
      created_at: now(), locked_until: null,
      data: { models, memory, promptVersion: PROMPT_VERSION, events: [ev('제작 요청 접수 · 승인 자료 검색 대기')],
        photoCatalog: (st.photos || []).map((p) => ({ id: p.id, desc: p.desc, name: p.name })) },
    }
    await mutate(env, 'jobs', [], (list) => { list.unshift(row); list.splice(100) })
    return { job: toJob(row) }
  },

  // 진행 중인 작업을 한 단계 진행한다(화면이 주기적으로 호출)
  async advance(env, { id }) {
    // 동시에 두 창이 같은 단계를 처리하지 않도록 잠금 (최대 10분)
    let row = null, busy = false
    await mutate(env, 'jobs', [], (list) => {
      row = list.find((j) => j.id === id)
      if (!row) throw new HttpError(404, '작업을 찾을 수 없습니다.')
      if (!ACTIVE.includes(row.status)) return
      if (row.locked_until && row.locked_until > now()) { busy = true; return }
      row.locked_until = new Date(Date.now() + 600000).toISOString()
    })
    if (!ACTIVE.includes(row.status) || busy) return { job: toJob(row) }
    const job = { id: row.id, status: row.status, step: row.step, revision: row.revision, input: row.input, data: row.data || {} }
    job.data.events = job.data.events || []
    try {
      await runStep(env, job)
    } catch (e) {
      const msg = String((e && e.message) || e)
      job.data.events.push(ev('오류: ' + msg))
      job.data.error = msg
      job.status = 'failed'
    }
    const saved = await saveJob(env, job, { locked_until: null })
    return { job: toJob(saved) }
  },
}

// ─────────────────────────── 제작 파이프라인 ───────────────────────────
async function runStep(env, job) {
  const d = job.data
  const st = await state(env, { raw: true })

  // 0) 승인 자료 검색
  if (job.step === 0) {
    const approved = st.sourcesFull.filter((s) => s.approved)
    const picked = retrieve(approved, job.input.keywords)
    if (!picked.length) {
      job.status = 'held'
      d.error = '키워드와 관련된 승인 자료를 찾지 못해 제작하지 않았습니다. 브랜드 자료실에 근거 자료를 등록·승인해 주세요.'
      d.events.push(ev('자료 검색: 관련 근거 없음 → 자동 보류'))
      return
    }
    d.context = picked
    const ids = [...new Set(picked.map((p) => p.sourceId))]
    d.sources = ids.map((sid) => ({ id: sid, title: (approved.find((s) => s.id === sid) || {}).title || '' }))
    d.events.push(ev(`자료 검색: 승인 자료 ${ids.length}개에서 근거 단락 ${picked.length}개 확보`))
    job.step = 1; job.status = 'drafting'
    return
  }

  const claudeKey = await getKey(env, 'claude')
  const openaiKey = await getKey(env, 'openai')

  // 1) 대본·장면 작성
  if (job.step === 1) {
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), draftUser(job, d), PLAN_SCHEMA, d)
    applyPlan(job, plan, st)
    d.events.push(ev(`대본 작성 완료: 장면 ${plan.scenes.length}개 · Claude ${d.models.claude}`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 2) Claude 독립 검수
  if (job.step === 2) {
    d.claude = await callClaude(claudeKey, d.models.claude, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA, d)
    d.claude = normReview(d.claude)
    d.events.push(ev(`Claude 검수: ${passes(d.claude) ? '통과' : '미통과'} (근거 ${d.claude.grounding} · 브랜드 ${d.claude.brand} · 전달 ${d.claude.clarity} · 제작 ${d.claude.production})`))
    job.step = 3
    return
  }

  // 3) OpenAI 독립 검수
  if (job.step === 3) {
    d.openai = normReview(await callOpenAI(openaiKey, d.models.openai, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA, d))
    d.events.push(ev(`OpenAI 검수: ${passes(d.openai) ? '통과' : '미통과'} (근거 ${d.openai.grounding} · 브랜드 ${d.openai.brand} · 전달 ${d.openai.clarity} · 제작 ${d.openai.production})`))
    job.step = 4
    return
  }

  // 4) 판정 → 통과 / 수정 / 보류
  if (job.step === 4 && job.status !== 'revising') {
    const issues = allIssues(d)
    if (!issues.length) {
      d.events.push(ev('교차 검수 통과: 양쪽 4항목 90점 이상 · 지적 0건 · 인용 원문 일치'))
      job.step = 5; job.status = 'preparing'
    } else if (job.revision < MAX_REVISIONS) {
      d.pendingIssues = issues
      d.events.push(ev(`검수 미통과(지적 ${issues.length}건) → 자동 수정 ${job.revision + 1}/${MAX_REVISIONS}`))
      job.status = 'revising'
    } else {
      job.status = 'held'
      d.lastIssues = issues
      d.error = `수정 ${MAX_REVISIONS}회 후에도 검수 기준을 통과하지 못해 자동 보류했습니다. 영상은 제작하지 않았습니다.`
      d.events.push(ev('검수 기준 미통과 → 자동 보류 (HeyGen 제작 요청 안 함)'))
    }
    return
  }

  // 4-수정) 지적 사항을 반영해 대본 수정 → 다시 양쪽 검수
  if (job.status === 'revising') {
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), reviseUser(job, d), PLAN_SCHEMA, d)
    job.revision += 1
    applyPlan(job, plan, st)
    d.claude = null; d.openai = null; d.pendingIssues = []
    d.events.push(ev(`자동 수정 ${job.revision}/${MAX_REVISIONS} 완료 → 재검수`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 5) 장면 이미지 준비 — 사진 자료실에 맞는 사진이 없는 컷은 AI 이미지를 한 장씩 만든다 (한 번 호출에 1장)
  if (job.status === 'preparing') {
    const cut = allCuts(d.plan).find((c) => !c.photoId && c.imagePrompt && !c.aiPhotoId && !c.imageFailed)
    if (cut) {
      try {
        const photo = await generateImage(env, openaiKey, st.settings.imageModel || DEFAULT_SETTINGS.imageModel, cut.imagePrompt, job.input.ratio, d)
        cut.aiPhotoId = photo.id
        d.events.push(ev(`AI 이미지 생성: ${cut.imagePrompt.slice(0, 40)}…`))
      } catch (e) {
        cut.imageFailed = String((e && e.message) || e).slice(0, 200)
        d.events.push(ev('AI 이미지 생성 실패 → 이 컷은 브랜드 카드로 표시: ' + cut.imageFailed))
      }
      d.prompt = heygenPrompt(job, d.plan, st.photos)
      return
    }
    d.events.push(ev(`장면 이미지 준비 완료: 컷 ${allCuts(d.plan).length}개 (사진 ${allCuts(d.plan).filter((c) => c.photoId).length} · AI 이미지 ${allCuts(d.plan).filter((c) => c.aiPhotoId).length} · 브랜드 카드 ${allCuts(d.plan).filter((c) => !c.photoId && !c.aiPhotoId).length})`))
    job.step = 6
    if (st.settings.autoRender === false) {
      job.status = 'ready'
      d.events.push(ev('미리보기 후 제작 모드: 무료 미리보기로 확인한 뒤 ‘HeyGen 제작 요청’을 눌러 주세요.'))
    } else job.status = 'submitting'
    return
  }

  // 6) HeyGen 제작 요청 (중복 제작 방지: 요청 전에 '시도함'을 먼저 저장)
  if (job.status === 'submitting') {
    if (!st.settings.consent || !st.settings.avatarId || !st.settings.voiceId) throw new Error('아바타 사용 동의·아바타·음성 설정이 필요합니다.')
    if (allIssues(d).length) throw new Error('검수 통과 기록이 없어 제작을 요청하지 않았습니다.')
    if (d.submitAttempted && !d.videoId) {
      job.status = 'uncertain'
      d.error = '이전 제작 요청의 결과를 확인하지 못했습니다. 중복 비용을 막기 위해 자동 재요청하지 않았습니다. HeyGen 대시보드에서 영상 생성 여부를 확인해 주세요.'
      d.events.push(ev('제작 요청 결과 불명 → 중복 방지로 중단'))
      return
    }
    d.usage = d.usage || {}
    d.usage.heygen = { before: await heygenQuota(await getKey(env, 'heygen')) }
    d.submitAttempted = true
    await saveJob(env, job)
    const heygenKey = await getKey(env, 'heygen')
    let res
    try {
      res = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: { 'X-Api-Key': heygenKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(heygenPayload(job, st.settings, await cutMedia(env, d.plan, st.photos, 7 * 86400))),
      })
    } catch (e) {
      job.status = 'uncertain'
      d.error = 'HeyGen 제작 요청 중 연결이 끊겨 결과를 확인하지 못했습니다. 중복 비용을 막기 위해 재요청하지 않았습니다. HeyGen 대시보드를 확인해 주세요.'
      d.events.push(ev('제작 요청 연결 오류 → 중복 방지로 중단'))
      return
    }
    const out = await res.json().catch(() => ({}))
    const videoId = out && out.data && out.data.video_id
    if (!res.ok || !videoId) {
      job.status = 'failed'
      d.error = 'HeyGen 제작 요청 실패: ' + apiError(out, res.status)
      d.events.push(ev(d.error))
      return
    }
    d.videoId = videoId
    d.events.push(ev(`HeyGen 제작 접수 (video_id ${videoId})`))
    job.step = 7; job.status = 'rendering'
    return
  }

  // 7) 렌더링 상태 확인
  if (job.status === 'rendering') {
    const heygenKey = await getKey(env, 'heygen')
    const res = await fetch('https://api.heygen.com/v1/video_status.get?video_id=' + encodeURIComponent(d.videoId), {
      headers: { 'X-Api-Key': heygenKey, accept: 'application/json' },
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HeyGen 상태 확인 실패: ' + apiError(out, res.status))
    const v = out.data || {}
    if (v.status === 'completed' && v.video_url) {
      const hq = (d.usage && d.usage.heygen) || {}
      hq.after = await heygenQuota(heygenKey)
      if (hq.before != null && hq.after != null) hq.used = Math.round((hq.before - hq.after) * 100) / 100
      d.usage = { ...(d.usage || {}), heygen: hq }
      d.videoUrl = v.video_url
      d.actualSeconds = v.duration ? Math.round(Number(v.duration)) : null
      d.events.push(ev(`영상 생성 완료${d.actualSeconds ? ` · 실제 길이 ${d.actualSeconds}초` : ''}`))
      job.step = 8; job.status = 'rendered'
    } else if (v.status === 'failed') {
      job.status = 'failed'
      d.error = 'HeyGen 영상 생성 실패: ' + ((v.error && (v.error.message || v.error.detail || v.error.code)) || '원인 미상')
      d.events.push(ev(d.error))
    }
  }
}

// 새 대본을 저장하고, 인용문이 원문에 실제로 있는지 서버에서 검사한다
function applyPlan(job, plan, st) {
  const d = job.data
  const byId = Object.fromEntries(st.sourcesFull.map((s) => [s.id, s]))
  const problems = []
  if (!plan || !Array.isArray(plan.scenes)) throw new Error('대본 형식이 올바르지 않습니다.')
  plan.title = String(plan.title || job.input.keywords).slice(0, 120)
  plan.blockers = (plan.blockers || []).map(String).filter(Boolean)
  if (plan.scenes.length < 2 || plan.scenes.length > 16) problems.push(`장면 수는 2~16개여야 합니다(현재 ${plan.scenes.length}개).`)
  const photoIds = new Set((st.photos || []).map((p) => p.id))
  const useCount = {}
  let lastPhoto = ''
  plan.scenes.forEach((s, i) => {
    s.seconds = Math.max(1, Math.min(120, Math.round(Number(s.seconds) || 0)))
    // 컷: 대사 일부 + 화면 1개(사진 자료실 사진 / AI 생성 이미지 / 브랜드 카드)
    s.cuts = (Array.isArray(s.cuts) && s.cuts.length ? s.cuts : [{ narration: s.narration || '', photoId: '', imagePrompt: '' }]).map((c) => ({
      narration: String(c.narration || '').slice(0, 800), photoId: String(c.photoId || ''), imagePrompt: String(c.imagePrompt || '').slice(0, 600),
    }))
    if (s.cuts.length > 6) problems.push(`장면 ${i + 1}: 컷은 6개까지만 가능합니다(현재 ${s.cuts.length}개).`)
    s.cuts.forEach((c, k) => {
      if (!c.narration) problems.push(`장면 ${i + 1} 컷 ${k + 1}: 대사가 비어 있습니다.`)
      if (c.photoId && !photoIds.has(c.photoId)) { problems.push(`장면 ${i + 1} 컷 ${k + 1}: 사진 자료실에 없는 사진 id(${c.photoId})입니다.`); c.photoId = '' }
      if (c.photoId) {
        if (c.photoId === lastPhoto) problems.push(`장면 ${i + 1} 컷 ${k + 1}: 같은 사진을 연속 컷에 썼습니다.`)
        useCount[c.photoId] = (useCount[c.photoId] || 0) + 1
      }
      lastPhoto = c.photoId
    })
    s.narration = s.cuts.map((c) => c.narration).join(' ').slice(0, 1600)
    s.onScreen = String(s.onScreen || '').slice(0, 100)
    s.visual = String(s.visual || '').slice(0, 500)
    s.citations = Array.isArray(s.citations) ? s.citations : []
    if (!s.narration) problems.push(`장면 ${i + 1}: 발화 문장이 비어 있습니다.`)
    if (!s.citations.length) problems.push(`장면 ${i + 1}: 원문 근거가 없습니다.`)
    s.citations.forEach((c, k) => {
      const src = byId[c.sourceId]
      if (!src || !src.approved) problems.push(`장면 ${i + 1} 근거 ${k + 1}: 승인된 자료가 아닙니다.`)
      else if (String(c.quote || '').length < 12 || !norm(src.content).includes(norm(c.quote))) problems.push(`장면 ${i + 1} 근거 ${k + 1}: 인용문이 원문과 일치하지 않습니다.`)
    })
  })
  Object.entries(useCount).filter(([, n]) => n > 2).forEach(([id]) => problems.push(`같은 사진(${id})을 3번 이상 썼습니다.`))
  if (allCuts(plan).length > 45) problems.push(`컷이 너무 많습니다(${allCuts(plan).length}개, 최대 45개).`)
  const total = plan.scenes.reduce((a, s) => a + s.seconds, 0)
  if (Math.abs(total - job.input.seconds) > Math.max(15, job.input.seconds * 0.25)) problems.push(`장면 길이 합계(${total}초)가 목표 ${job.input.seconds}초와 크게 다릅니다.`)
  problems.push(...termIssues(plan))
  d.plan = plan
  d.groundingIssues = problems
  d.prompt = heygenPrompt(job, plan, st.photos)
}
function allCuts(plan) { return plan ? plan.scenes.flatMap((s) => s.cuts || []) : [] }

function allIssues(d) {
  const out = []
  ;(d.groundingIssues || []).forEach((x) => out.push('[서버 검사] ' + x))
  ;((d.plan && d.plan.blockers) || []).forEach((x) => out.push('[대본 작성 중단 사유] ' + x))
  if (!passes(d.claude)) out.push(...reviewIssues('Claude', d.claude))
  if (!passes(d.openai)) out.push(...reviewIssues('OpenAI', d.openai))
  return out
}
function reviewIssues(name, r) {
  if (!r) return [`[${name}] 검수 결과 없음`]
  const low = ['grounding', 'brand', 'clarity', 'production'].filter((k) => r[k] < 90).map((k) => `${k} ${r[k]}점`)
  return [...(r.issues || []).map((x) => `[${name}] ${x}`), ...(low.length ? [`[${name}] 90점 미만: ${low.join(', ')}`] : []), ...(!r.pass ? [`[${name}] 통과 판정 아님`] : [])]
}
function passes(r) {
  return !!r && r.pass === true && Array.isArray(r.issues) && r.issues.length === 0 &&
    [r.grounding, r.brand, r.clarity, r.production].every((x) => Number(x) >= 90)
}
function normReview(r) {
  const n = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)))
  return { pass: r.pass === true, grounding: n(r.grounding), brand: n(r.brand), clarity: n(r.clarity), production: n(r.production), issues: (r.issues || []).map((x) => String(x).slice(0, 1000)).slice(0, 20) }
}

// ─────────────────────────── 프롬프트 ───────────────────────────
function draftSystem() {
  return [
    '당신은 아파트 보수공사 감리 전문회사 "아파트스퀘어"의 영상 대본 작가입니다.',
    '발표자는 아파트스퀘어 조현식 이사(AI 아바타)이며, 1인칭 존댓말로 시청자에게 직접 설명합니다.',
    '규칙:',
    '1. 사실·수치·서비스 내용은 제공된 [승인 자료] 단락에서만 가져옵니다. 자료에 없는 사실, 수치, 사례, 약속을 만들지 마세요.',
    '2. 모든 장면에 citations 를 1개 이상 달고, quote 는 해당 자료 원문에서 12자 이상을 글자 그대로 복사합니다(띄어쓰기 포함, 요약·수정 금지). sourceId 는 자료의 id 를 그대로 씁니다.',
    '3. 자료가 "계획/목표/기획"이라고 표시한 내용은 현재 제공 중인 실적처럼 말하지 말고 계획으로 표현합니다.',
    '4. 장면 seconds 합계가 목표 길이에 가깝게 합니다. 한국어 발화는 1초에 약 4~5글자로 계산합니다.',
    '5. onScreen 은 장면의 핵심 문구(30자 이내, 브랜드 카드에 크게 표시), visual 은 장면 전체의 화면 구성 설명입니다.',
    '6. 근거가 부족해 목표 길이·주제를 정직하게 채울 수 없으면 blockers 에 이유를 적습니다(억지로 채우지 않음).',
    '7. 과장·단정적 효과 보장·타사 비방·확인되지 않은 법적 판단은 쓰지 않습니다.',
    termRules(),
    cutRules(),
  ].join('\n')
}
function cutRules() {
  return [
    '11. [컷 구성] 각 장면을 대사 흐름에 맞춰 1~5개 cuts 로 나눕니다. 컷마다 화면(그림) 하나가 나오고, 대사가 넘어가는 지점에서 그림이 바뀝니다. 컷 하나의 대사는 2~6초 분량입니다. 장면의 대사 전체는 컷 대사를 이어 붙인 것입니다.',
    '12. [사진 배정] [사진 자료실] 목록에서 컷 대사와 정확히 맞는 사진이 있으면 photoId 에 그 id 를 넣고 imagePrompt 는 빈 문자열로 둡니다. 같은 사진을 연속 컷에 쓰지 않고, 한 영상에서 같은 사진은 2번까지만 씁니다. 설명이 맞지 않는 사진을 억지로 쓰지 않습니다.',
    '13. [AI 이미지] 맞는 사진이 없고 구체적인 모습(현장·하자·장비·서류·회의 등)이 필요하면 photoId 는 빈 문자열, imagePrompt 에 만들 이미지를 한국어로 구체적으로 적습니다: 실사 사진 스타일, 한국 아파트, 글자·숫자·로고·워터마크 없음, 사람 얼굴은 알아볼 수 없게, [하자 실제 크기·모습 기준]과 [하자 현상 물리 지식]의 실제 크기·모습을 지킵니다. AI 이미지를 실제 사례·현장 사진이라고 말하지 않습니다.',
    '14. [브랜드 카드] 인사·브랜드 메시지·정체 표기·연락처·마무리처럼 그림이 필요 없는 컷은 photoId 와 imagePrompt 를 모두 빈 문자열로 둡니다. 이 컷은 브랜드북 기준(화이트 배경, 네이비 글자, Pretendard)으로 장면의 onScreen 문구를 크게 보여 줍니다.',
  ].join('\n')
}
function photoBlock(photos) {
  const list = (photos || []).slice(0, 300)
  return list.length ? list.map((p) => `- ${p.id}: ${(p.desc || p.name || '설명 없음').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n') : '(등록된 사진 없음 — 필요한 컷은 imagePrompt 로 AI 이미지를 요청하세요)'
}
function termRules() {
  const sp = T.spelling.map((x) => `${x.wrong}→${x.right}`).join(', ')
  const bn = T.banned.map((x) => (x.instead && x.instead !== '삭제' ? `${x.word}(→${x.instead})` : x.word)).join(', ')
  return `8. [사내 용어 사전] 대사·자막에 다음 표기를 지킵니다: ${sp}\n9. [금지어] 대사·자막·제목에 쓰지 않습니다(괄호는 대신 쓸 표현): ${bn}\n${brandRules()}`
}
function brandRules() {
  const b = T.brand
  return b ? `10. [아파트스퀘어 브랜드북 규칙]\n${b.rules.map((r) => '- ' + r).join('\n')}` : ''
}
// 대사·자막·제목의 금지어·잘못된 표기를 서버에서 직접 찾는다 (인용문은 원문 그대로라 검사하지 않음)
function termIssues(plan) {
  const out = []
  const parts = [['제목', plan.title], ...plan.scenes.flatMap((s, i) => [[`장면 ${i + 1} 대사`, s.narration], [`장면 ${i + 1} 자막`, s.onScreen]])]
  for (const [where, text] of parts) {
    const low = String(text || '').toLowerCase()
    for (const b of T.banned) if ((b.allow || []).reduce((t, ok) => t.split(ok.toLowerCase()).join(' '), low).includes(b.word.toLowerCase())) out.push(`${where}: 금지어 '${b.word}' — ${b.why}${b.instead && b.instead !== '삭제' ? ` (대신: ${b.instead})` : ' (삭제)'}`)
    for (const x of T.spelling) if (String(text || '').includes(x.wrong)) out.push(`${where}: 표기 통일 '${x.wrong}' → '${x.right}'`)
  }
  return out
}
function contextBlock(d) {
  return (d.context || []).map((c, i) => `<자료 단락 ${i + 1} id="${c.sourceId}" 제목="${c.title}" 출처="${c.provenance}">\n${c.text}\n</자료 단락>`).join('\n\n')
}
function briefBlock(job) {
  const i = job.input
  return `[이번 영상]\n키워드: ${i.keywords}\n시청 대상: ${i.audience}\n목표 길이: ${i.seconds}초\n화면 비율: ${i.ratio === '9:16' ? '세로형 9:16(쇼츠)' : '가로형 16:9'}`
}
function draftUser(job, d) {
  const mem = (d.memory || []).length ? `\n\n[지난 제작 형식 참고(사실은 가져오지 말 것)]\n${d.memory.join('\n')}` : ''
  return `${briefBlock(job)}${mem}\n\n[승인 자료]\n${contextBlock(d)}\n\n[사진 자료실] (id: 설명)\n${photoBlock(d.photoCatalog)}\n\n위 규칙에 따라 영상 제목과 장면별 대본·컷을 작성하세요.`
}
function reviseUser(job, d) {
  return `${draftUser(job, d)}\n\n[직전 대본]\n${JSON.stringify(d.plan)}\n\n[검수 지적 사항 — 모두 해결하세요]\n${(d.pendingIssues || []).map((x) => '- ' + x).join('\n')}\n\n지적 사항을 반영해 대본 전체를 다시 작성하세요. 해결할 수 없으면 blockers 에 이유를 적으세요.`
}
function reviewSystem() {
  return [
    '당신은 아파트스퀘어 영상 대본의 독립 검수자입니다. 작성자와 별개로 엄격하게 평가합니다.',
    '각 항목을 0~100점으로 채점합니다:',
    '- grounding: 모든 주장·수치가 [승인 자료]로 뒷받침되는가. 자료에 없는 사실이 하나라도 있으면 60점 이하.',
    '- brand: 아파트스퀘어(감리 전문, 신뢰·정확성)와 발표자(조현식 이사) 어조에 맞고 과장·보장·비방이 없는가. 사내 용어 사전의 표기·금지어를 지켰는가. POUR 등 다른 회사·브랜드를 언급하면 60점 이하.',
    '- clarity: 시청 대상이 이해하기 쉽고 논리적 비약 없이 전달되는가.',
    '- production: HeyGen 아바타 영상으로 바로 제작 가능한가(장면 길이 합계, 발화량, 컷 길이). 컷마다 배정한 사진 설명·AI 이미지 요청이 그 컷 대사와 정확히 맞는가, 같은 그림이 반복되지 않는가, AI 이미지 요청이 하자 실제 크기·모습 기준을 지키는가.',
    'issues 에는 반드시 고쳐야 하는 중대 지적만 한국어로 적습니다(없으면 빈 배열). 사소한 취향은 적지 않습니다.',
    'pass 는 네 항목이 모두 90점 이상이고 issues 가 비어 있을 때만 true 입니다.',
    '브랜드 점수는 아래 브랜드북 규칙을 기준으로 매기고, 어긴 규칙은 issues 에 적습니다.',
    brandRules(),
  ].join('\n')
}
function reviewUser(job, d) {
  return `${briefBlock(job)}\n\n[승인 자료]\n${contextBlock(d)}\n\n[사진 자료실] (id: 설명)\n${photoBlock(d.photoCatalog)}\n\n[검수 대상 대본]\n${JSON.stringify(d.plan)}\n\n[컷 구성 요약]\n${d.prompt}\n\n위 대본과 컷 구성을 평가하세요.`
}
function heygenPrompt(job, plan, photos) {
  const byId = Object.fromEntries((photos || []).map((p) => [p.id, p]))
  const i = job.input
  const lines = [
    `# ${plan.title}`,
    `발표자: 아파트스퀘어 조현식 이사 (등록된 전용 아바타·음성 사용)`,
    `시청 대상: ${i.audience} · 목표 ${i.seconds}초 · ${i.ratio === '9:16' ? '세로형 1080×1920' : '가로형 1920×1080'} · 자막 켜기`,
    `브랜드 지시: 차분하고 신뢰감 있는 전문가 어조, 결과 약속·과장 표현 금지. ${(T.brand && T.brand.visual) || '아파트스퀘어 브랜드 컬러(네이비 #1F2C5C, 블루 #4A6FB5, 화이트) 사용'}`,
    '',
  ]
  plan.scenes.forEach((s, k) => {
    lines.push(`## 장면 ${k + 1} (${s.seconds}초)`)
    lines.push(`자막: ${s.onScreen}`)
    lines.push(`화면: ${s.visual}`)
    ;(s.cuts || []).forEach((c, j) => {
      const pic = c.photoId ? `사진 ${c.photoId}: ${(byId[c.photoId] || {}).desc || ''}` : c.aiPhotoId ? `AI 생성 이미지: ${c.imagePrompt}` : c.imagePrompt ? `AI 이미지 생성 예정: ${c.imagePrompt}` : `브랜드 카드: ${s.onScreen}`
      lines.push(`- 컷 ${j + 1} [${pic}] ${c.narration}`)
    })
    lines.push('')
  })
  return lines.join('\n').trim()
}
// 컷마다 video_input 하나: 사진이 있으면 배경 사진 + 아바타를 작게(가로형 왼쪽 아래 / 세로형 아래), 없으면 브랜드 카드(화이트) + 아바타
function heygenPayload(job, settings, media) {
  const plan = job.data.plan
  const vertical = job.input.ratio === '9:16'
  const base = settings.avatarType === 'talking_photo'
    ? { type: 'talking_photo', talking_photo_id: settings.avatarId }
    : { type: 'avatar', avatar_id: settings.avatarId, avatar_style: 'normal' }
  const inputs = []
  plan.scenes.forEach((s, i) => (s.cuts || []).forEach((c, j) => {
    const url = media[`${i}-${j}`]
    inputs.push({
      character: url ? { ...base, scale: vertical ? 0.5 : 0.45, offset: vertical ? { x: 0, y: 0.26 } : { x: -0.33, y: 0.22 } } : base,
      voice: { type: 'text', input_text: c.narration, voice_id: settings.voiceId },
      background: url ? { type: 'image', url, fit: 'cover' } : { type: 'color', value: '#FFFFFF' },
    })
  }))
  return {
    title: `[아파트스퀘어] ${plan.title}`.slice(0, 120),
    caption: true,
    dimension: vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
    video_inputs: inputs,
  }
}
// 컷별 그림 주소 (key = '장면-컷')
async function cutMedia(env, plan, photos, seconds) {
  const byId = Object.fromEntries((photos || []).map((p) => [p.id, p]))
  const out = {}
  const jobs = []
  ;(plan ? plan.scenes : []).forEach((s, i) => (s.cuts || []).forEach((c, j) => {
    const p = byId[c.photoId] || byId[c.aiPhotoId]
    if (p) jobs.push(signedUrl(env, p.path, seconds).then((u) => { out[`${i}-${j}`] = u }).catch(() => {}))
  }))
  await Promise.all(jobs)
  return out
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    grounding: { type: 'integer' },
    brand: { type: 'integer' },
    clarity: { type: 'integer' },
    production: { type: 'integer' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'grounding', 'brand', 'clarity', 'production', 'issues'],
  additionalProperties: false,
}
const PHOTO_SYSTEM = '아파트 유지보수 감리 회사의 영상 제작용 사진 자료실입니다. 사진에 보이는 것을 한국어 한두 문장으로 구체적으로 설명합니다(무엇·어디·상태·촬영 방식: 예) 드론으로 찍은 아파트 외벽 전경, 도막이 들뜬 외벽 근접 사진, 앱 화면 캡처, 회의실 서류). 보이지 않는 사실은 추측하지 않습니다. tags 는 짧은 키워드 3~8개.'
const PHOTO_SCHEMA = {
  type: 'object',
  properties: { desc: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
  required: ['desc', 'tags'],
  additionalProperties: false,
}
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          seconds: { type: 'integer' },
          onScreen: { type: 'string' },
          visual: { type: 'string' },
          cuts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { narration: { type: 'string' }, photoId: { type: 'string' }, imagePrompt: { type: 'string' } },
              required: ['narration', 'photoId', 'imagePrompt'],
              additionalProperties: false,
            },
          },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: { sourceId: { type: 'string' }, quote: { type: 'string' }, claim: { type: 'string' } },
              required: ['sourceId', 'quote', 'claim'],
              additionalProperties: false,
            },
          },
        },
        required: ['seconds', 'onScreen', 'visual', 'cuts', 'citations'],
        additionalProperties: false,
      },
    },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'scenes', 'blockers'],
  additionalProperties: false,
}

// ─────────────────────────── 외부 API ───────────────────────────
// 제작별 사용량 누적 (d.usage)
function addUsage(d, who, input, output) {
  if (!d) return
  d.usage = d.usage || {}
  const u = d.usage[who] = d.usage[who] || { input: 0, output: 0, calls: 0 }
  u.input += input || 0; u.output += output || 0; u.calls += 1
}
async function callClaude(key, model, system, user, schema, d) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 16000, system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Claude 요청 실패: ' + apiError(out, res.status))
  if (out.usage) addUsage(d, 'claude', (out.usage.input_tokens || 0) + (out.usage.cache_read_input_tokens || 0) + (out.usage.cache_creation_input_tokens || 0), out.usage.output_tokens)
  if (out.stop_reason === 'refusal') throw new Error('Claude 가 요청 처리를 거절했습니다.')
  if (out.stop_reason === 'max_tokens') throw new Error('Claude 응답이 길이 제한으로 잘렸습니다.')
  const text = (out.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  try { return JSON.parse(text) } catch (e) { throw new Error('Claude 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
}

async function callClaudeContent(key, model, system, content, schema) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: 'user', content }], output_config: { format: { type: 'json_schema', schema } } }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Claude 요청 실패: ' + apiError(out, res.status))
  const text = (out.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  return JSON.parse(text)
}

// AI 이미지 생성(OpenAI) → 비공개 저장소에 저장 → 사진 자료실에 'AI 생성' 으로 추가(다음 영상에서 재사용)
async function generateImage(env, key, model, prompt, ratio, d) {
  const vertical = ratio === '9:16'
  const dalle = /^dall-e/.test(model)
  const body = { model, n: 1, prompt: `${prompt}\n\n실사 사진 스타일, 한국 아파트, 자연광. 이미지 안에 글자·숫자·로고·워터마크를 넣지 않습니다. 사람 얼굴은 알아볼 수 없게.`,
    size: dalle ? (vertical ? '1024x1792' : '1792x1024') : (vertical ? '1024x1536' : '1536x1024') }
  if (dalle) body.response_format = 'b64_json'
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('OpenAI 이미지 생성 실패: ' + apiError(out, res.status))
  const b64 = out.data && out.data[0] && out.data[0].b64_json
  if (!b64) throw new Error('OpenAI 이미지 응답에 그림이 없습니다.')
  addUsage(d, 'image', out.usage && out.usage.input_tokens, out.usage && out.usage.output_tokens)
  const path = `files/${crypto.randomUUID()}/file.png`
  await ensureBucket(env)
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
    method: 'POST', headers: storageHeaders(env, { 'content-type': 'image/png', 'x-upsert': 'true' }), body: unb64(b64),
  })
  if (!up.ok) throw new Error('AI 이미지 저장 실패(' + up.status + ')')
  const item = { id: 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), path, name: 'AI 생성 이미지', desc: '[AI 생성] ' + prompt.slice(0, 280), tags: ['AI 생성'], source: 'ai', model, created: now() }
  await mutate(env, 'photos', [], (list) => { list.unshift(item) })
  return item
}
async function signedUrl(env, path, seconds) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, {
    method: 'POST', headers: storageHeaders(env, { 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: seconds }),
  })
  const out = await r.json().catch(() => ({}))
  const signed = out.signedURL || out.signedUrl
  if (!r.ok || !signed) throw new Error('파일 주소 발급 실패: ' + apiError(out, r.status))
  return env.SUPABASE_URL + '/storage/v1' + signed
}

async function callOpenAI(key, model, system, user, schema, d) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: 'review', strict: true, schema } },
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('OpenAI 요청 실패: ' + apiError(out, res.status))
  if (out.usage) addUsage(d, 'openai', out.usage.prompt_tokens, out.usage.completion_tokens)
  const msg = (out.choices && out.choices[0] && out.choices[0].message) || {}
  if (msg.refusal) throw new Error('OpenAI 가 요청 처리를 거절했습니다: ' + msg.refusal)
  try { return JSON.parse(msg.content || '') } catch (e) { throw new Error('OpenAI 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
}

// HeyGen 남은 크레딧 (API 값 ÷ 60 = 크레딧)
async function heygenQuota(key) {
  try {
    const r = await fetch('https://api.heygen.com/v2/user/remaining_quota', { headers: { 'X-Api-Key': key, accept: 'application/json' } })
    const o = await r.json().catch(() => ({}))
    const q = o && o.data && Number(o.data.remaining_quota)
    return Number.isFinite(q) ? Math.round((q / 60) * 100) / 100 : null
  } catch (e) { return null }
}

async function listModels(provider, key) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new HttpError(400, 'Claude 인증 실패: ' + apiError(out, res.status))
    return (out.data || []).map((m) => ({ id: m.id, name: m.display_name ? `${m.display_name} (${m.id})` : m.id }))
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: 'Bearer ' + key } })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new HttpError(400, 'OpenAI 인증 실패: ' + apiError(out, res.status))
    const skip = /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|davinci|babbage|instruct|codex)/i
    return (out.data || []).map((m) => m.id).filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !skip.test(id))
      .sort().reverse().map((id) => ({ id, name: id }))
  }
  const res = await fetch('https://api.heygen.com/v2/user/remaining_quota', { headers: { 'X-Api-Key': key, accept: 'application/json' } })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || (out && out.error)) throw new HttpError(400, 'HeyGen 인증 실패: ' + apiError(out, res.status))
  return []
}

// HeyGen 개인 아바타: 아바타 그룹(내 아바타) → 그룹별 룩. 실패하면 전체 목록에서 내 사진 아바타로 대체.
async function listAvatars(key, token) {
  const h = { 'X-Api-Key': key, accept: 'application/json' }
  const PAGE = 4
  const start = Math.max(0, parseInt(token || '0', 10) || 0)
  const gres = await fetch('https://api.heygen.com/v2/avatar_group.list?include_public=false', { headers: h })
  const gout = await gres.json().catch(() => ({}))
  const groups = (gout.data && (gout.data.avatar_group_list || gout.data.avatar_groups)) || null
  if (gres.ok && Array.isArray(groups)) {
    const avatars = []
    for (const g of groups.slice(start, start + PAGE)) {
      const r = await fetch(`https://api.heygen.com/v2/avatar_group/${encodeURIComponent(g.id)}/avatars`, { headers: h })
      const o = await r.json().catch(() => ({}))
      const list = (o.data && (o.data.avatar_list || o.data.avatars)) || []
      const photo = /photo/i.test(String(g.group_type || g.type || ''))
      for (const a of list) {
        avatars.push({
          id: a.id || a.avatar_id || a.talking_photo_id,
          name: a.name || a.avatar_name || g.name || '이름 없음',
          preview: a.image_url || a.preview_image_url || a.preview_url || g.preview_image || '',
          status: String(a.status || 'completed').toLowerCase() === 'completed' ? 'completed' : String(a.status || '').toLowerCase(),
          voiceId: a.default_voice_id || a.voice_id || g.default_voice_id || '',
          type: photo || a.talking_photo_id ? 'talking_photo' : 'avatar',
        })
      }
    }
    const next = start + PAGE < groups.length ? String(start + PAGE) : ''
    return { avatars: avatars.filter((a) => a.id), nextToken: next }
  }
  // 대체 경로: /v2/avatars 의 talking_photos(계정에 올린 사진 아바타)
  const res = await fetch('https://api.heygen.com/v2/avatars', { headers: h })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new HttpError(400, 'HeyGen 아바타 조회 실패: ' + apiError(out, res.status))
  const all = ((out.data && out.data.talking_photos) || []).map((t) => ({
    id: t.talking_photo_id, name: t.talking_photo_name || '사진 아바타', preview: t.preview_image_url || '',
    status: 'completed', voiceId: '', type: 'talking_photo',
  }))
  return { avatars: all.slice(start, start + 24), nextToken: start + 24 < all.length ? String(start + 24) : '' }
}

// ─────────────────────────── 자료 검색 ───────────────────────────
// 승인 자료를 단락으로 나눠 키워드(단어 + 한글 2글자 조각) 겹침으로 점수를 매긴다.
function retrieve(sources, keywords) {
  const base = String(keywords).split(/[\s,·/]+/).map((t) => t.trim()).filter((t) => t.length >= 2)
  // 동의어 확장: '크랙' 으로 찾아도 '균열' 자료가 나오게
  const terms = [...new Set(base.flatMap((t) => {
    const g = T.synonyms.find((x) => [x.canonical, ...x.terms].some((w) => w.length >= 2 && (t.includes(w) || w.includes(t))))
    return g ? [t, g.canonical, ...g.terms.filter((w) => w.length >= 2)] : [t]
  }))]
  const grams = new Set()
  terms.forEach((t) => { for (let i = 0; i < t.length - 1; i++) grams.add(t.slice(i, i + 2)) })
  const chunks = []
  for (const s of sources) {
    const paras = String(s.content).split(/\n\s*\n/)
    let buf = ''
    const flush = () => { if (buf.trim()) chunks.push({ sourceId: s.id, title: s.title, provenance: s.provenance, text: buf.trim() }); buf = '' }
    for (const p of paras) {
      if ((buf + '\n\n' + p).length > 900 && buf) flush()
      if (p.length > 900) { for (let i = 0; i < p.length; i += 800) { buf = p.slice(i, i + 900); flush() } } else buf = buf ? buf + '\n\n' + p : p
    }
    flush()
  }
  for (const c of chunks) {
    let score = 0
    for (const t of terms) score += (c.text.split(t).length - 1) * 5 + (c.title.includes(t) ? 3 : 0)
    for (const g of grams) if (c.text.includes(g)) score += 1
    c.score = score
  }
  const hits = chunks.filter((c) => c.score >= 3).sort((a, b) => b.score - a.score)
  const out = []
  let size = 0
  for (const c of hits) {
    if (out.length >= 30 || size + c.text.length > 40000) break
    out.push({ sourceId: c.sourceId, title: c.title, provenance: c.provenance, text: c.text })
    size += c.text.length
  }
  return out
}

// 완료된 영상의 형식(장면 수·발화량·길이)만 다음 대본 참고용으로 요약 — 사실은 전달하지 않음
function memoryFrom(jobs) {
  return jobs.filter((j) => j.status === 'rendered' && j.data && j.data.plan).slice(0, 5).map((j) => {
    const p = j.data.plan
    const chars = p.scenes.reduce((a, s) => a + s.narration.length, 0)
    return `목표 ${j.input.seconds}초 · ${j.input.ratio} · ${j.input.audience}: 검수 통과 장면 ${p.scenes.length}개, 발화 ${chars}자${j.data.actualSeconds ? `, 실제 ${j.data.actualSeconds}초` : ''}`
  })
}

// ─────────────────────────── 상태 조회 ───────────────────────────
async function state(env, opt = {}) {
  const [secretsObj, settingsObj, sources, jobs, photos] = await Promise.all([
    readJSON(env, 'secrets', {}), readJSON(env, 'settings', {}), readJSON(env, 'sources', []), readJSON(env, 'jobs', []), readJSON(env, 'photos', []),
  ])
  const secrets = Object.entries(secretsObj).map(([provider, v]) => ({ provider, model: v.model, checked_at: v.checked_at }))
  const settingsRows = [{ data: settingsObj }]
  jobs.splice(50)
  const sec = {}
  for (const p of ['claude', 'openai', 'heygen']) {
    const r = secrets.find((x) => x.provider === p)
    sec[p] = { configured: !!r, model: (r && r.model) || '', checkedAt: (r && r.checked_at) || '' }
  }
  const settings = { ...DEFAULT_SETTINGS, ...((settingsRows[0] && settingsRows[0].data) || {}) }
  const readiness = {
    claude: sec.claude.configured && !!sec.claude.model,
    openai: sec.openai.configured && !!sec.openai.model,
    heygen: sec.heygen.configured,
  }
  const off = new Set(settings.builtinOff || [])
  const builtins = K.map((k) => ({ ...k, approved: !off.has(k.id), builtin: true, created_at: '' }))
  const all = [...sources, ...builtins]
  if (opt.raw) return { secrets: sec, readiness, settings, sourcesFull: all, sources: all, jobs, photos }
  return {
    connections: sec, readiness, settings,
    sources: all.map((s) => ({ id: s.id, title: s.title, provenance: s.provenance, content: s.content, file: s.file ? { name: s.file.name, size: s.file.size } : null, approved: s.approved ? 1 : 0, builtin: !!s.builtin, created: s.created_at })),
    usageTotal: totalUsage(jobs),
    photos: photos.map((p) => ({ id: p.id, name: p.name, size: p.size || 0, desc: p.desc, tags: p.tags || [], source: p.source, created: p.created })),
    jobs: jobs.map(toJob),
    learningCount: jobs.filter((j) => j.status === 'rendered').length,
    terms: T,
  }
}
function readinessProblems(st) {
  const out = []
  if (!st.readiness.claude) out.push('Claude 연결')
  if (!st.readiness.openai) out.push('OpenAI 연결')
  if (!st.readiness.heygen) out.push('HeyGen 연결')
  if (!st.settings.avatarId || !st.settings.voiceId) out.push('아바타·음성 설정')
  if (!st.settings.consent) out.push('아바타 사용 동의')
  if (!st.sourcesFull.some((s) => s.approved)) out.push('승인된 브랜드 자료')
  return out
}
function toJob(r) {
  const d = r.data || {}
  return {
    id: r.id, created: r.created_at, status: r.status, step: r.step, revision: r.revision, input: r.input,
    plan: d.plan || null, prompt: d.prompt || '', claude: d.claude || null, openai: d.openai || null,
    videoUrl: d.videoUrl || '', actualSeconds: d.actualSeconds || null, error: d.error || '',
    events: d.events || [], sources: d.sources || [], memory: d.memory || [],
    models: d.models || { claude: '', openai: '' }, promptVersion: d.promptVersion || PROMPT_VERSION,
    issues: d.pendingIssues && d.pendingIssues.length ? d.pendingIssues : d.lastIssues || [],
    usage: usageView(d),
  }
}
function claudeCost(model, u) {
  const p = CLAUDE_PRICE.find(([id]) => String(model || '').startsWith(id))
  return p && u ? Math.round(((u.input * p[1] + u.output * p[2]) / 1e6) * 10000) / 10000 : null
}
function usageView(d) {
  const u = d.usage || {}
  return {
    claude: u.claude ? { ...u.claude, usd: claudeCost(d.models && d.models.claude, u.claude) } : null,
    openai: u.openai || null,
    image: u.image || null,
    heygen: u.heygen || null,
  }
}
function totalUsage(jobs) {
  const t = { claude: { input: 0, output: 0, usd: 0 }, openai: { input: 0, output: 0 }, images: 0, heygen: 0, jobs: 0 }
  for (const j of jobs) {
    const v = usageView(j.data || {})
    if (v.claude) { t.claude.input += v.claude.input; t.claude.output += v.claude.output; t.claude.usd += v.claude.usd || 0 }
    if (v.openai) { t.openai.input += v.openai.input; t.openai.output += v.openai.output }
    if (v.heygen && v.heygen.used) t.heygen += v.heygen.used
    if (v.image) t.images += v.image.calls
    if (v.claude || v.openai) t.jobs++
  }
  t.claude.usd = Math.round(t.claude.usd * 100) / 100
  t.heygen = Math.round(t.heygen * 100) / 100
  return t
}
function validateInput(i) {
  i = i || {}
  const keywords = String(i.keywords || '').trim()
  const audience = String(i.audience || '').trim()
  const seconds = Number(i.seconds)
  if (keywords.length < 2 || keywords.length > 1000) throw new HttpError(400, '영상 주제 키워드를 2자 이상 입력해 주세요.')
  if (audience.length < 2 || audience.length > 200) throw new HttpError(400, '시청 대상을 선택해 주세요.')
  if (![30, 60, 90, 120, 180, 300].includes(seconds)) throw new HttpError(400, '목표 영상 길이가 올바르지 않습니다.')
  if (!['16:9', '9:16'].includes(i.ratio)) throw new HttpError(400, '화면 비율이 올바르지 않습니다.')
  return { keywords, audience, seconds, ratio: i.ratio }
}
async function getSettings(env) {
  return { ...DEFAULT_SETTINGS, ...(await readJSON(env, 'settings', {})) }
}

// ─────────────────────────── 인증 · 저장 · 암호화 ───────────────────────────
async function requireAdmin(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, '로그인이 필요합니다.')
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_SERVICE_ROLE, authorization: 'Bearer ' + token } })
  if (!r.ok) throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.')
  const user = await r.json()
  const prof = await sb(env, 'profiles?select=role&id=eq.' + user.id)
  if (!prof.length || prof[0].role !== 'admin') throw new HttpError(403, '관리자 계정만 사용할 수 있는 비공개 작업실입니다.')
  return user
}

async function sb(env, path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (prefer) headers.prefer = prefer
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  if (!r.ok) {
    throw new Error('DB 오류(' + r.status + '): ' + text.slice(0, 300))
  }
  return text ? JSON.parse(text) : null
}

// 작업실 데이터는 Supabase Storage 의 비공개 버킷(studio)에 JSON 파일로 보관한다 → SQL 실행 불필요
const BUCKET = 'studio'
let bucketReady = false
function storageHeaders(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, ...extra }
}
async function ensureBucket(env) {
  if (bucketReady) return
  const r = await fetch(env.SUPABASE_URL + '/storage/v1/bucket', {
    method: 'POST', headers: storageHeaders(env, { 'content-type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  })
  const t = await r.text()
  if (!r.ok && !/already exists|Duplicate|409/i.test(t + r.status)) throw new Error('저장소 준비 실패: ' + t.slice(0, 200))
  bucketReady = true
}
async function readJSON(env, name, dflt) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}.json?t=${Date.now()}`, { headers: storageHeaders(env, { 'cache-control': 'no-cache' }) })
  if (r.status === 400 || r.status === 404) { await r.text(); return JSON.parse(JSON.stringify(dflt)) }
  if (!r.ok) throw new Error('저장소 읽기 실패(' + r.status + '): ' + (await r.text()).slice(0, 200))
  return r.json()
}
async function writeJSON(env, name, data) {
  await ensureBucket(env)
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}.json`, {
    method: 'POST', headers: storageHeaders(env, { 'content-type': 'application/json', 'x-upsert': 'true', 'cache-control': 'no-cache' }),
    body: JSON.stringify(data),
  })
  if (!r.ok) throw new Error('저장소 쓰기 실패(' + r.status + '): ' + (await r.text()).slice(0, 200))
}
// 최신 파일을 다시 읽어 고친 뒤 저장 (오래 걸리는 AI 호출 동안 다른 변경을 덮어쓰지 않도록)
async function mutate(env, name, dflt, fn) {
  const data = await readJSON(env, name, dflt)
  await fn(data)
  await writeJSON(env, name, data)
  return data
}
async function saveJob(env, job, extra = {}) {
  let saved = null
  await mutate(env, 'jobs', [], (list) => {
    saved = list.find((j) => j.id === job.id)
    if (!saved) throw new Error('작업을 찾을 수 없습니다.')
    Object.assign(saved, { status: job.status, step: job.step, revision: job.revision, data: job.data }, extra)
  })
  return saved
}

async function getKey(env, provider, required = true) {
  const rows = [(await readJSON(env, 'secrets', {}))[provider]].filter(Boolean)
  if (!rows.length) {
    if (required) throw new HttpError(400, `${provider === 'claude' ? 'Claude' : provider === 'openai' ? 'OpenAI' : 'HeyGen'} API 연결을 먼저 저장해 주세요.`)
    return ''
  }
  return decrypt(env, rows[0].cipher, rows[0].iv)
}
async function aesKey(env) {
  // STUDIO_ENC_KEY 가 없으면 service_role 키에서 파생 (별도 설정 불필요)
  const secret = env.STUDIO_ENC_KEY || 'aptsq-video-studio:' + env.SUPABASE_SERVICE_ROLE
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text))
  return { cipher: b64(new Uint8Array(buf)), iv: b64(iv) }
}
async function decrypt(env, cipher, iv) {
  try {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(cipher))
    return new TextDecoder().decode(buf)
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(500, '저장된 API 키를 복호화하지 못했습니다(STUDIO_ENC_KEY 가 바뀌었다면 키를 다시 저장해 주세요).')
  }
}

// ─────────────────────────── 공통 ───────────────────────────
function serveStatic(path) {
  const name = path === '/' || path === '' ? 'index.html' : path.replace(/^\/+/, '')
  const body = STATIC_FILES[name]
  if (body == null) return new Response('Not found', { status: 404 })
  const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html'
  return new Response(body, { headers: { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-cache' } })
}
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } })
}
function now() { return new Date().toISOString() }
function ev(text) { return { time: now(), text } }
function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/') }
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim() }
function apiError(out, status) {
  const e = out && (out.error || out.message)
  const m = typeof e === 'string' ? e : e && (e.message || e.detail || e.code)
  return (m ? String(m) : 'HTTP ' + status).slice(0, 300)
}
function b64(bytes) { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b) }); return btoa(s) }
function unb64(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)) }
