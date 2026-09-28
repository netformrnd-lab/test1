// 아파트스퀘어 영상 제작 작업실 (원본 reelty-ai-video-studio 화면·흐름을 바닐라 JS로 재현)
// 서버: worker/worker.js (build.mjs 로 화면과 합쳐 deploy/worker.js 로 배포)  ·  설정: config.js
;(function () {
  const CFG = window.STUDIO_CONFIG || {}
  const API = CFG.STUDIO_API || '/api/studio'
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
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  }
  function icon(name, size = 24, cls = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICONS[name] || ''}</svg>`
  }
  document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 24) })

  // ── 상수 (원본과 동일) ──
  const STATUS = {
    queued: '자료 검색', drafting: '대본 작성', reviewing: '교차 검수', revising: '자동 수정', submitting: '제작 요청',
    rendering: 'HeyGen 제작 중', rendered: '영상 생성 완료', held: '자동 보류', failed: '처리 실패', uncertain: '중복 방지로 중단',
  }
  const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'submitting', 'rendering']
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
    ['HeyGen 전용 프롬프트', '대본·장면·자막·브랜드 지시 고정', 5, 6],
    ['이사님 아바타 영상 생성', '선택한 외형·음성으로 실제 제작', 6, 7],
  ]
  const PROVIDERS = [['claude', 'Claude'], ['openai', 'ChatGPT · OpenAI'], ['heygen', 'HeyGen']]

  // ── 상태 ──
  const S = {
    data: null, tab: 'create', error: '', success: '', busy: false, selectedId: null, requestId: null,
    settings: { ...DEFAULT_SETTINGS }, avatars: [], nextToken: '', avatarsLoaded: false, settingsBusy: false,
    providerUi: {},
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
    renderTabs(); renderMessages(); renderCreate(); renderKnowledge(); renderHistory(); renderSettings()
    ensurePolling()
  }

  function renderTabs() {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('data-state', b.dataset.tab === S.tab ? 'active' : 'inactive'))
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== S.tab })
    $('tab-src-count').textContent = S.data ? S.data.sources.length : 0
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

  function jobHtml(e) {
    let h = `<div class="job-result"><div class="between"><div><h3>${esc((e.plan && e.plan.title) || e.input.keywords)}</h3>
      <p>${esc(e.input.audience)} · 목표 ${e.input.seconds}초 · ${e.input.ratio} · 수정 ${e.revision}/2회</p></div><span class="tag">${STATUS[e.status] || esc(e.status)}</span></div>`
    if (e.error) h += `<div class="message error">${icon('shield', 18)}${esc(e.error)}</div>`
    if (e.videoUrl) {
      h += `<div class="video-output"><video controls playsinline preload="metadata" src="${esc(e.videoUrl)}"></video>
        <div class="between"><span>실제 길이 ${e.actualSeconds || '미확인'}초</span><a href="${esc(e.videoUrl)}" target="_blank" rel="noreferrer">영상 열기 ${icon('external', 14)}</a></div>
        <p class="fineprint">AI 아바타 생성 영상 · 화면·발음·자막의 최종 품질은 자동 검증되지 않았습니다. 영상 주소는 만료될 수 있습니다.</p></div>`
    }
    h += `<div class="reviews-grid">${reviewHtml('Claude', e.claude)}${reviewHtml('OpenAI', e.openai)}</div>`
    if (e.plan) {
      h += `<details open><summary>최종 대본 · 장면 구성</summary><div class="scene-list">${e.plan.scenes.map((s, i) => `<div>
        <span class="scene-label">SCENE ${String(i + 1).padStart(2, '0')} <small>${s.seconds}초</small></span>
        <h4>${esc(s.onScreen)}</h4><p>${esc(s.narration)}</p><small>화면: ${esc(s.visual)}</small>
        <details><summary>원문 근거 ${s.citations.length}개</summary>${s.citations.map((c) => `<blockquote>
          <b>${esc((e.sources.find((x) => x.id === c.sourceId) || {}).title || '출처 확인 필요')}</b><p>${esc(c.quote)}</p><small>${esc(c.claim)}</small></blockquote>`).join('')}</details>
      </div>`).join('')}</div></details>`
    }
    if (e.prompt) {
      h += `<details><summary>HeyGen에 전달하는 실제 프롬프트</summary><button class="btn outline" data-copy-prompt="${e.id}">${icon('copy', 14)}복사</button><pre>${esc(e.prompt)}</pre></details>`
    }
    h += `<details><summary>제작 기록 · ${e.events.length}건</summary><ol class="event-list">${e.events.map((x) => `<li><time>${fmt(x.time)}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>
      <small>프롬프트 ${esc(e.promptVersion)} · Claude ${esc(e.models.claude)} · OpenAI ${esc(e.models.openai)}</small></details>`
    if (e.memory.length) h += `<details><summary>이번 제작에 참고한 누적 패턴</summary>${e.memory.map((m) => `<p>${esc(m)}</p>`).join('')}</details>`
    return h + '</div>'
  }

  function renderKnowledge() {
    const n = S.data
    const srcs = (n && n.sources) || []
    $('src-count').textContent = srcs.length
    $('src-approved').textContent = `승인 ${srcs.filter((s) => s.approved === 1).length}개`
    $('learning-count').textContent = (n && n.learningCount) || 0
    $('sources-list').innerHTML = srcs.length ? srcs.map((s) => `<article class="source-card">
        <div class="between"><h3>${esc(s.title)}</h3><span class="${s.approved ? 'tag green' : 'tag'}">${s.approved ? '사용 중' : '승인 대기'}</span></div>
        <p class="source-meta">${esc(s.provenance)}</p>
        <details><summary>본문 확인</summary><pre>${esc(s.content)}</pre></details>
        <div class="check-row"><input type="checkbox" data-slot="checkbox" id="src-${s.id}" data-approve="${s.id}" ${s.approved === 1 ? 'checked' : ''} ${S.busy ? 'disabled' : ''}><label for="src-${s.id}">영상 제작 근거로 사용</label></div>
      </article>`).join('')
      : `<div class="empty-result small">${icon('library', 28)}<h3>아직 등록된 자료가 없습니다</h3><p>서비스 소개서, 시방서, 검증된 현장사례를 등록하면 다음 제작부터 검색합니다.</p></div>`
    updateSourceSave()
  }
  function updateSourceSave() {
    $('source-save').disabled = S.busy || $('source-content').value.length < 30 || !$('source-title').value || !$('source-origin').value
  }

  function renderHistory() {
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
    if (next) pollTimer = setTimeout(tick, next.step === 6 ? 15000 : 1200)
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
  $('source-file').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''
    if (!f) return
    if (!/\.(txt|md)$/i.test(f.name) || f.size > 180000) { S.error = '180KB 이하의 TXT 또는 MD 파일을 선택해 주세요. PDF·PPT·한글 문서는 본문 텍스트를 붙여 넣어 주세요.'; renderMessages(); return }
    const text = await f.text()
    $('source-title').value = f.name; $('source-origin').value = f.name; $('source-content').value = text; $('source-approve').checked = false; updateSourceSave()
  })
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

  document.addEventListener('click', async (ev) => {
    const t = ev.target
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTabs(); return }
    const go = t.closest('[data-goto]'); if (go) { S.tab = go.dataset.goto; renderTabs(); window.scrollTo(0, 0); return }
    if (t.closest('[data-refresh]')) { load(); return }
    if (t.closest('[data-focus-keywords]')) { $('keywords').focus(); return }
    const close = t.closest('[data-close]'); if (close) { S[close.dataset.close] = ''; renderMessages(); return }
    const topic = t.closest('[data-topic]'); if (topic) { $('keywords').value = topic.dataset.topic; S.requestId = null; renderCreate(); return }
    const sel = t.closest('[data-select-job]'); if (sel) { S.selectedId = sel.dataset.selectJob; renderCreate(); renderHistory(); return }
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
