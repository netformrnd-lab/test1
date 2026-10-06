// 아파트스퀘어 영상 제작 작업실 (원본 reelty-ai-video-studio 화면·흐름을 바닐라 JS로 재현)
// 서버: worker/worker.js (build.mjs 로 화면과 합쳐 deploy/worker.js 로 배포)  ·  설정: config.js
;(function () {
  const CFG = window.STUDIO_CONFIG || {}
  const API = CFG.STUDIO_API || 'api/studio'
  const sbc = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY)
  const $ = (id) => document.getElementById(id)
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  // ── lucide 아이콘 ──
  const ICONS = {
    lock: '<circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
    film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    settings: '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    edit: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  }
  function icon(name, size = 24, cls = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICONS[name] || ''}</svg>`
  }
  document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 24) })

  // ── 상수 (원본과 동일) ──
  const STATUS = {
    queued: '자료 검색', drafting: '대본 작성', reviewing: '교차 검수', revising: '자동 수정', submitting: '제작 요청',
    preparing: '장면 이미지 준비', ready: '검수 완료 · 제작 대기',
    rendering: 'HeyGen 제작 중', rendered: '영상 생성 완료', held: '자동 보류', failed: '처리 실패', uncertain: '중복 방지로 중단',
  }
  const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'preparing', 'submitting', 'rendering']
  const DEFAULT_SETTINGS = { avatarId: '', avatarType: 'avatar', voiceId: 'fdd91d5eb0654e45a8b216b3f2c86eca', avatarName: '조현식 이사', consent: false, consentAt: '', maxDailyJobs: 5 }
  const SAMPLE_SOURCE = {
    title: '아파트스퀘어 핵심 고객·공종·서비스 기획',
    provenance: '아파트스퀘어 킥오프 미팅(2).docx · 2026-08-04 등록 · 원문 2~3절 발췌 · 계획 자료(현재 제공 범위 확인 필요)',
    content: `[기획 자료: 실제 서비스 제공 여부 및 현재 범위 확인 후 사용]
2. 핵심 고객과 우선 공종
핵심 고객
· 12개월 이내 공사 추진 예정
· 주요 의사결정자: 입주자대표회의, 관리사무소장
대상 공종
1. 외벽 재도장
1. 옥상·외벽 방수
1. 지하주차장 에폭시 및 누수 보수
1. 보도블럭/아스콘
초기에는 모든 공종을 확대하기보다, 고객 만족도와 수익성이 높은 공종에 집중한다.

3. 대표 상품 구성
서비스는 감리 업무의 나열이 아니라 고객이 얻는 결과를 중심으로 구성한다.
어떤 과정에서도 고객 입장에서 ‘why?’가 없도록, 논리적 비약이 없도록 구축
공사 전 진단 패키지 (특색/차별성 있게)
· 현장 상태 진단
· 필요한 공사와 미뤄도 되는 공사 구분
· 공법별 장단점 비교
· 예상 공사비 범위(합리적인 근거 표준 폼 구축)
· 입주자대표회의 설명자료

설계·공정입찰 패키지
· 공사 범위 확정
· 설계도서 및 시방서 작성
· 물량산출
· 입찰조건 작성
· 업체 평가기준 수립
· 현장설명회와 기술평가 지원
· 디자인&모델링`,
  }
  const PIPELINE = [
    ['아파트스퀘어 자료 검색', '승인 원문과 문장별 근거 확보', 0, 1],
    ['Claude × OpenAI 교차 검수', '같은 대본·프롬프트를 독립 평가', 1, 5],
    ['컷별 장면 이미지 준비', '사진 자료실 배정 · 부족한 컷은 AI 이미지 생성', 5, 6],
    ['이사님 아바타 영상 생성', '컷마다 배경 사진 + 아바타·음성으로 실제 제작', 6, 8],
  ]
  const PROVIDERS = [['claude', 'Claude'], ['openai', 'ChatGPT · OpenAI'], ['heygen', 'HeyGen']]

  // ── 상태 ──
  const S = {
    data: null, tab: 'create', error: '', success: '', busy: false, selectedId: null, requestId: null,
    settings: { ...DEFAULT_SETTINGS }, avatars: [], nextToken: '', avatarsLoaded: false, settingsBusy: false,
    providerUi: {}, queue: [],
  }

  // ── API ──
  async function api(body) {
    const { data: { session } } = await sbc.auth.getSession()
    if (!session) { showLogin(); throw new Error('로그인이 필요합니다.') }
    let res
    try {
      res = await fetch(API, {
        method: body ? 'POST' : 'GET',
        headers: { authorization: 'Bearer ' + session.access_token, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (e) {
      throw new Error('작업실 서버에 연결하지 못했습니다. config.js 의 STUDIO_API 주소와 Worker 배포 상태를 확인해 주세요.')
    }
    const out = await res.json().catch(() => ({}))
    if (res.status === 401) showLogin()
    if (!res.ok) throw new Error(out.error || '요청을 처리하지 못했습니다.')
    return out
  }

  async function load() {
    try {
      S.data = await api()
      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }
      syncSettingsForm()
    } catch (e) { S.error = e.message }
    renderAll()
  }

  async function act(body, okMsg) {
    S.busy = true; S.error = ''; S.success = ''; renderAll()
    try {
      S.data = await api(body)
      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }
      syncSettingsForm()
      S.success = okMsg
      return true
    } catch (e) { S.error = e.message; return false } finally { S.busy = false; renderAll() }
  }

  // ── 파생 값 ──
  const activeJob = () => S.data && S.data.jobs.find((j) => ACTIVE.includes(j.status))
  const currentJob = () => S.data && (S.data.jobs.find((j) => j.id === S.selectedId) || activeJob() || S.data.jobs[0])
  function missing() {
    const n = S.data
    if (!n) return []
    const out = []
    if (!n.readiness.claude) out.push({ label: 'Claude API와 사용할 모델을 저장해 주세요.', tab: 'settings', action: 'Claude 연결' })
    if (!n.readiness.openai) out.push({ label: 'OpenAI API와 사용할 모델을 저장해 주세요.', tab: 'settings', action: 'OpenAI 연결' })
    if (!n.readiness.heygen) out.push({ label: 'HeyGen API 연결을 저장해 주세요.', tab: 'settings', action: 'HeyGen 연결' })
    if (!n.settings.avatarId || !n.settings.voiceId) out.push({ label: '사용할 아바타와 음성을 선택하고 저장해 주세요.', tab: 'settings', action: '아바타 설정' })
    if (!n.settings.consent) out.push({ label: '아바타 사용 권한 확인을 체크하고 설정을 저장해 주세요.', tab: 'settings', action: '동의 저장' })
    if (!n.sources.some((s) => s.approved === 1)) {
      out.push({ label: n.sources.length ? '등록 자료에서 ‘영상 제작 근거로 사용’을 체크해 주세요.' : '영상의 근거가 될 브랜드 자료를 1개 이상 등록해 주세요.', tab: 'knowledge', action: '자료실 열기' })
    }
    return out
  }
  const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  function passes(r) {
    return !!r && r.pass && r.issues.length === 0 && [r.grounding, r.brand, r.clarity, r.production].every((x) => x >= 90)
  }

  // ── 렌더링 ──
  function renderAll() {
    renderTabs(); renderMessages(); renderCreate(); renderKnowledge(); renderHistory(); renderSettings(); renderPhotos()
    ensurePolling()
  }

  function renderTabs() {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('data-state', b.dataset.tab === S.tab ? 'active' : 'inactive'))
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== S.tab })
    $('tab-src-count').textContent = S.data ? S.data.sources.length : 0
    $('tab-photo-count').textContent = S.data && S.data.photos ? S.data.photos.length : 0
  }

  function renderMessages() {
    let h = ''
    if (S.error) h += `<div class="message error" role="alert">${icon('alert', 18)}<span>${esc(S.error)}</span><button data-close="error" aria-label="오류 닫기">×</button></div>`
    if (S.success) h += `<div class="message success" role="status">${icon('ok', 18)}<span>${esc(S.success)}</span><button data-close="success" aria-label="알림 닫기">×</button></div>`
    if (!S.data) h += `<div class="message">${icon('loader', 18, 'animate-spin')}<span>작업실 정보를 불러오는 중입니다. 오류가 보이면 새로고침하세요.</span><button class="btn outline" data-refresh>새로고침</button></div>`
    $('msg-area').innerHTML = h
  }

  function renderCreate() {
    const n = S.data
    const miss = missing()
    const ready = !!n && miss.length === 0
    const act = activeJob()
    const kw = $('keywords').value.trim()
    const I = currentJob()

    $('setup-banner').innerHTML = !ready && n ? `<div class="setup-banner"><div>${icon('shield', 22)}<div>
      <strong>제작 전 ${miss.length}개 항목을 완료해 주세요</strong>
      <p>${n.settings.consent ? '아바타 사용 동의는 저장되었습니다. 아래 제작 버튼 위에 남은 항목을 표시했습니다.' : '아래 제작 버튼 위에서 필요한 항목을 확인하세요.'}</p></div></div></div>` : ''

    const consent = n && n.settings.consent
    $('presenter-tag').className = consent ? 'tag green' : 'tag'
    $('presenter-tag').textContent = consent ? '사용 동의 저장 완료' : '본인·동의 확인 전'

    if (n) {
      const title = act ? '진행 중인 제작이 있습니다' : miss.length || kw.length < 2 ? '제작을 시작하려면' : '제작 준비 완료'
      let h = `<div class="creation-readiness" aria-live="polite"><div class="between"><strong>${title}</strong><button class="btn ghost sm" data-refresh>상태 새로고침</button></div>`
      miss.forEach((m) => { h += `<div class="readiness-item"><span>${esc(m.label)}</span><button class="btn outline sm" data-goto="${m.tab}">${esc(m.action)}</button></div>` })
      const pending = n.sources.filter((x) => !x.approved && !x.builtin).length
      if (pending) h += `<div class="readiness-item"><span>승인 대기 자료 ${pending}개는 제작에 쓰이지 않습니다. 자료실에서 ‘영상 제작 근거로 사용’을 체크해 주세요.</span><button class="btn outline sm" data-goto="knowledge">자료실 열기</button></div>`
      if (kw.length < 2) h += `<div class="readiness-item"><span>영상 주제 키워드를 2자 이상 입력해 주세요.</span><button class="btn outline sm" data-focus-keywords>키워드 입력</button></div>`
      if (act) h += `<div class="readiness-item"><span>현재 작업이 끝난 뒤 새 영상을 시작할 수 있습니다.</span><button class="btn outline sm" data-goto="history">제작 이력</button></div>`
      $('readiness').innerHTML = h + '</div>'
    } else $('readiness').innerHTML = ''

    const btn = $('create-btn')
    btn.disabled = S.busy || !ready || !!act || kw.length < 2
    btn.innerHTML = `${S.busy ? icon('loader', 18, 'animate-spin') : icon('sparkles', 18)} ${act ? '영상 제작 진행 중' : '자동 영상 제작 시작'}${icon('arrow', 18)}`

    $('pipeline-steps').innerHTML = PIPELINE.map(([t, d, from, to], i) => {
      const done = I && (I.step >= to || I.status === 'rendered')
      const on = I && ACTIVE.includes(I.status) && I.step >= from && I.step < to
      return `<div class="pipeline-step ${done ? 'done' : ''} ${on ? 'active' : ''}">
        <span class="step-index">${done ? icon('check', 17) : on ? icon('loader', 16, 'animate-spin') : String(i + 1).padStart(2, '0')}</span>
        <div><h3>${t}</h3><p>${d}</p><small>${done ? '진행 완료' : on ? '처리 중' : '대기'}</small></div></div>`
    }).join('')

    $('result-tag').hidden = !I
    if (I) $('result-tag').textContent = STATUS[I.status] || I.status
    $('result-body').innerHTML = I ? jobHtml(I) : `<div class="empty-result">${icon('film', 30)}<h3>첫 번째 영상을 기다리고 있습니다</h3><p>실제 제작 결과와 검수 기록만 표시합니다. 예시 영상이나 가짜 통과 결과는 생성하지 않습니다.</p></div>`
  }

  function reviewHtml(name, r) {
    const tag = r ? (passes(r) ? '<span class="tag green">AI 통과</span>' : '<span class="tag">미통과</span>') : '<span class="tag">미실행</span>'
    let body = '<p>실제 API 검수가 끝나면 결과가 표시됩니다.</p>'
    if (r) {
      body = `<div class="score-row">${[['근거', r.grounding], ['브랜드', r.brand], ['전달', r.clarity], ['제작', r.production]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>`
      if (r.issues.length) body += `<ul>${r.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    }
    return `<div class="review-card"><div class="between"><strong>${name}</strong>${tag}</div>${body}</div>`
  }

  // ── 사진 주소 캐시 (1시간짜리 주소를 50분 동안 재사용) ──
  const urlCache = {}
  const vidCache = {}
  let urlPending = new Set(), urlTimer = null
  function photoUrl(id) {
    if (!id) return ''
    const c = urlCache[id]
    if (c && c.exp > Date.now()) return c.url
    if (!urlPending.has(id)) { urlPending.add(id); clearTimeout(urlTimer); urlTimer = setTimeout(fetchUrls, 50) }
    return ''
  }
  async function fetchUrls() {
    const ids = [...urlPending]; urlPending = new Set()
    if (!ids.length) return
    try {
      const r = await api({ action: 'photoUrls', ids })
      for (const id of ids) {
        urlCache[id] = { url: r.urls[id] || '', exp: Date.now() + 50 * 60000 }
        if (r.videos && r.videos[id]) vidCache[id] = r.videos[id]
      }
      renderCreate(); renderHistory(); renderPhotos()
      if (!$('preview-modal').hidden) drawPreview()
    } catch (e) { /* 다음 렌더링 때 다시 시도 */ }
  }
  // 컷에서 실제로 움직이는 영상 주소 (AI 영상 > 자동 움직임 클립 > 자료실 영상)
  function cutVideo(c) {
    const clip = c.aiVideoPath || c.clipPath
    if (clip) { photoUrl('clip:' + clip); return vidCache['clip:' + clip] || '' }
    const p = photoOf(c.photoId)
    if (p && p.kind === 'video') { photoUrl(p.id); return vidCache[p.id] || '' }
    return ''
  }
  const photoOf = (id) => (id ? (S.data && S.data.photos || []).find((x) => x.id === id) : null)
  function cutVisual(c, s) {
    const v = cutVideo(c)
    if (v) return `<video src="${esc(v)}" muted loop playsinline autoplay preload="metadata"></video><span class="cut-badge">${c.aiVideoPath ? 'AI 영상' : c.clipPath ? '움직임' : '영상'}</span>`
    if (c.videoPrompt && !c.aiVideoPath && !c.videoFailed) return `<div class="cut-ph ai">AI 영상<br>생성 예정</div>`
    const id = c.photoId || c.aiPhotoId
    if (id) { const u = photoUrl(id); return u ? `<img src="${esc(u)}" alt="" loading="lazy">` : '<div class="cut-ph">사진 불러오는 중</div>' }
    if (c.imagePrompt && !c.imageFailed) return `<div class="cut-ph ai">AI 이미지<br>생성 예정</div>`
    return `<div class="cut-ph brand">${esc(s.onScreen || '아파트스퀘어')}</div>`
  }
  function cutLabel(c) {
    const p = (S.data.photos || []).find((x) => x.id === (c.photoId || c.aiPhotoId))
    if (c.aiVideoPath) return `AI 영상 (Sora) · ${esc(c.videoPrompt)}`
    if (c.videoPrompt && !c.videoFailed) return `AI 영상 생성 예정 · ${esc(c.videoPrompt)}`
    const mv = c.clipPath ? ' · 자동 움직임' : ''
    if (c.videoFailed && c.videoPrompt) return `AI 영상 실패 → ${c.aiPhotoId ? 'AI 이미지' : c.photoId ? '자료실 사진' : '대체 화면'}${mv} · ${esc(c.videoPrompt)}`
    if (p && p.kind === 'video') return `영상 자료실 · ${esc(p.desc || c.photoId)}`
    if (c.photoId && mv) return `사진 자료실${mv} · ${esc((p && p.desc) || c.photoId)}`
    if (c.aiPhotoId && mv) return `AI 생성 이미지${mv} · ${esc(c.imagePrompt)}`
    if (c.photoId) return `사진 자료실 · ${esc((p && p.desc) || c.photoId)}`
    if (c.aiPhotoId) return `AI 생성 이미지 · ${esc(c.imagePrompt)}`
    if (c.imagePrompt) return `${c.imageFailed ? 'AI 이미지 생성 실패 → 브랜드 카드' : 'AI 이미지 생성 예정'} · ${esc(c.imagePrompt)}`
    return '브랜드 카드 (브랜드북 기준)'
  }
  function cutsHtml(s) {
    const cuts = s.cuts && s.cuts.length ? s.cuts : [{ narration: s.narration, photoId: '', imagePrompt: '' }]
    return `<div class="cut-list">${cuts.map((c, j) => `<div class="cut"><div class="cut-thumb">${cutVisual(c, s)}</div><div><span class="cut-no">컷 ${j + 1}</span><p>${esc(c.narration)}</p><small>${cutLabel(c)}</small></div></div>`).join('')}</div>`
  }

  // 검수 보류·제작 대기: 프롬프트를 직접 고쳐 다시 검수하거나, 검수 없이 제작 대기로 넘긴다
  const editDraft = {}
  function editBoxHtml(e) {
    const held = e.status === 'held'
    const v = editDraft[e.id] != null ? editDraft[e.id] : e.prompt
    return `<details class="edit-box" ${held || editDraft[e.id] != null ? 'open' : ''} data-edit-box="${e.id}"><summary>${icon('edit', 16)}프롬프트 직접 수정${held ? ' — 지적 사항을 보고 고쳐 주세요' : ''}</summary>
      <p>HeyGen에 그대로 전달되는 글입니다. ‘대사:’ 줄이 아바타가 읽는 말이고, [화면 규칙] 등은 화면 지시입니다. 금지어가 있으면 저장되지 않습니다.</p>
      <textarea class="textarea edit-prompt" data-edit-text="${e.id}" rows="16">${esc(v)}</textarea>
      <div class="job-actions"><button type="button" class="btn" data-edit-review="${e.id}">수정본 다시 검수 (Claude·OpenAI 1회, 소액)</button>
        <button type="button" class="btn outline" data-edit-skip="${e.id}">검수 없이 제작 대기로</button>
        ${editDraft[e.id] != null ? `<button type="button" class="text-link" data-edit-reset="${e.id}">수정 취소</button>` : ''}</div></details>`
  }
  function jobHtml(e) {
    let h = `<div class="job-result"><div class="between"><div><h3>${esc((e.plan && e.plan.title) || e.input.keywords)}</h3>
      <p>${esc(e.input.audience)} · 목표 ${e.input.seconds}초 · ${e.input.ratio} · 수정 ${e.revision}/2회</p></div><span class="tag">${STATUS[e.status] || esc(e.status)}</span></div>`
    if (e.error) h += `<div class="message error">${icon('shield', 18)}${esc(e.error)}</div>`
    const canEdit = ['held', 'ready'].includes(e.status) && e.plan && e.prompt && S.settings.heygenMode !== 'scenes'
    if (canEdit) h += editBoxHtml(e)
    if (e.status === 'ready' && e.prompt) {
      h += `<div class="approve-box"><strong>${icon('shield', 18)}검수 완료 — 아래 프롬프트를 확인하세요</strong>
        <p>${e.skippedReview ? '<b>검수 없이 넘긴 직접 수정본입니다.</b> ' : e.edited ? '직접 수정한 프롬프트가 ' : ''}${e.skippedReview ? '' : 'Claude·OpenAI 검수를 통과했습니다. '} 프롬프트와 무료 미리보기를 확인한 뒤 ‘영상 제작 시작’을 누르면 그때 HeyGen 크레딧이 쓰입니다. 마음에 들지 않으면 제작하지 말고 키워드를 바꿔 다시 만드세요(대본·검수 비용만 듭니다).</p>
        <pre class="approve-prompt">${esc(e.prompt)}</pre>
        <div class="job-actions"><button type="button" class="btn outline" data-copy-prompt="${e.id}">${icon('copy', 14)}프롬프트 복사</button><button type="button" class="btn outline" data-preview="${e.id}">▶ 무료 미리보기</button><button type="button" class="btn" data-render="${e.id}">영상 제작 시작 (HeyGen 크레딧 사용)</button></div></div>`
    } else if (e.plan) h += `<div class="job-actions"><button type="button" class="btn outline" data-preview="${e.id}">▶ 무료 미리보기</button></div>`
    if (e.plan && e.plan.blockers && e.plan.blockers.length) {
      h += `<div class="issue-box"><strong>대본 작성 중단 사유 (AI가 근거 부족으로 쓰지 못한 부분)</strong><ul>${e.plan.blockers.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p>이 내용을 뒷받침하는 확정 자료(서비스 소개서·시방서·실제 사례 등)를 브랜드 자료실에 올리고 ‘영상 제작 근거로 사용’을 체크한 뒤 다시 제작해 주세요.</p></div>`
    }
    if (e.issues && e.issues.length) h += `<details ${['held', 'revising'].includes(e.status) ? 'open' : ''}><summary>검수 지적 사항 · ${e.issues.length}건</summary><ul class="issue-list">${e.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`
    if (e.videoUrl) {
      h += `<div class="video-output"><video controls playsinline preload="metadata" src="${esc(e.videoUrl)}"></video>
        <div class="between"><span>실제 길이 ${e.actualSeconds || '미확인'}초</span><a href="${esc(e.videoUrl)}" target="_blank" rel="noreferrer">영상 열기 ${icon('external', 14)}</a></div>
        <p class="fineprint">AI 아바타 생성 영상 · 화면·발음·자막의 최종 품질은 자동 검증되지 않았습니다. 영상 주소는 만료될 수 있습니다.</p></div>`
    }
    h += `<div class="reviews-grid">${reviewHtml('Claude', e.claude)}${reviewHtml('OpenAI', e.openai)}</div>`
    if (e.plan) {
      h += `<details open><summary>최종 대본 · 장면 구성</summary><div class="scene-list">${e.plan.scenes.map((s, i) => `<div>
        <span class="scene-label">SCENE ${String(i + 1).padStart(2, '0')} <small>${s.seconds}초</small></span>
        <h4>${esc(s.onScreen)}</h4>${cutsHtml(s)}<small>화면: ${esc(s.visual)}</small>
        <details><summary>원문 근거 ${s.citations.length}개</summary>${s.citations.map((c) => `<blockquote>
          <b>${esc((e.sources.find((x) => x.id === c.sourceId) || {}).title || '출처 확인 필요')}</b><p>${esc(c.quote)}</p><small>${esc(c.claim)}</small></blockquote>`).join('')}</details>
      </div>`).join('')}</div></details>`
    }
    if (e.prompt) {
      h += `<details><summary>HeyGen에 전달하는 실제 프롬프트</summary><button class="btn outline" data-copy-prompt="${e.id}">${icon('copy', 14)}복사</button><pre>${esc(e.prompt)}</pre></details>`
    }
    h += `<details><summary>제작 기록 · ${e.events.length}건</summary><ol class="event-list">${e.events.map((x) => `<li><time>${fmt(x.time)}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>
      <small>프롬프트 ${esc(e.promptVersion)} · Claude ${esc(e.models.claude)} · OpenAI ${esc(e.models.openai)}</small></details>`
    h += usageHtml(e.usage, e.models)
    if (e.memory.length) h += `<details><summary>이번 제작에 참고한 누적 패턴</summary>${e.memory.map((m) => `<p>${esc(m)}</p>`).join('')}</details>`
    return h + '</div>'
  }

  const n0 = (x) => Number(x || 0).toLocaleString()
  function usageHtml(u, models) {
    if (!u || (!u.claude && !u.openai && !u.heygen && !u.image && !u.video)) return ''
    const row = (name, v, extra) => `<div><span>${name}</span><b>${extra}</b><small>${v ? `입력 ${n0(v.input)} · 출력 ${n0(v.output)} 토큰 · ${v.calls}회` : ''}</small></div>`
    let h = '<details open><summary>사용량 (크레딧)</summary><div class="usage-grid">'
    if (u.claude) h += row(`Claude <small>${esc(models.claude)}</small>`, u.claude, u.claude.usd != null ? `약 $${u.claude.usd.toFixed(3)}` : '요금표 없는 모델')
    if (u.openai) h += row(`OpenAI 검수 <small>${esc(models.openai)}</small>`, u.openai, '토큰 기준')
    if (u.image) h += row('OpenAI 이미지 생성', u.image, `${u.image.calls}장 생성`)
    if (u.video) h += `<div><span>AI 영상 (Sora)</span><b>약 $${(u.video.usd || 0).toFixed(2)}</b><small>${u.video.calls}개 · 총 ${u.video.seconds}초 (공개 요금 기준 예상치)</small></div>`
    if (u.heygen) h += `<div><span>HeyGen</span><b>${u.heygen.used != null ? n0(u.heygen.used) + ' 크레딧' : '측정 중'}</b><small>${u.heygen.before != null ? `제작 전 ${n0(u.heygen.before)} → 후 ${u.heygen.after != null ? n0(u.heygen.after) : '…'}` : '잔액 조회 불가'}</small></div>`
    return h + '</div><p class="fineprint">Claude 금액은 공개 요금표 기준 예상치입니다(부가세·할인 제외). OpenAI 금액은 모델별 요금이 달라 토큰만 표시합니다. HeyGen은 제작 전후 잔액 차이라 같은 시간에 다른 사용이 있으면 함께 잡힙니다.</p></details>'
  }
  function renderKnowledge() {
    const n = S.data
    const srcs = (n && n.sources) || []
    $('src-count').textContent = srcs.length
    $('src-approved').textContent = `승인 ${srcs.filter((s) => s.approved === 1).length}개`
    $('learning-count').textContent = (n && n.learningCount) || 0
    const T = n && n.terms
    $('terms-card').hidden = !T
    if (T) {
      $('terms-card').innerHTML = `${icon('book', 20)}<h3>공사 용어 사전 · 브랜드북 규칙 · 자동 적용</h3>
        <p>동의어 ${T.synonyms.length}묶음 · 표기 통일 ${T.spelling.length}개 · 금지어 ${T.banned.length}개. 자료 검색에서 같은 뜻의 말을 함께 찾고, 대본에 금지어나 틀린 표기가 있으면 검수에서 자동으로 고칩니다.</p>
        <details><summary>동의어 (검색에 함께 사용)</summary><ul class="terms-list">${T.synonyms.map((x) => `<li><b>${esc(x.canonical)}</b> = ${x.terms.map(esc).join(', ')}</li>`).join('')}</ul></details>
        <details><summary>표기 통일</summary><ul class="terms-list">${T.spelling.map((x) => `<li>${esc(x.wrong)} → <b>${esc(x.right)}</b> <small>${esc(x.why)}</small></li>`).join('')}</ul></details>
        <details><summary>금지어</summary><ul class="terms-list">${T.banned.map((x) => `<li><b>${esc(x.word)}</b> — ${esc(x.why)}${x.instead ? ` <small>(대신: ${esc(x.instead)})</small>` : ''}</li>`).join('')}</ul></details>
        ${T.brand ? `<details><summary>브랜드북 규칙 (대본 작성·검수에 적용)</summary><ul class="terms-list">${T.brand.rules.map((r) => `<li>${esc(r)}</li>`).join('')}<li>${esc(T.brand.visual)}</li></ul></details>` : ''}
        <small>${esc(T.source)}</small>`
    }
    $('sources-list').innerHTML = srcs.length ? srcs.map((s) => `<article class="source-card">
        <div class="between"><h3>${esc(s.title)}${s.builtin ? ' <span class="tag">기본 제공</span>' : ''}</h3><span class="${s.approved ? 'tag green' : 'tag warn'}">${s.approved ? '사용 중' : '승인 대기 · 제작에 안 쓰임'}</span></div>
        <p class="source-meta">${esc(s.provenance)}</p>
        ${s.file ? `<button type="button" class="text-link file-link" data-file="${s.id}">${icon('external', 14)}원본 파일 열기 (${esc(s.file.name)})</button>` : ''}
        <details><summary>본문 확인</summary><pre>${esc(s.content)}</pre></details>
        <div class="check-row"><input type="checkbox" data-slot="checkbox" id="src-${s.id}" data-approve="${s.id}" ${s.approved === 1 ? 'checked' : ''} ${S.busy ? 'disabled' : ''}><label for="src-${s.id}">영상 제작 근거로 사용</label></div>
      </article>`).join('')
      : `<div class="empty-result small">${icon('library', 28)}<h3>아직 등록된 자료가 없습니다</h3><p>서비스 소개서, 시방서, 검증된 현장사례를 등록하면 다음 제작부터 검색합니다.</p></div>`
    updateSourceSave()
  }
  function updateSourceSave() {
    $('source-save').disabled = S.busy || $('source-content').value.length < 30 || !$('source-title').value || !$('source-origin').value
  }

  function renderUsageTotal() {
    const t = S.data && S.data.usageTotal
    if (!t) { $('usage-total').innerHTML = ''; return }
    $('usage-total').innerHTML = `<div class="usage-total"><div><span>Claude 누적</span><b>약 $${t.claude.usd.toFixed(2)}</b><small>입력 ${n0(t.claude.input)} · 출력 ${n0(t.claude.output)} 토큰</small></div>
      <div><span>OpenAI 누적</span><b>${n0(t.openai.input + t.openai.output)} 토큰</b><small>입력 ${n0(t.openai.input)} · 출력 ${n0(t.openai.output)}</small></div>
      ${t.images || t.videos ? `<div><span>AI 이미지·영상 누적</span><b>${n0(t.images)}장 · ${n0(t.videos)}개</b><small>AI 영상 약 $${(t.videoUsd || 0).toFixed(2)}</small></div>` : ''}
      <div><span>HeyGen 누적 사용</span><b>${n0(t.heygen)} 크레딧</b><small>남은 크레딧: ${S.quota == null ? `<button class="text-link" data-quota>조회</button>` : n0(S.quota) + ' 크레딧'}</small></div></div>
      <p class="fineprint">최근 50개 제작 기준 합계입니다. 정확한 청구 금액은 각 서비스(Anthropic·OpenAI·HeyGen) 사용량 페이지에서 확인해 주세요.</p>`
  }
  function renderHistory() {
    renderUsageTotal()
    const n = S.data
    if (!n || !n.jobs.length) { $('history-body').innerHTML = `<div class="empty-result">${icon('history', 30)}<h3>아직 제작 이력이 없습니다</h3></div>`; return }
    const I = currentJob()
    $('history-body').innerHTML = `<div class="history-grid"><div class="history-list">${n.jobs.map((e) => `<button class="${I && I.id === e.id ? 'selected' : ''}" data-select-job="${e.id}">
        <div class="between"><span class="tag">${STATUS[e.status] || esc(e.status)}</span><small>${fmt(e.created)}</small></div>
        <strong>${esc((e.plan && e.plan.title) || e.input.keywords)}</strong><p>${esc(e.input.audience)} · ${e.input.seconds}초 · ${e.input.ratio}</p></button>`).join('')}</div>
      ${I ? jobHtml(I) : ''}</div>`
  }

  // ── 연결 설정 ──
  function buildProviders() {
    $('provider-grid').innerHTML = PROVIDERS.map(([p, label]) => `<section class="panel" data-provider="${p}">
      <div class="between"><h2>${label}</h2><span class="tag" data-p-status>연결 필요</span></div>
      <div class="field"><label for="${p}-key">API 키</label><input class="input" id="${p}-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="API 키를 여기에 붙여 넣으세요"></div>
      ${p !== 'heygen' ? `<button class="btn outline" data-p-check>연결 확인 · 모델 불러오기</button>
      <div class="field"><label for="${p}-model">사용할 모델</label><select class="select select-sm" id="${p}-model"><option value="">먼저 모델을 불러오세요</option></select>
      <small>구조화 출력이 가능한 텍스트 모델을 선택해 주세요.</small></div>` : ''}
      <div class="connection-actions"><button class="btn" data-p-save>연결 확인 후 저장</button><button class="btn outline" data-p-delete hidden>연결 삭제</button></div>
      <p class="body-note" role="status" data-p-ok hidden></p><p class="message error" role="alert" data-p-err hidden></p>
    </section>`).join('')
    PROVIDERS.forEach(([p]) => { S.providerUi[p] = { models: [], busy: false, ok: '', err: '', model: '' } })
    $('provider-grid').addEventListener('input', (ev) => {
      const box = ev.target.closest('[data-provider]'); if (!box) return
      const u = S.providerUi[box.dataset.provider]
      if (ev.target.id.endsWith('-key')) { u.models = []; u.ok = ''; fillModels(box.dataset.provider) }
      renderProviders()
    })
    $('provider-grid').addEventListener('change', (ev) => {
      if (!ev.target.id.endsWith('-model')) return
      S.providerUi[ev.target.id.split('-')[0]].model = ev.target.value; renderProviders()
    })
    $('provider-grid').addEventListener('click', (ev) => {
      const box = ev.target.closest('[data-provider]'); if (!box) return
      const p = box.dataset.provider
      if (ev.target.closest('[data-p-check]')) providerConnect(p, false)
      if (ev.target.closest('[data-p-save]')) providerConnect(p, true)
      if (ev.target.closest('[data-p-delete]')) providerDisconnect(p)
    })
  }
  function fillModels(p) {
    const sel = $(p + '-model'); if (!sel) return
    const u = S.providerUi[p]
    const list = u.models.length ? u.models : u.model ? [{ id: u.model, name: u.model }] : []
    sel.innerHTML = list.length ? list.map((m) => `<option value="${esc(m.id)}" ${m.id === u.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('') : '<option value="">먼저 모델을 불러오세요</option>'
    if (list.length && !list.some((m) => m.id === u.model)) { sel.value = ''; sel.insertAdjacentHTML('afterbegin', '<option value="" selected>모델을 선택하세요</option>') }
  }
  function renderProviders() {
    PROVIDERS.forEach(([p]) => {
      const box = document.querySelector(`[data-provider="${p}"]`); if (!box) return
      const st = S.data && S.data.connections && S.data.connections[p]
      const u = S.providerUi[p]
      const key = $(p + '-key').value
      const tag = box.querySelector('[data-p-status]')
      tag.className = st && st.checkedAt ? 'tag green' : 'tag'
      tag.textContent = st && st.checkedAt ? '인증 확인 · 저장됨' : st && st.configured ? '키 설정됨' : '연결 필요'
      $(p + '-key').placeholder = st && st.configured ? '저장됨 · 변경할 때만 새 키 입력' : 'API 키를 여기에 붙여 넣으세요'
      const check = box.querySelector('[data-p-check]')
      if (check) { check.disabled = u.busy || (!key && !(st && st.configured)); check.textContent = u.busy ? '확인 중…' : '연결 확인 · 모델 불러오기' }
      const save = box.querySelector('[data-p-save]')
      save.disabled = u.busy || (!key && !(st && st.configured)) || (p !== 'heygen' && !u.model)
      save.textContent = u.busy ? '연결 확인 중…' : '연결 확인 후 저장'
      const del = box.querySelector('[data-p-delete]')
      del.hidden = !(st && st.configured); del.disabled = u.busy
      const ok = box.querySelector('[data-p-ok]'); ok.hidden = !u.ok; ok.textContent = u.ok
      const err = box.querySelector('[data-p-err]'); err.hidden = !u.err; err.textContent = u.err
    })
  }
  async function providerConnect(p, save) {
    const u = S.providerUi[p]
    u.busy = true; u.ok = ''; u.err = ''; renderProviders()
    try {
      const out = await api({ action: 'connection', provider: p, key: $(p + '-key').value, model: save ? u.model : '', save })
      if (save) {
        $(p + '-key').value = ''
        u.ok = '연결 확인 및 암호화 저장 완료. 실제 생성 가능 여부는 제작 시 확인됩니다.'
        await load()
      } else {
        u.models = out.models; fillModels(p)
        u.ok = 'API 인증 확인 완료. 사용할 모델을 선택하고 저장해 주세요.'
      }
    } catch (e) { u.err = e.message } finally { u.busy = false; renderProviders() }
  }
  async function providerDisconnect(p) {
    const u = S.providerUi[p]
    u.busy = true; u.err = ''; renderProviders()
    try {
      await api({ action: 'disconnect', provider: p })
      $(p + '-key').value = ''; u.model = ''; u.models = []; fillModels(p)
      u.ok = '저장한 API 연결을 삭제했습니다.'
      await load()
    } catch (e) { u.err = e.message } finally { u.busy = false; renderProviders() }
  }

  function syncSettingsForm() {
    $('image-model').value = S.settings.imageModel || 'gpt-image-1'
    $('motion').checked = S.settings.motion !== false
    $('heygen-mode').value = S.settings.heygenMode === 'scenes' ? 'scenes' : 'agent'
    $('ai-video').checked = S.settings.aiVideo !== false
    $('video-model').value = S.settings.videoModel || 'sora-2'
    $('max-ai-videos').value = S.settings.maxAiVideos != null ? S.settings.maxAiVideos : 2
    $('voice-id').value = S.settings.voiceId || ''
    $('avatar-confirm').checked = !!S.settings.consent
    $('daily-limit').value = S.settings.maxDailyJobs
    if (S.data) PROVIDERS.forEach(([p]) => {
      const m = S.data.connections[p] && S.data.connections[p].model
      if (m && !S.providerUi[p].models.length) { S.providerUi[p].model = m; fillModels(p) }
    })
  }
  function renderSettings() {
    renderProviders()
    const heygen = !!(S.data && S.data.readiness.heygen)
    $('avatar-load').disabled = S.settingsBusy || !heygen
    $('avatar-load').textContent = S.settingsBusy ? '불러오는 중…' : '내 HeyGen 아바타 불러오기'
    $('avatar-need-key').hidden = heygen
    $('avatar-empty').hidden = !(S.avatarsLoaded && !S.avatars.length)
    $('avatar-grid').innerHTML = S.avatars.map((a) => `<button type="button" class="avatar-choice ${S.settings.avatarId === a.id ? 'chosen' : ''}" data-avatar="${esc(a.id)}" ${a.status !== 'completed' ? 'disabled' : ''}>
        ${a.preview ? `<img src="${esc(a.preview)}" alt="${esc(a.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="avatar-placeholder">미리보기 없음</div>'}
        <strong>${esc(a.name)}</strong><small>${a.status === 'completed' ? (S.settings.avatarId === a.id ? '선택됨' : '선택하기') : 'HeyGen 준비 중'}</small></button>`).join('')
    $('avatar-more').hidden = !S.nextToken
    $('avatar-more').disabled = S.settingsBusy
    const sel = S.settings.avatarId
    $('avatar-selected').hidden = !sel
    if (sel) $('avatar-selected').textContent = '선택된 아바타: ' + ((S.avatars.find((a) => a.id === sel) || {}).name || sel)
    $('settings-save').disabled = S.settingsBusy || !S.settings.avatarId || !S.settings.voiceId || !heygen
  }
  async function loadAvatars(more) {
    S.settingsBusy = true; $('settings-err').hidden = true; renderSettings()
    try {
      const t = await api({ action: 'avatars', token: more ? S.nextToken : '' })
      S.avatars = more ? [...S.avatars, ...t.avatars.filter((a) => !S.avatars.some((b) => b.id === a.id))] : t.avatars
      S.nextToken = t.nextToken; S.avatarsLoaded = true
    } catch (e) { $('settings-err').textContent = e.message; $('settings-err').hidden = false } finally { S.settingsBusy = false; renderSettings() }
  }
  async function saveSettings() {
    S.settingsBusy = true; $('settings-err').hidden = true; $('settings-ok').hidden = true; renderSettings()
    try {
      S.data = await api({ action: 'settings', settings: S.settings })
      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }
      syncSettingsForm()
      $('settings-ok').textContent = '기존 HeyGen 아바타와 음성 설정을 저장했습니다.'; $('settings-ok').hidden = false
    } catch (e) { $('settings-err').textContent = e.message; $('settings-err').hidden = false } finally { S.settingsBusy = false; renderAll() }
  }

  // ── 진행 중 작업 자동 진행 (원본: 0.7초 후 시작, 1.2초 간격, 렌더링 단계는 15초 간격) ──
  let pollTimer = null, advancing = false
  function ensurePolling() {
    if (pollTimer || advancing) return
    if (activeJob()) pollTimer = setTimeout(tick, 700)
  }
  async function tick() {
    pollTimer = null
    const job = activeJob()
    if (!job) return
    advancing = true
    try {
      const t = await api({ action: 'advance', id: job.id })
      S.data.jobs = S.data.jobs.map((j) => (j.id === t.job.id ? t.job : j))
      if (t.job.status === 'rendered') S.data.learningCount = S.data.jobs.filter((j) => j.status === 'rendered').length
      S.error = ''
    } catch (e) { S.error = e.message }
    advancing = false
    const next = activeJob()
    if (next) pollTimer = setTimeout(tick, next.status === 'rendering' ? 15000 : 1200)
    renderAll()
  }

  function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  async function createJob() {
    S.busy = true; S.error = ''; S.success = ''; renderAll()
    try {
      S.requestId = S.requestId || newRequestId()
      const e = await api({
        action: 'create', requestId: S.requestId,
        input: { keywords: $('keywords').value, audience: $('audience').value, seconds: Number($('seconds').value), ratio: $('ratio').value },
      })
      S.data.jobs = [e.job, ...S.data.jobs.filter((j) => j.id !== e.job.id)]
      S.selectedId = e.job.id
      S.requestId = null
    } catch (e) { S.error = e.message } finally { S.busy = false; renderAll() }
  }

  // ── 사진 자료실 ──
  function renderPhotos() {
    const list = (S.data && S.data.photos) || []
    $('photo-count').textContent = list.length
    $('photo-ai-count').textContent = `영상 ${list.filter((p) => p.kind === 'video').length}개 · AI 생성 ${list.filter((p) => p.source === 'ai').length}장`
    $('photo-grid').innerHTML = list.length ? list.map((p) => { const u = photoUrl(p.id); return `<div class="photo-card">
        <div class="photo-img">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : '<div class="cut-ph">불러오는 중</div>'}${p.kind === 'video' ? `<span class="vid-badge">▶ ${p.duration || '?'}초</span>` : ''}${p.source === 'ai' ? '<span class="tag">AI 생성</span>' : ''}</div>
        <textarea class="textarea photo-desc" data-desc="${p.id}" rows="3" placeholder="사진 설명 (AI 가 컷을 고를 때 사용)">${esc(p.desc)}</textarea>
        <div class="between"><button type="button" class="btn outline sm" data-desc-save="${p.id}">설명 저장</button><button type="button" class="text-link" data-photo-del="${p.id}">삭제</button></div>
      </div>` }).join('') : `<div class="empty-result small">${icon('image', 28)}<h3>아직 등록된 사진이 없습니다</h3><p>현장 사진·드론 촬영·전후 비교·앱 화면·서류 사진을 올려 주세요. 사진이 없으면 필요한 컷을 AI 이미지로 만듭니다.</p></div>`
  }
  function toJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        if (Math.min(img.width, img.height) < 300) { URL.revokeObjectURL(img.src); reject(Object.assign(new Error('작은 이미지'), { small: true })); return }
        const k = Math.min(1, 1920 / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('사진 변환 실패'))), 'image/jpeg', 0.88)
        URL.revokeObjectURL(img.src)
      }
      img.onerror = () => reject(new Error('사진을 읽지 못했습니다'))
      img.src = URL.createObjectURL(file)
    })
  }
  // 폴더·zip·여러 파일 → 사진만 골라 올린다 (3장씩 동시에)
  const IMG_NAME = /\.(jpe?g|jfif|jpe|pjpeg|png|webp|gif|bmp|avif)$/i
  const CONVERT = { heic: 'heic', heif: 'heic', tif: 'tiff', tiff: 'tiff', dng: 'raw', cr2: 'raw', cr3: 'raw', nef: 'raw', arw: 'raw', rw2: 'raw', orf: 'raw', raf: 'raw', srw: 'raw', pef: 'raw' }
  const DOCS = /\.(pptx|docx|xlsx|hwpx)$/i
  const VID_NAME = /\.(mp4|mov|m4v|webm)$/i
  const VID_MAX = 50 * 1048576
  async function collectImages(files) {
    const skip = { notImage: 0, dup: 0, hidden: 0, exts: {} }
    const out = []
    const seen = new Set(((S.data && S.data.photos) || []).map((p) => `${p.name}|${p.size || ''}`))
    const push = (f) => { const key = `${f.name}|${f.size}`; if (seen.has(key)) { skip.dup++; return } seen.add(key); out.push(f) }
    for (const f of files) {
      const name = f.name || ''
      const path = f.webkitRelativePath || f._path || name
      const e = (name.match(/\.([^.]+)$/) || [])[1]
      const ext = e ? e.toLowerCase() : '(확장자 없음)'
      if (name.startsWith('.') || path.includes('__MACOSX') || /(^|\/)\./.test(path) || /^thumbs\.db$/i.test(name)) { skip.hidden++; continue }
      try {
        if (ext === 'zip') { for (const z of await window.StudioExtract.zipImages(f)) files.push(z); continue }
        if (DOCS.test(name)) { for (const z of await window.StudioExtract.docImages(f)) push(z); continue }
      } catch (err) { skip.notImage++; skip.exts[ext + '(열 수 없음)'] = (skip.exts[ext + '(열 수 없음)'] || 0) + 1; continue }
      if (CONVERT[ext]) { f._convert = CONVERT[ext]; push(f); continue }
      if (VID_NAME.test(name) || /^video\//.test(f.type)) {
        if (f.size > VID_MAX) { skip.bigVideo = (skip.bigVideo || 0) + 1; continue }
        f._video = true; push(f); continue
      }
      if (!IMG_NAME.test(name) && !/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(f.type)) { skip.notImage++; skip.exts[ext] = (skip.exts[ext] || 0) + 1; continue }
      push(f)
    }
    return { images: out, skip }
  }
  // 변환이 필요한 형식(HEIC·TIFF·RAW)을 브라우저가 여는 사진으로 바꾼다
  async function toOpenable(f) {
    const X = window.StudioExtract
    if (f._convert === 'heic') return X.heicToJpeg(f)
    if (f._convert === 'tiff') return X.tiffToJpeg(f)
    if (f._convert === 'raw') return X.rawPreview(f)
    return f
  }
  // 끌어다 놓은 폴더를 하위 폴더까지 읽는다
  async function filesFromDrop(dt) {
    const items = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean)
    if (!items.length) return [...(dt.files || [])]
    const out = []
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const f = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null)
        if (f) { f._path = prefix + f.name; out.push(f) }
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        let batch
        do {
          batch = await new Promise((res) => reader.readEntries(res, () => res([])))
          for (const e of batch) await walk(e, prefix + entry.name + '/')
        } while (batch.length)
      }
    }
    for (const e of items) await walk(e, '')
    return out
  }
  // ── 업로드 대기열: 고르는 즉시 시작, 올리는 중에 더 고르면 뒤에 이어 붙는다 (3장씩 동시에) ──
  const newSkip = () => ({ notImage: 0, dup: 0, hidden: 0, small: 0, bigVideo: 0, longVideo: 0, exts: {} })
  const UP = { queue: [], total: 0, ok: 0, fail: 0, skip: newSkip(), errors: [], current: new Set(), running: 0, open: false, scanning: false }
  const skipText = () => {
    const k = UP.skip
    const ex = Object.entries(k.exts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e, n]) => `.${e} ${n}`).join(', ')
    return [k.notImage && `사진 아님 ${k.notImage}${ex ? ` (${ex})` : ''}`, k.small && `작은 이미지 ${k.small}`, k.bigVideo && `50MB 넘는 영상 ${k.bigVideo}`, k.longVideo && `60초 넘는 영상 ${k.longVideo}`, k.dup && `이미 올린 사진 ${k.dup}`, k.hidden && `숨김 파일 ${k.hidden}`].filter(Boolean).join(' · ')
  }
  // 원인 파악용: 업로드 오류·요약을 서버에 기록 (파일 이름은 보내지 않음)
  const extOf = (n) => ((String(n).match(/\.([^.]+)$/) || [])[1] || '').toLowerCase()
  function logServer(entries) { api({ action: 'log', entries: entries.map((e) => ({ ...e, ua: navigator.userAgent })) }).catch(() => {}) }
  window.addEventListener('error', (e) => logServer([{ kind: 'js', msg: `${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}` }]))
  window.addEventListener('unhandledrejection', (e) => logServer([{ kind: 'js', msg: 'promise: ' + String((e.reason && e.reason.message) || e.reason) }]))
  function renderUpload() {
    const el = $('upload-dock')
    if (!UP.open) { el.hidden = true; return }
    el.hidden = false
    const done = UP.ok + UP.fail
    const busy = UP.running > 0 || UP.queue.length > 0
    const pct = UP.total ? Math.round((done / UP.total) * 100) : 0
    const head = UP.scanning ? `${icon('loader', 16, 'animate-spin')} 파일에서 사진을 찾는 중` : busy ? `${icon('loader', 16, 'animate-spin')} 사진 올리는 중` : UP.total ? '✓ 사진 올리기 완료' : '올릴 사진을 찾지 못했습니다'
    el.innerHTML = `<div class="between"><strong>${head}</strong>
        ${busy ? '' : '<button type="button" class="btn ghost sm" id="upload-close">닫기 ×</button>'}</div>
      <div class="up-bar"><span style="width:${pct}%"></span></div>
      <p class="up-count"><b>${done} / ${UP.total}장</b> 완료 · 성공 ${UP.ok}${UP.fail ? ` · <span class="up-fail">실패 ${UP.fail}</span>` : ''}${UP.queue.length ? ` · 대기 ${UP.queue.length}` : ''}</p>
      ${UP.current.size ? `<p class="up-now">지금: ${[...UP.current].map(esc).join(', ')} <small>(사진마다 AI 설명 작성 포함, 몇 초씩 걸립니다)</small></p>` : ''}
      ${skipText() ? `<p class="up-skip">건너뜀: ${skipText()}</p>` : ''}
      ${UP.errors.length ? `<details ${busy ? '' : 'open'}><summary>실패한 파일 ${UP.errors.length}개</summary><ul>${UP.errors.slice(-20).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}`
    const c = $('upload-close'); if (c) c.onclick = () => { UP.open = false; renderUpload() }
  }
  // 영상: 길이와 첫 화면(미리보기 JPG)을 브라우저에서 뽑는다
  function videoInfo(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video')
      const url = URL.createObjectURL(file)
      const fail = (m) => { URL.revokeObjectURL(url); reject(new Error(m)) }
      const t = setTimeout(() => fail('영상을 읽지 못했습니다 (시간 초과)'), 20000)
      v.muted = true; v.playsInline = true; v.preload = 'auto'
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 3) }
      v.onseeked = () => {
        clearTimeout(t)
        const k = Math.min(1, 1280 / Math.max(v.videoWidth || 1, v.videoHeight || 1))
        const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k) || 640; c.height = Math.round(v.videoHeight * k) || 360
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
        c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve({ duration: v.duration, thumb: b }) : reject(new Error('영상 미리보기 실패')) }, 'image/jpeg', 0.85)
      }
      v.onerror = () => { clearTimeout(t); fail('이 브라우저에서 열 수 없는 영상 형식입니다 (MP4 권장)') }
      v.src = url
    })
  }
  async function putFile(name, blob, type) {
    const up = await api({ action: 'uploadUrl', name, size: blob.size })
    const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': type, 'x-upsert': 'false' }, body: blob })
    if (!put.ok) throw new Error('저장소 업로드 실패 (HTTP ' + put.status + ')')
    return up.path
  }
  async function uploadVideo(f) {
    const info = await videoInfo(f)
    if (info.duration > 60.5) throw Object.assign(new Error('60초 넘는 영상'), { long: true })
    const ext = (extOf(f.name).match(/^(mp4|mov|m4v|webm)$/) || ['mp4'])[0]
    const thumbPath = await putFile('thumb.jpg', info.thumb, 'image/jpeg')
    const path = await putFile('video.' + ext, f, f.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4'))
    return api({ action: 'photo', path, name: f.name, size: f.size, kind: 'video', thumbPath, duration: info.duration })
  }
  async function uploadOne(f) {
    UP.current.add(f.name); renderUpload()
    try {
      if (f._video) {
        const r = await uploadVideo(f)
        S.data.photos = [r.photo, ...(S.data.photos || []).filter((x) => x.id !== r.photo.id)]
        UP.ok++; return
      }
      const blob = await toJpeg(await toOpenable(f))
      const up = await api({ action: 'uploadUrl', name: 'photo.jpg', size: blob.size })
      const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' }, body: blob })
      if (!put.ok) throw new Error('저장소 업로드 실패 (HTTP ' + put.status + ')')
      const r = await api({ action: 'photo', path: up.path, name: f.name, size: f.size })
      S.data.photos = [r.photo, ...(S.data.photos || []).filter((x) => x.id !== r.photo.id)]
      UP.ok++
    } catch (e) {
      if (/업로드 중지됨/.test(e.message)) { UP.fail++; UP.total -= UP.queue.length; UP.queue.length = 0; UP.errors.push(e.message) } else
      if (e.small) { UP.skip.small++; UP.total-- } else if (e.long) { UP.skip.longVideo++; UP.total-- } else { UP.fail++; UP.errors.push(`${f.name} — ${e.message}`); logServer([{ kind: 'fail', msg: e.message, ext: extOf(f.name) + (f._convert ? '/' + f._convert : '') }]) }
    } finally {
      UP.current.delete(f.name)
      renderUpload(); renderPhotos(); renderTabs()
    }
  }
  async function pump() {
    UP.running++
    try { while (UP.queue.length) await uploadOne(UP.queue.shift()) } finally {
      UP.running--; renderUpload()
      if (!UP.running && !UP.queue.length && UP.total) logServer([{ kind: 'done', msg: `성공 ${UP.ok} · 실패 ${UP.fail} · 작은이미지 ${UP.skip.small}` }])
    }
  }
  async function uploadPhotos(files) {
    if (!(UP.running || UP.queue.length)) { Object.assign(UP, { total: 0, ok: 0, fail: 0, errors: [], skip: newSkip() }) }
    UP.open = true; UP.scanning = true; renderUpload()
    const { images, skip } = await collectImages([...files])
    UP.scanning = false
    logServer([{ kind: 'scan', msg: `파일 ${files.length}개 → 사진 ${images.length} · 사진아님 ${skip.notImage} · 중복 ${skip.dup} · 숨김 ${skip.hidden} · 확장자 ${JSON.stringify(skip.exts).slice(0, 200)} · 받은형식 ${JSON.stringify(images.reduce((a, f) => ((a[extOf(f.name)] = (a[extOf(f.name)] || 0) + 1), a), {})).slice(0, 150)}` }])
    for (const k of ['notImage', 'dup', 'hidden', 'bigVideo']) UP.skip[k] += skip[k] || 0
    for (const [e, n] of Object.entries(skip.exts)) UP.skip.exts[e] = (UP.skip.exts[e] || 0) + n
    if (!images.length) { renderUpload(); return }
    if (images.length > 300 && !confirm(`사진 ${images.length}장을 올릴까요? 장마다 AI 설명(Claude)을 붙이므로 시간이 걸리고 소량의 비용이 듭니다.`)) { renderUpload(); return }
    UP.queue.push(...images); UP.total += images.length
    renderUpload()
    while (UP.running < 3 && UP.queue.length) pump()
  }
  window.addEventListener('beforeunload', (ev) => { if (UP.running || UP.queue.length) { ev.preventDefault(); ev.returnValue = '' } })
  $('photo-file').addEventListener('change', (ev) => { const fs = [...(ev.target.files || [])]; ev.target.value = ''; if (fs.length) uploadPhotos(fs) })
  // 폴더 선택 창은 한 번에 하나만 고를 수 있다 → 고르는 즉시 올리고, 올리는 중에 또 고르면 대기열에 이어 붙는다
  $('photo-folder').addEventListener('change', (ev) => { const fs = [...(ev.target.files || [])]; ev.target.value = ''; if (fs.length) uploadPhotos(fs) })
  ;['dragenter', 'dragover'].forEach((t) => $('photo-drop').addEventListener(t, (ev) => { ev.preventDefault(); $('photo-drop').classList.add('drag') }))
  $('photo-drop').addEventListener('dragleave', () => $('photo-drop').classList.remove('drag'))
  $('photo-drop').addEventListener('drop', async (ev) => {
    ev.preventDefault(); $('photo-drop').classList.remove('drag')
    const fs = await filesFromDrop(ev.dataTransfer)
    if (fs.length) uploadPhotos(fs)
  })
  $('photo-grid').addEventListener('click', async (ev) => {
    const sv = ev.target.closest('[data-desc-save]')
    if (sv) {
      const id = sv.dataset.descSave
      const desc = document.querySelector(`[data-desc="${id}"]`).value
      try { S.data = await api({ action: 'photoUpdate', id, desc }); S.success = '사진 설명을 저장했습니다.' } catch (e) { S.error = e.message }
      renderMessages(); return
    }
    const del = ev.target.closest('[data-photo-del]')
    if (del && confirm('이 자료를 삭제할까요? 이미 만든 영상에는 영향이 없습니다.')) {
      try { S.data = await api({ action: 'photoDelete', id: del.dataset.photoDel }); renderAll() } catch (e) { S.error = e.message; renderMessages() }
    }
  })
  $('prefs-save').addEventListener('click', async () => {
    try {
      S.data = await api({ action: 'prefs', imageModel: $('image-model').value, autoRender: false,
        motion: $('motion').checked, aiVideo: $('ai-video').checked, videoModel: $('video-model').value, maxAiVideos: $('max-ai-videos').value, heygenMode: $('heygen-mode').value })
      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }; syncSettingsForm()
      $('prefs-ok').textContent = '영상 구성 설정을 저장했습니다.'; $('prefs-ok').hidden = false
    } catch (e) { S.error = e.message; renderMessages() }
  })

  // ── 무료 미리보기: 컷 순서대로 그림·자막을 보여 주고 브라우저 음성으로 읽는다 ──
  const PV = { cuts: [], i: 0, playing: false, timer: null, ratio: '16:9' }
  function openPreview(job) {
    PV.cuts = []
    job.plan.scenes.forEach((s, si) => (s.cuts && s.cuts.length ? s.cuts : [{ narration: s.narration }]).forEach((c, ci) => PV.cuts.push({ ...c, scene: si + 1, cut: ci + 1, onScreen: s.onScreen })))
    PV.i = 0; PV.ratio = job.input.ratio; PV.playing = false; PV.agent = (job.mode || S.settings.heygenMode) !== 'scenes'
    $('preview-title').textContent = '무료 미리보기 · ' + (job.plan.title || '')
    $('preview-modal').hidden = false
    drawPreview()
  }
  function drawPreview() {
    const c = PV.cuts[PV.i]
    if (!c) return
    const id = c.photoId || c.aiPhotoId
    const u = id ? photoUrl(id) : ''
    const v = cutVideo(c)
    const kb = ['kb-in', 'kb-out', 'kb-left', 'kb-right'][PV.i % 4]
    const bg = v ? `<video class="pv-bg" src="${esc(v)}" autoplay muted loop playsinline></video>`
      : c.videoPrompt && !c.aiVideoPath && !c.videoFailed ? `<div class="pv-card ai"><small>AI 영상 생성 예정</small><p>${esc(c.videoPrompt)}</p></div>`
      : id ? (u ? `<img class="pv-bg ${S.settings.motion !== false ? 'kb ' + kb : ''}" src="${esc(u)}" alt="">` : '<div class="pv-card"><small>사진 불러오는 중</small></div>')
      : null
    const bg0 = id ? (u ? `<img class="pv-bg" src="${esc(u)}" alt="">` : '<div class="pv-card"><small>사진 불러오는 중</small></div>')
      : c.imagePrompt && !c.imageFailed ? `<div class="pv-card ai"><small>AI 이미지 생성 예정</small><p>${esc(c.imagePrompt)}</p></div>`
      : `<div class="pv-card brand"><span class="pv-label">공동주택 유지보수 전문감리기관</span><h3>${esc(c.onScreen || '아파트스퀘어')}</h3><span class="pv-logo">아파트스퀘어</span></div>`
    $('preview-stage').className = 'preview-stage ' + (PV.ratio === '9:16' ? 'vertical' : '')
    $('preview-stage').innerHTML = `${bg || bg0}<div class="pv-avatar ${id || v ? 'small' : ''}">${icon('user', 28)}<span>조현식 이사</span></div><div class="pv-sub">${esc(c.narration)}</div>`
    $('preview-pos').textContent = `장면 ${c.scene} · 컷 ${c.cut} (${PV.i + 1}/${PV.cuts.length})${PV.agent ? ' · 화면은 HeyGen 자동 구성 (여기서는 대사·순서·길이만 확인)' : ''}`
    $('preview-play').textContent = PV.playing ? '❚❚ 멈춤' : '▶ 재생'
  }
  function speakCut() {
    clearTimeout(PV.timer)
    const c = PV.cuts[PV.i]
    if (!PV.playing || !c) return
    const next = () => { if (!PV.playing) return; if (PV.i < PV.cuts.length - 1) { PV.i++; drawPreview(); speakCut() } else { PV.playing = false; drawPreview() } }
    const ms = Math.max(1500, (c.narration || '').length / 4.5 * 1000)
    if (window.speechSynthesis) {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(c.narration || '')
      u.lang = 'ko-KR'; u.rate = 1.05
      let done = false
      u.onend = () => { if (!done) { done = true; next() } }
      speechSynthesis.speak(u)
      PV.timer = setTimeout(() => { if (!done) { done = true; next() } }, ms + 4000)   // 음성이 멈춰도 넘어가도록
    } else PV.timer = setTimeout(next, ms)
  }
  function stopPreview() { PV.playing = false; clearTimeout(PV.timer); if (window.speechSynthesis) speechSynthesis.cancel() }
  $('preview-play').addEventListener('click', () => { if (PV.playing) stopPreview(); else { PV.playing = true; speakCut() } drawPreview() })
  $('preview-prev').addEventListener('click', () => { stopPreview(); PV.i = Math.max(0, PV.i - 1); drawPreview() })
  $('preview-next').addEventListener('click', () => { stopPreview(); PV.i = Math.min(PV.cuts.length - 1, PV.i + 1); drawPreview() })
  $('preview-close').addEventListener('click', () => { stopPreview(); $('preview-modal').hidden = true })

  // ── 이벤트 ──
  $('topics').innerHTML = ['외벽 재도장', '옥상 방수', '공사 전 진단'].map((t) => `<button type="button" data-topic="${t}">${icon('plus', 13)}${t}</button>`).join('')
  ;['keywords', 'audience', 'ratio', 'seconds'].forEach((id) => $(id).addEventListener('input', () => { S.requestId = null; renderCreate() }))
  $('create-btn').addEventListener('click', createJob)
  ;['source-title', 'source-origin', 'source-content'].forEach((id) => $(id).addEventListener('input', updateSourceSave))
  $('source-save').addEventListener('click', async () => {
    const ok = await act({ action: 'source', source: { title: $('source-title').value, provenance: $('source-origin').value, content: $('source-content').value, approved: $('source-approve').checked } }, '자료를 저장했습니다.')
    if (ok) { $('source-title').value = ''; $('source-origin').value = ''; $('source-content').value = ''; $('source-approve').checked = false; updateSourceSave() }
  })
  $('source-sample').addEventListener('click', () => {
    $('source-title').value = SAMPLE_SOURCE.title; $('source-origin').value = SAMPLE_SOURCE.provenance
    $('source-content').value = SAMPLE_SOURCE.content; $('source-approve').checked = false; updateSourceSave()
  })
  // ── 파일 올리기: 글자 추출 → 확인 → 원본 업로드 + 자료 등록 ──
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB')
  const today = () => new Date().toISOString().slice(0, 10)
  function queueFiles(files) {
    for (const f of files) {
      const item = { id: Math.random().toString(36).slice(2), file: f, name: f.name, status: 'reading', text: '', note: '', error: '' }
      if (f.size > 50 * 1048576) { item.status = 'error'; item.error = '50MB 를 넘는 파일은 올릴 수 없습니다.' }
      S.queue.push(item)
      $('source-approve').checked = true
      if (item.status === 'reading') {
        window.StudioExtract.extract(f).then((r) => {
          item.text = r.text.length > 300000 ? r.text.slice(0, 300000) : r.text
          item.note = [r.note, r.text.length > 300000 ? '앞 30만 자만 등록' : ''].filter(Boolean).join(' · ')
          item.status = 'ready'
        }).catch((e) => { item.status = 'error'; item.error = e.message }).finally(renderQueue)
      }
    }
    renderQueue()
  }
  function renderQueue() {
    const q = S.queue
    if (!q.length) { $('file-queue').innerHTML = ''; return }
    const ready = q.filter((x) => x.status === 'ready').length
    const label = { reading: '글자 추출 중…', ready: '등록 준비', error: '확인 필요', saving: '저장 중…', saved: '저장 완료' }
    $('file-queue').innerHTML = `<div class="file-queue">${q.map((x) => `<div class="file-item">
        <div class="between"><strong>${esc(x.name)}</strong><span class="${x.status === 'saved' ? 'tag green' : 'tag'}">${x.status === 'reading' || x.status === 'saving' ? icon('loader', 12, 'animate-spin') : ''}${label[x.status]}</span></div>
        <p class="source-meta">${fmtSize(x.file.size)}${x.text ? ` · 글자 ${x.text.length.toLocaleString()}자` : ''}${x.note ? ' · ' + esc(x.note) : ''}</p>
        ${x.error ? `<p class="file-error">${esc(x.error)}</p>` : ''}
        ${x.text ? `<details><summary>뽑은 글자 미리보기</summary><pre>${esc(x.text.slice(0, 3000))}${x.text.length > 3000 ? '\n…' : ''}</pre></details>` : ''}
        ${x.status !== 'saving' && x.status !== 'saved' ? `<button type="button" class="text-link" data-unqueue="${x.id}">목록에서 빼기</button>` : ''}
      </div>`).join('')}
      ${ready || S.busy ? `<button type="button" class="btn w-full" id="queue-save" ${!ready || S.busy ? 'disabled' : ''}>파일 ${ready}개 자료로 저장</button>
      <p class="fineprint">아래 ‘최신 내용과 외부 영상 활용 가능 여부를 확인했습니다’를 체크하고 저장하면 바로 영상 제작 근거로 사용됩니다.</p>` : ''}</div>`
  }
  async function saveQueue() {
    const approved = $('source-approve').checked
    S.busy = true; S.error = ''; S.success = ''; renderAll(); renderQueue()
    let saved = 0
    for (const x of S.queue.filter((i) => i.status === 'ready')) {
      x.status = 'saving'; renderQueue()
      try {
        // 원본 보관은 실패해도 글자(자료)는 저장한다
        let file = null
        try {
          const up = await api({ action: 'uploadUrl', name: x.name, size: x.file.size })
          const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': x.file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: x.file })
          if (!put.ok) throw new Error('HTTP ' + put.status + ' ' + (await put.text()).slice(0, 120))
          file = { path: up.path, name: x.name, size: x.file.size, type: x.file.type }
        } catch (e) { x.warn = '원본 파일 보관 실패(글자는 저장됨): ' + e.message }
        S.data = await api({
          action: 'source',
          source: {
            title: x.name.replace(/\.[^.]+$/, '').slice(0, 150) || x.name, content: x.text, approved,
            provenance: `${x.name} · ${today()} 업로드 · ${fmtSize(x.file.size)}${x.note ? ' · ' + x.note : ''}`.slice(0, 500),
            file,
          },
        })
        x.status = 'saved'; saved++
      } catch (e) { x.status = 'error'; x.error = e.message }
      renderQueue()
    }
    S.busy = false
    if (saved) S.success = `파일 ${saved}개를 자료로 저장했습니다.`
    const warns = S.queue.filter((x) => x.status === 'saved' && x.warn).map((x) => x.name + ' — ' + x.warn)
    if (warns.length) S.error = warns.join(' / ')
    S.queue = S.queue.filter((x) => x.status !== 'saved')
    renderAll(); renderQueue()
  }
  $('source-file').addEventListener('change', (ev) => { const fs = [...(ev.target.files || [])]; ev.target.value = ''; queueFiles(fs) })
  $('file-queue').addEventListener('click', (ev) => {
    const rm = ev.target.closest('[data-unqueue]')
    if (rm) { S.queue = S.queue.filter((x) => x.id !== rm.dataset.unqueue); renderQueue(); return }
    if (ev.target.closest('#queue-save')) saveQueue()
  })
  ;['dragenter', 'dragover'].forEach((t) => $('file-drop').addEventListener(t, () => $('file-drop').classList.add('drag')))
  ;['dragleave', 'drop'].forEach((t) => $('file-drop').addEventListener(t, () => $('file-drop').classList.remove('drag')))
  $('avatar-load').addEventListener('click', () => loadAvatars(false))
  $('avatar-more').addEventListener('click', () => loadAvatars(true))
  $('avatar-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-avatar]'); if (!b) return
    const a = S.avatars.find((x) => x.id === b.dataset.avatar); if (!a) return
    S.settings = { ...S.settings, avatarId: a.id, avatarType: a.type || 'avatar', avatarName: a.name, voiceId: a.voiceId || S.settings.voiceId, consent: false }
    syncSettingsForm(); renderSettings()
  })
  $('voice-id').addEventListener('input', (ev) => { S.settings = { ...S.settings, voiceId: ev.target.value, consent: false }; $('avatar-confirm').checked = false; renderSettings() })
  $('avatar-confirm').addEventListener('change', (ev) => { S.settings = { ...S.settings, consent: ev.target.checked } })
  $('daily-limit').addEventListener('input', (ev) => { S.settings = { ...S.settings, maxDailyJobs: Number(ev.target.value) } })
  $('settings-save').addEventListener('click', saveSettings)

  document.addEventListener('input', (ev) => { const ta = ev.target.closest && ev.target.closest('[data-edit-text]'); if (ta) editDraft[ta.dataset.editText] = ta.value })
  document.addEventListener('click', async (ev) => {
    const t = ev.target
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTabs(); return }
    const go = t.closest('[data-goto]'); if (go) { S.tab = go.dataset.goto; renderTabs(); window.scrollTo(0, 0); return }
    if (t.closest('[data-refresh]')) { load(); return }
    if (t.closest('[data-focus-keywords]')) { $('keywords').focus(); return }
    const close = t.closest('[data-close]'); if (close) { S[close.dataset.close] = ''; renderMessages(); return }
    const topic = t.closest('[data-topic]'); if (topic) { $('keywords').value = topic.dataset.topic; S.requestId = null; renderCreate(); return }
    const sel = t.closest('[data-select-job]'); if (sel) { S.selectedId = sel.dataset.selectJob; renderCreate(); renderHistory(); return }
    if (t.closest('[data-quota]')) {
      try { const q = await api({ action: 'quota' }); S.quota = q.heygen; if (q.heygen == null) S.error = 'HeyGen 남은 크레딧을 조회하지 못했습니다.' } catch (e) { S.error = e.message }
      renderHistory(); renderMessages(); return
    }
    const pv = t.closest('[data-preview]')
    if (pv) { const job = S.data.jobs.find((j) => j.id === pv.dataset.preview); if (job && job.plan) openPreview(job); return }
    const er = t.closest('[data-edit-review]') || t.closest('[data-edit-skip]')
    if (er) {
      const id = er.dataset.editReview || er.dataset.editSkip
      const skip = !!er.dataset.editSkip
      const ta = document.querySelector(`[data-edit-text="${id}"]`)
      const prompt = ta ? ta.value : ''
      if (skip && !confirm('검수 없이 제작 대기로 넘길까요?\n\n수정한 내용은 Claude·OpenAI 검수를 거치지 않습니다. 사실·금지어는 직접 확인해 주세요. (아직 영상은 만들지 않으며, 제작 시작은 따로 눌러야 합니다)')) return
      try {
        const r = await api({ action: 'editPrompt', id, prompt, mode: skip ? 'skip' : 'review' })
        delete editDraft[id]
        S.data.jobs = S.data.jobs.map((j) => (j.id === r.job.id ? r.job : j)); S.selectedId = r.job.id
        S.success = skip ? '제작 대기로 넘겼습니다. 프롬프트를 확인한 뒤 ‘영상 제작 시작’을 눌러 주세요.' : '수정본을 다시 검수합니다.'
        renderAll(); if (!skip) ensurePolling()
      } catch (e) { S.error = e.message; renderMessages() }
      return
    }
    const ers = t.closest('[data-edit-reset]')
    if (ers) { delete editDraft[ers.dataset.editReset]; renderCreate(); renderHistory(); return }
    const rd = t.closest('[data-render]')
    if (rd) {
      { const jb = S.data.jobs.find((j) => j.id === rd.dataset.render); if (!confirm(`이 프롬프트로 HeyGen 영상을 만들까요?\n\n목표 길이 ${jb ? jb.input.seconds : '?'}초 · HeyGen 크레딧이 사용되며 되돌릴 수 없습니다.`)) return }
      try { const r = await api({ action: 'render', id: rd.dataset.render }); S.data.jobs = S.data.jobs.map((j) => (j.id === r.job.id ? r.job : j)); renderAll() } catch (e) { S.error = e.message; renderMessages() }
      return
    }
    const fl = t.closest('[data-file]')
    if (fl) {
      const w = window.open('', '_blank')
      try { const r = await api({ action: 'fileUrl', id: fl.dataset.file }); if (w) w.location = r.url; else location.href = r.url } catch (e) { if (w) w.close(); S.error = e.message; renderMessages() }
      return
    }
    const cp = t.closest('[data-copy-prompt]')
    if (cp) {
      const job = S.data.jobs.find((j) => j.id === cp.dataset.copyPrompt)
      try { await navigator.clipboard.writeText(job.prompt); S.success = '복사했습니다.' } catch (e) { S.error = '복사 권한이 없습니다. 내용을 직접 선택해 복사해 주세요.' }
      renderMessages()
    }
  })
  document.addEventListener('change', (ev) => {
    const a = ev.target.closest('[data-approve]')
    if (a) act({ action: 'approval', id: a.dataset.approve, approved: a.checked }, '자료 사용 상태를 변경했습니다.')
  })

  // ── 로그인 ──
  function showLogin() {
    $('login-view').hidden = false; $('studio-view').hidden = true; $('logout-btn').hidden = true
  }
  function showStudio() {
    $('login-view').hidden = true; $('studio-view').hidden = false; $('logout-btn').hidden = false
  }
  async function doLogin() {
    let id = $('li-id').value.trim()
    const pw = $('li-pw').value
    if (!id || !pw) { $('login-msg').textContent = '아이디와 비밀번호를 입력해 주세요.'; return }
    if (!id.includes('@')) id += '@aptsquare.app'
    $('login-msg').textContent = '로그인 중…'
    const { error } = await sbc.auth.signInWithPassword({ email: id, password: pw })
    if (error) { $('login-msg').textContent = '아이디 또는 비밀번호를 확인해 주세요.'; return }
    $('login-msg').textContent = ''
    showStudio(); load()
  }
  $('login-btn').addEventListener('click', doLogin)
  $('li-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin() })
  $('logout-btn').addEventListener('click', async () => { await sbc.auth.signOut(); location.reload() })

  buildProviders()
  renderAll()
  sbc.auth.getSession().then(({ data: { session } }) => {
    if (session) { showStudio(); load() } else showLogin()
  })
})()
