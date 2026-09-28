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
const MAX_SOURCE_CHARS = 300000       // 자료 1개 본문 최대 글자 수 (PDF·PPT 에서 뽑은 글자 포함)
const MAX_FILE_BYTES = 50 * 1048576    // 원본 파일 최대 50MB
const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'submitting', 'rendering']
const DEFAULT_SETTINGS = {
  avatarId: '', avatarType: 'avatar', voiceId: 'fdd91d5eb0654e45a8b216b3f2c86eca',
  avatarName: '조현식 이사', consent: false, consentAt: '', maxDailyJobs: 5,
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

  async approval(env, { id, approved }) {
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
      data: { models, memory, promptVersion: PROMPT_VERSION, events: [ev('제작 요청 접수 · 승인 자료 검색 대기')] },
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
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), draftUser(job, d), PLAN_SCHEMA)
    applyPlan(job, plan, st)
    d.events.push(ev(`대본 작성 완료: 장면 ${plan.scenes.length}개 · Claude ${d.models.claude}`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 2) Claude 독립 검수
  if (job.step === 2) {
    d.claude = await callClaude(claudeKey, d.models.claude, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA)
    d.claude = normReview(d.claude)
    d.events.push(ev(`Claude 검수: ${passes(d.claude) ? '통과' : '미통과'} (근거 ${d.claude.grounding} · 브랜드 ${d.claude.brand} · 전달 ${d.claude.clarity} · 제작 ${d.claude.production})`))
    job.step = 3
    return
  }

  // 3) OpenAI 독립 검수
  if (job.step === 3) {
    d.openai = normReview(await callOpenAI(openaiKey, d.models.openai, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA))
    d.events.push(ev(`OpenAI 검수: ${passes(d.openai) ? '통과' : '미통과'} (근거 ${d.openai.grounding} · 브랜드 ${d.openai.brand} · 전달 ${d.openai.clarity} · 제작 ${d.openai.production})`))
    job.step = 4
    return
  }

  // 4) 판정 → 통과 / 수정 / 보류
  if (job.step === 4 && job.status !== 'revising') {
    const issues = allIssues(d)
    if (!issues.length) {
      d.events.push(ev('교차 검수 통과: 양쪽 4항목 90점 이상 · 지적 0건 · 인용 원문 일치'))
      job.step = 5; job.status = 'submitting'
    } else if (job.revision < MAX_REVISIONS) {
      d.pendingIssues = issues
      d.events.push(ev(`검수 미통과(지적 ${issues.length}건) → 자동 수정 ${job.revision + 1}/${MAX_REVISIONS}`))
      job.status = 'revising'
    } else {
      job.status = 'held'
      d.error = `수정 ${MAX_REVISIONS}회 후에도 검수 기준을 통과하지 못해 자동 보류했습니다. 영상은 제작하지 않았습니다.`
      d.events.push(ev('검수 기준 미통과 → 자동 보류 (HeyGen 제작 요청 안 함)'))
    }
    return
  }

  // 4-수정) 지적 사항을 반영해 대본 수정 → 다시 양쪽 검수
  if (job.status === 'revising') {
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), reviseUser(job, d), PLAN_SCHEMA)
    job.revision += 1
    applyPlan(job, plan, st)
    d.claude = null; d.openai = null; d.pendingIssues = []
    d.events.push(ev(`자동 수정 ${job.revision}/${MAX_REVISIONS} 완료 → 재검수`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 5) HeyGen 제작 요청 (중복 제작 방지: 요청 전에 '시도함'을 먼저 저장)
  if (job.step === 5) {
    if (!st.settings.consent || !st.settings.avatarId || !st.settings.voiceId) throw new Error('아바타 사용 동의·아바타·음성 설정이 필요합니다.')
    if (allIssues(d).length) throw new Error('검수 통과 기록이 없어 제작을 요청하지 않았습니다.')
    if (d.submitAttempted && !d.videoId) {
      job.status = 'uncertain'
      d.error = '이전 제작 요청의 결과를 확인하지 못했습니다. 중복 비용을 막기 위해 자동 재요청하지 않았습니다. HeyGen 대시보드에서 영상 생성 여부를 확인해 주세요.'
      d.events.push(ev('제작 요청 결과 불명 → 중복 방지로 중단'))
      return
    }
    d.submitAttempted = true
    await saveJob(env, job)
    const heygenKey = await getKey(env, 'heygen')
    let res
    try {
      res = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: { 'X-Api-Key': heygenKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(heygenPayload(job, st.settings)),
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
    job.step = 6; job.status = 'rendering'
    return
  }

  // 6) 렌더링 상태 확인
  if (job.step === 6) {
    const heygenKey = await getKey(env, 'heygen')
    const res = await fetch('https://api.heygen.com/v1/video_status.get?video_id=' + encodeURIComponent(d.videoId), {
      headers: { 'X-Api-Key': heygenKey, accept: 'application/json' },
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HeyGen 상태 확인 실패: ' + apiError(out, res.status))
    const v = out.data || {}
    if (v.status === 'completed' && v.video_url) {
      d.videoUrl = v.video_url
      d.actualSeconds = v.duration ? Math.round(Number(v.duration)) : null
      d.events.push(ev(`영상 생성 완료${d.actualSeconds ? ` · 실제 길이 ${d.actualSeconds}초` : ''}`))
      job.step = 7; job.status = 'rendered'
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
  plan.scenes.forEach((s, i) => {
    s.seconds = Math.max(1, Math.min(120, Math.round(Number(s.seconds) || 0)))
    s.narration = String(s.narration || '').slice(0, 1600)
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
  const total = plan.scenes.reduce((a, s) => a + s.seconds, 0)
  if (Math.abs(total - job.input.seconds) > Math.max(15, job.input.seconds * 0.25)) problems.push(`장면 길이 합계(${total}초)가 목표 ${job.input.seconds}초와 크게 다릅니다.`)
  d.plan = plan
  d.groundingIssues = problems
  d.prompt = heygenPrompt(job, plan)
}

function allIssues(d) {
  const out = []
  ;(d.groundingIssues || []).forEach((x) => out.push('[서버 근거 검사] ' + x))
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
    '5. onScreen 은 화면 자막(짧은 핵심 문구, 30자 이내), visual 은 화면 구성 지시입니다.',
    '6. 근거가 부족해 목표 길이·주제를 정직하게 채울 수 없으면 blockers 에 이유를 적습니다(억지로 채우지 않음).',
    '7. 과장·단정적 효과 보장·타사 비방·확인되지 않은 법적 판단은 쓰지 않습니다.',
  ].join('\n')
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
  return `${briefBlock(job)}${mem}\n\n[승인 자료]\n${contextBlock(d)}\n\n위 규칙에 따라 영상 제목과 장면별 대본을 작성하세요.`
}
function reviseUser(job, d) {
  return `${draftUser(job, d)}\n\n[직전 대본]\n${JSON.stringify(d.plan)}\n\n[검수 지적 사항 — 모두 해결하세요]\n${(d.pendingIssues || []).map((x) => '- ' + x).join('\n')}\n\n지적 사항을 반영해 대본 전체를 다시 작성하세요. 해결할 수 없으면 blockers 에 이유를 적으세요.`
}
function reviewSystem() {
  return [
    '당신은 아파트스퀘어 영상 대본의 독립 검수자입니다. 작성자와 별개로 엄격하게 평가합니다.',
    '각 항목을 0~100점으로 채점합니다:',
    '- grounding: 모든 주장·수치가 [승인 자료]로 뒷받침되는가. 자료에 없는 사실이 하나라도 있으면 60점 이하.',
    '- brand: 아파트스퀘어(감리 전문, 신뢰·정확성)와 발표자(조현식 이사) 어조에 맞고 과장·보장·비방이 없는가.',
    '- clarity: 시청 대상이 이해하기 쉽고 논리적 비약 없이 전달되는가.',
    '- production: HeyGen 아바타 영상으로 바로 제작 가능한가(장면 길이 합계, 발화량, 자막 길이, 화면 지시).',
    'issues 에는 반드시 고쳐야 하는 중대 지적만 한국어로 적습니다(없으면 빈 배열). 사소한 취향은 적지 않습니다.',
    'pass 는 네 항목이 모두 90점 이상이고 issues 가 비어 있을 때만 true 입니다.',
  ].join('\n')
}
function reviewUser(job, d) {
  return `${briefBlock(job)}\n\n[승인 자료]\n${contextBlock(d)}\n\n[검수 대상 대본]\n${JSON.stringify(d.plan)}\n\n[HeyGen 에 전달할 프롬프트]\n${d.prompt}\n\n위 대본과 프롬프트를 평가하세요.`
}
function heygenPrompt(job, plan) {
  const i = job.input
  const lines = [
    `# ${plan.title}`,
    `발표자: 아파트스퀘어 조현식 이사 (등록된 전용 아바타·음성 사용)`,
    `시청 대상: ${i.audience} · 목표 ${i.seconds}초 · ${i.ratio === '9:16' ? '세로형 1080×1920' : '가로형 1920×1080'} · 자막 켜기`,
    `브랜드 지시: 차분하고 신뢰감 있는 전문가 어조, 과장 표현·효과 보장 금지, 아파트스퀘어 브랜드 컬러(레드 #DC3042, 네이비 #181C35) 사용`,
    '',
  ]
  plan.scenes.forEach((s, k) => {
    lines.push(`## 장면 ${k + 1} (${s.seconds}초)`)
    lines.push(`자막: ${s.onScreen}`)
    lines.push(`화면: ${s.visual}`)
    lines.push(`대사: ${s.narration}`)
    lines.push('')
  })
  return lines.join('\n').trim()
}
function heygenPayload(job, settings) {
  const plan = job.data.plan
  const character = settings.avatarType === 'talking_photo'
    ? { type: 'talking_photo', talking_photo_id: settings.avatarId }
    : { type: 'avatar', avatar_id: settings.avatarId, avatar_style: 'normal' }
  return {
    title: `[아파트스퀘어] ${plan.title}`.slice(0, 120),
    caption: true,
    dimension: job.input.ratio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
    video_inputs: plan.scenes.map((s) => ({
      character,
      voice: { type: 'text', input_text: s.narration, voice_id: settings.voiceId },
    })),
  }
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
          narration: { type: 'string' },
          onScreen: { type: 'string' },
          visual: { type: 'string' },
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
        required: ['seconds', 'narration', 'onScreen', 'visual', 'citations'],
        additionalProperties: false,
      },
    },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'scenes', 'blockers'],
  additionalProperties: false,
}

// ─────────────────────────── 외부 API ───────────────────────────
async function callClaude(key, model, system, user, schema) {
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
  if (out.stop_reason === 'refusal') throw new Error('Claude 가 요청 처리를 거절했습니다.')
  if (out.stop_reason === 'max_tokens') throw new Error('Claude 응답이 길이 제한으로 잘렸습니다.')
  const text = (out.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  try { return JSON.parse(text) } catch (e) { throw new Error('Claude 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
}

async function callOpenAI(key, model, system, user, schema) {
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
  const msg = (out.choices && out.choices[0] && out.choices[0].message) || {}
  if (msg.refusal) throw new Error('OpenAI 가 요청 처리를 거절했습니다: ' + msg.refusal)
  try { return JSON.parse(msg.content || '') } catch (e) { throw new Error('OpenAI 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
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
  const terms = String(keywords).split(/[\s,·/]+/).map((t) => t.trim()).filter((t) => t.length >= 2)
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
    if (out.length >= 12 || size + c.text.length > 12000) break
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
  const [secretsObj, settingsObj, sources, jobs] = await Promise.all([
    readJSON(env, 'secrets', {}), readJSON(env, 'settings', {}), readJSON(env, 'sources', []), readJSON(env, 'jobs', []),
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
  if (opt.raw) return { secrets: sec, readiness, settings, sourcesFull: sources, sources, jobs }
  return {
    connections: sec, readiness, settings,
    sources: sources.map((s) => ({ id: s.id, title: s.title, provenance: s.provenance, content: s.content, file: s.file ? { name: s.file.name, size: s.file.size } : null, approved: s.approved ? 1 : 0, created: s.created_at })),
    jobs: jobs.map(toJob),
    learningCount: jobs.filter((j) => j.status === 'rendered').length,
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
  }
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
