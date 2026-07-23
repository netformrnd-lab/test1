// ============================================================
// 아파트스퀘어 — Supabase 연결 + 로그인/회원가입
// (publishable 키는 공개용이라 코드에 넣어도 안전합니다. 보안은 DB의 RLS가 담당)
// supabase-js 라이브러리는 index.html에서 먼저 불러옵니다 (window.supabase).
// ============================================================
const SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE'

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.sb = sb

const $ = (id) => document.getElementById(id)
function setMsg(text, ok) {
  const m = $('auth-msg')
  if (m) { m.textContent = text || ''; m.style.color = ok ? '#1f8a5b' : '#d94b4b' }
}
function ko(m) {
  if (/Invalid login/i.test(m)) return '아이디 또는 비밀번호가 맞지 않아요'
  if (/already registered|already been registered/i.test(m)) return '이미 사용 중인 아이디예요'
  if (/Password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 해요'
  if (/valid email|invalid.*email/i.test(m)) return '아이디에 쓸 수 없는 문자가 있어요 (영문·숫자로 만들어 주세요)'
  if (/Email not confirmed/i.test(m)) return '아직 승인 전이에요. 관리자 승인 후 이용할 수 있어요'
  return m
}

// 로그인 상태에 따라 알맞은 화면으로 이동
async function route() {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) { window.showScreen && window.showScreen('s01'); return }
  const { data: profile, error } = await sb
    .from('profiles').select('role, approved, name').eq('id', user.id).single()
  if (error || !profile || !profile.approved) { window.showScreen('s02'); return } // 승인 대기
  currentRole = profile.role
  applyRoleNav(profile.role)
  if (profile.role === 'auditor') { window.showScreen('s07'); loadAuditorApts() }
  else { window.showScreen('s11'); loadResidentHome() }
}
let currentRole = null

// ── 입주민·관리소장 홈: 우리 단지 정보 불러오기 ─────────────
let RES_APT = null
let RES_AUD_NAME = ''
let RES_AUD_PHONE = ''
// 담당 감리 → 문의하기 화면(s16)
function openInquiry() {
  const nm = document.getElementById('q-aud-name'); if (nm && RES_AUD_NAME) nm.textContent = RES_AUD_NAME
  const av = document.getElementById('q-aud-av'); if (av && RES_AUD_NAME) av.textContent = RES_AUD_NAME.slice(0, 1)
  const ph = document.getElementById('q-aud-phone')
  if (ph) ph.textContent = RES_AUD_PHONE ? ('📞 ' + RES_AUD_PHONE) : '연락처 미등록 (관리자에게 문의)'
  window.showScreen('s16')
}
window.openInquiry = openInquiry
async function loadResidentHome() {
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
  if (!prof || !prof.apartment_id) {
    const nm = document.getElementById('res-apt-name'); if (nm) nm.textContent = '배정된 단지가 없어요'
    const h = document.getElementById('res-prog-head'); if (h) h.textContent = '관리자가 단지를 배정하면 표시돼요'
    return
  }
  const { data: apt } = await sb.from('apartments').select('*').eq('id', prof.apartment_id).single()
  if (!apt) return
  RES_APT = apt
  const nm = document.getElementById('res-apt-name'); if (nm) nm.textContent = apt.name
  // 진행률 · 공정 단계 (공법 기준)
  const stages = (window.methodStages && window.methodStages(apt.method)) || null
  const tot = stages ? stages.length : (apt.progress_total || 0)
  const cur = apt.progress_current || 0, pct = tot ? Math.round(cur / tot * 100) : 0
  const pg = document.getElementById('res-prog'); if (pg) pg.innerHTML = cur + '<span style="opacity:.55">/' + tot + '</span>'
  const bar = document.getElementById('res-bar'); if (bar) bar.style.width = pct + '%'
  const head = document.getElementById('res-prog-head')
  const cap = document.getElementById('res-stage-cap')
  if (stages) {
    if (cur >= tot) {
      if (head) head.textContent = '공사가 모두 끝났어요 🎉'
      if (cap) cap.textContent = '모든 공정이 완료되었습니다.'
    } else {
      if (head) head.textContent = `현재 ${cur + 1}단계 · ${stages[cur]}`
      if (cap) cap.textContent = `지금은 ‘${stages[cur]}’ 단계예요. 감리가 한 단계씩 꼼꼼히 확인하고 있어요.`
    }
  } else {
    if (head) head.textContent = '공사 준비 중이에요'
    if (cap) cap.textContent = '공정이 등록되면 단계별로 알려드릴게요.'
  }
  // 담당 감리사 이름 (PII 노출 없이 이름만 반환하는 함수 사용)
  if (apt.auditor_id) {
    const { data: audName } = await sb.rpc('apartment_auditor_name', { apt: apt.id })
    if (audName) {
      RES_AUD_NAME = audName
      const an = document.getElementById('res-aud-name'); if (an) an.textContent = audName
      const av = document.getElementById('res-aud-av'); if (av) av.textContent = String(audName).slice(0, 1)
    }
    const { data: audPhone } = await sb.rpc('apartment_auditor_phone', { apt: apt.id })
    if (audPhone) RES_AUD_PHONE = audPhone
  }
  loadResidentNext(apt.id)
  loadResidentNotices()
  loadRegionActivity()
}
// 다가오는 감리 일정 1건
async function loadResidentNext(aptId) {
  const title = document.getElementById('res-next-title'), sub = document.getElementById('res-next-sub'), dbox = document.getElementById('res-next-date')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  const { data } = await sb.from('schedules').select('*').eq('apartment_id', aptId).gte('date', iso).order('date').limit(1)
  const s = data && data[0]
  if (!s) {
    if (title) title.textContent = '예정된 일정이 없어요'
    if (sub) sub.textContent = '새 일정이 등록되면 여기에 보여드릴게요'
    return
  }
  const d = new Date(s.date), wd = ['일', '월', '화', '수', '목', '금', '토']
  if (title) title.textContent = s.title
  if (sub) sub.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd[d.getDay()]})${s.description ? ' · ' + s.description : ''}`
  if (dbox) dbox.innerHTML = `<span style="font-size:9px;font-weight:800;color:#2F6BF6">${d.getMonth() + 1}월</span><span style="font-size:17px;font-weight:800;color:#2F6BF6">${d.getDate()}</span>`
}
// 입주민: 우리 단지 현장 현황 (관리자가 올린 현장 사진·글)
let FIELD_LIST = []       // 입주민 현장 현황 전체
function renderFieldList() {
  const cont = document.getElementById('field-list'); if (!cont) return
  const q = ((document.getElementById('field-search') || {}).value || '').trim().toLowerCase()
  const list = q ? FIELD_LIST.filter(f => ((f.title || '') + ' ' + (f.content || '')).toLowerCase().includes(q)) : FIELD_LIST
  if (!list.length) { cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">' + (q ? '검색 결과가 없어요.' : '아직 등록된 현장 기록이 없어요.<br>새 현장 사진이 올라오면 여기에 표시돼요.') + '</div>'; return }
  cont.innerHTML = list.map(reportCard).join('')
}
async function loadFieldUpdates() {
  const cont = document.getElementById('field-list'); if (!cont) return
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const fs = document.getElementById('field-search'); if (fs) fs.value = ''
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
  const hdr = document.getElementById('field-apt')
  if (!prof || !prof.apartment_id) { if (hdr) hdr.textContent = '배정된 단지 없음'; FIELD_LIST = []; cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">배정된 단지가 없어요.</div>'; return }
  const { data: apt } = await sb.from('apartments').select('name').eq('id', prof.apartment_id).single()
  if (hdr) hdr.textContent = apt ? apt.name : '우리 단지'
  const { data } = await sb.from('field_updates').select('*').eq('apartment_id', prof.apartment_id).order('created_at', { ascending: false })
  FIELD_LIST = data || []
  renderFieldList()
}
// 감리사: 단지 선택 후 메뉴 (감리보고서 / 현장 사진)
function openAuditorMenu(a) {
  if (!a) return
  currentApt = a
  const nm = document.getElementById('aud-menu-apt'); if (nm) nm.textContent = a.name
  window.showScreen('s27')
}
window.openAuditorMenu = openAuditorMenu
// 감리사: 이 단지 현장 사진 목록
let AUDFIELD_LIST = []
function renderAudFieldList() {
  const cont = document.getElementById('audfield-list'); if (!cont) return
  const q = ((document.getElementById('audfield-search') || {}).value || '').trim().toLowerCase()
  const list = q ? AUDFIELD_LIST.filter(f => ((f.title || '') + ' ' + (f.content || '')).toLowerCase().includes(q)) : AUDFIELD_LIST
  if (!list.length) { cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">' + (q ? '검색 결과가 없어요.' : '아직 이 단지에 등록된 현장 사진이 없어요.') + '</div>'; return }
  cont.innerHTML = list.map(reportCard).join('')
}
async function openAuditorField(a) {
  if (!a) return
  const cont = document.getElementById('audfield-list'); if (!cont) return
  const hdr = document.getElementById('audfield-apt'); if (hdr) hdr.textContent = a.name
  const fs = document.getElementById('audfield-search'); if (fs) fs.value = ''
  window.showScreen('s28')
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data } = await sb.from('field_updates').select('*').eq('apartment_id', a.id).order('created_at', { ascending: false })
  AUDFIELD_LIST = data || []
  renderAudFieldList()
}
window.openAuditorField = openAuditorField
// 입주민: 공개된 우리 단지 감리보고서 목록
async function loadResidentReports() {
  const cont = document.getElementById('res-report-list'); if (!cont) return
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
  const hdr = document.getElementById('res-rep-apt')
  if (!prof || !prof.apartment_id) { if (hdr) hdr.textContent = '배정된 단지 없음'; cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">배정된 단지가 없어요.</div>'; return }
  // 헤더에 로그인한 단지명 표시
  const { data: apt } = await sb.from('apartments').select('name').eq('id', prof.apartment_id).single()
  if (hdr) hdr.textContent = apt ? apt.name : '우리 단지'
  const { data } = await sb.from('reports').select('*').eq('apartment_id', prof.apartment_id).eq('published', true).order('created_at', { ascending: false })
  if (!data || !data.length) { cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 공개된 감리보고서가 없어요.<br>감리가 확인을 마치면 여기에 올라와요.</div>'; return }
  cont.innerHTML = data.map(reportCard).join('')
}
window.loadResidentHome = loadResidentHome

// ── 뒤로가기(화면 히스토리) ─────────────────────────────
const ORIG_SHOW = window.showScreen
const NAV_HIST = []
let NAV_CUR = (location.hash || '').replace('#', '') || null
window.showScreen = function (id) {
  if (!document.getElementById(id)) return
  if (NAV_CUR && NAV_CUR !== id) NAV_HIST.push(NAV_CUR)
  NAV_CUR = id
  ORIG_SHOW(id)
}
window.goBack = function () {
  let p = NAV_HIST.pop()
  if (!p) p = (currentRole === 'auditor') ? 's07' : 's11'
  NAV_CUR = p
  ORIG_SHOW(p)
}
// iOS 왼쪽 가장자리 스와이프 → 뒤로가기
;(function () {
  let sx = 0, sy = 0, edge = false, t0 = 0
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return
    sx = t.clientX; sy = t.clientY; edge = sx <= 40; t0 = Date.now()
  }, { passive: true })
  document.addEventListener('touchend', (e) => {
    if (!edge) return
    const t = e.changedTouches[0]; if (!t) return
    const dx = t.clientX - sx, dy = t.clientY - sy
    if (dx > 60 && Math.abs(dy) < 45 && (Date.now() - t0) < 700) window.goBack()
  }, { passive: true })
})()
function wireBackArrows() {
  document.querySelectorAll('.ab').forEach((ab) => {
    const sp = ab.querySelector('span')
    if (sp && /^[‹<]$/.test((sp.textContent || '').trim()) && !sp.getAttribute('onclick') && !sp.hasAttribute('data-back')) {
      sp.style.cursor = 'pointer'; sp.onclick = () => window.goBack()
    }
  })
}

// ── 역할별 하단 메뉴 (입주민: 홈/진행현황/일정, 감리사: 홈/보고서/일정) ──
function applyRoleNav(role) {
  const isRes = role !== 'auditor'
  document.querySelectorAll('.nav').forEach((nav) => {
    const items = nav.querySelectorAll(':scope > div')
    if (items.length >= 2) items[1].innerHTML = isRes ? '<div class="ic">📊</div>진행현황' : '<div class="ic">📄</div>보고서'
  })
}

// ── 입주민 진행 현황 페이지 (s24) ─────────────────────────
async function loadResidentProgress() {
  let apt = RES_APT
  if (!apt) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
    if (prof && prof.apartment_id) { const { data } = await sb.from('apartments').select('*').eq('id', prof.apartment_id).single(); apt = data; RES_APT = data }
  }
  const nm = document.getElementById('prog-apt-name')
  if (!apt) { if (nm) nm.textContent = '배정된 단지가 없어요'; renderStageTrack({ method: null }, 'prog-track'); return }
  if (nm) nm.textContent = apt.name
  renderStageTrack(apt, 'prog-track')
}

// ── 공지사항 (DB 연동) ───────────────────────────────────
let NOTICES = {}
async function loadResidentNotices(boxId) {
  const box = document.getElementById(boxId || 'res-notices'); if (!box) return
  const { data } = await sb.from('notices').select('*').order('created_at', { ascending: false }).limit(3)
  if (!data || !data.length) { box.innerHTML = '<div style="padding:14px;font-size:11px;color:#8b95ad;font-weight:600;text-align:center">등록된 공지사항이 없어요.</div>'; return }
  NOTICES = {}
  box.innerHTML = data.map((n, i) => {
    NOTICES[n.id] = n
    const d = (n.created_at || '').slice(2, 10).replace(/-/g, '.')
    const line = i < data.length - 1 ? 'border-bottom:1px solid #f0f2f7;' : ''
    return `<div data-notice="${n.id}" style="cursor:pointer;display:flex;justify-content:space-between;gap:8px;padding:12px 13px;${line}"><span style="font-size:12.5px;font-weight:600;color:#3a445e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(n.title)}</span><span style="font-size:10.5px;color:#aab2c4;font-weight:600;flex-shrink:0">${d}</span></div>`
  }).join('')
}
// 우리 지역 감리 현황 (익명 · 이름/주소 없음)
async function loadRegionActivity() {
  const box = document.getElementById('res-region'); if (!box) return
  const { data } = await sb.rpc('region_activity')
  if (!data || !data.length) { box.innerHTML = '<div style="padding:14px;font-size:11px;color:#8b95ad;font-weight:600;text-align:center">표시할 감리 활동이 없어요.</div>'; return }
  const stMap = { in_progress: ['감리 진행 중', '#2F6BF6'], scheduled: ['점검 예정', '#c98a1e'], done: ['점검 완료', '#1f8a5b'] }
  box.innerHTML = data.map((r, i) => {
    const [lbl, col] = stMap[r.status] || stMap.scheduled
    const region = r.region || '전국'
    const type = r.construction_type || '유지보수'
    const line = i < data.length - 1 ? 'border-bottom:1px solid #f0f2f7;' : ''
    return `<div style="display:flex;align-items:center;gap:9px;padding:12px 13px;${line}"><span style="width:7px;height:7px;border-radius:99px;background:${col};flex-shrink:0"></span><div style="flex:1;font-size:12.5px;font-weight:700;color:#2a3350;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(region)} · ${escH(type)}</div><span style="font-size:10.5px;color:${col};font-weight:800;flex-shrink:0">${lbl}</span></div>`
  }).join('')
}
function openNotice(n) {
  if (!n) return
  const t = document.getElementById('n-title'); if (t) t.textContent = n.title
  const d = document.getElementById('n-date'); if (d) d.textContent = '아파트스퀘어 · ' + ((n.created_at || '').slice(0, 10).replace(/-/g, '.'))
  const b = document.getElementById('n-body'); if (b) b.innerHTML = escH(n.body || '').replace(/\n/g, '<br>')
  window.showScreen('s18')
}

// ── 감리 우수 사례 (관리자가 작성 · 전/후 사진) ────────────
let CASES = {}
async function loadCases() {
  const box = document.getElementById('case-list'); if (!box) return
  box.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data } = await sb.from('cases').select('*').order('created_at', { ascending: false })
  if (!data || !data.length) { box.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">등록된 우수 사례가 아직 없어요.</div>'; return }
  CASES = {}
  box.innerHTML = data.map((c) => {
    CASES[c.id] = c
    const thumb = c.after_url || c.before_url
    const img = thumb
      ? `background:url('${thumb}') center/cover`
      : 'background:#eef1f7;display:flex;align-items:center;justify-content:center;font-size:20px'
    return `<div data-case-id="${c.id}" style="cursor:pointer;background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:10px;display:flex;gap:11px;align-items:center">
      <div style="width:58px;height:58px;border-radius:10px;flex-shrink:0;${img}">${thumb ? '' : '🏢'}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:800;color:#1c2440">${escH(c.title)}</div>
      ${c.meta ? `<div style="font-size:9.5px;color:#8b95ad;font-weight:600;margin-top:2px">${escH(c.meta)}</div>` : ''}
      ${c.summary ? `<div style="font-size:10.5px;color:#5c6580;font-weight:600;margin-top:5px;line-height:1.5">${escH(c.summary)}</div>` : ''}</div>
      <span style="font-size:16px;color:#c3ccdb;flex-shrink:0;align-self:center">›</span></div>`
  }).join('')
}
function openCaseDetail(c) {
  if (!c) return
  const ct = document.getElementById('case-title'); if (ct) ct.textContent = c.title || '감리 우수 사례'
  const cm = document.getElementById('case-meta'); if (cm) cm.textContent = c.meta || ''
  const cb = document.getElementById('case-body'); if (cb) cb.innerHTML = c.body ? escH(c.body).replace(/\n/g, '<br>') : (c.summary ? escH(c.summary) : '')
  const bf = document.getElementById('case-before'); if (bf) bf.style.background = c.before_url ? `url('${c.before_url}') center/cover` : '#dfe5ee'
  const af = document.getElementById('case-after'); if (af) af.style.background = c.after_url ? `url('${c.after_url}') center/cover` : '#dfe5ee'
  window.showScreen('s25')
}

// ── 30초 우리 단지 자가진단 (s05) ────────────────────────
const SDG_Q = [
  { q: '우리 단지, 입주(준공)한 지 얼마나 됐나요?', a: [
    { t: '5년 미만', rec: [] }, { t: '5~10년', rec: [] },
    { t: '10~15년', rec: ['repaint'] }, { t: '15년 이상', rec: ['repaint', 'diagnosis'] } ] },
  { q: '외벽에 균열이나 페인트 벗겨짐이 보이나요?', a: [
    { t: '거의 없어요', rec: [] }, { t: '군데군데 있어요', rec: ['repaint'] },
    { t: '눈에 띄게 많아요', rec: ['repaint', 'diagnosis'] } ] },
  { q: '천장·벽·지하에서 물이 새거나 얼룩이 있나요?', a: [
    { t: '없어요', rec: [] }, { t: '가끔 봐요', rec: ['waterproof'] },
    { t: '자주 있어요', rec: ['waterproof', 'diagnosis'] } ] },
  { q: '마지막 외벽 도장(페인트)은 언제쯤인가요?', a: [
    { t: '5년 이내', rec: [] }, { t: '5~10년 전', rec: ['repaint'] },
    { t: '10년 이상', rec: ['repaint'] }, { t: '잘 모르겠어요', rec: ['diagnosis'] } ] },
  { q: '지하주차장 바닥 상태는 어떤가요?', a: [
    { t: '깨끗해요', rec: [] }, { t: '균열·벗겨짐 있어요', rec: ['epoxy'] },
    { t: '심하게 손상됐어요', rec: ['epoxy', 'diagnosis'] }, { t: '지하가 없어요', rec: [] } ] }
]
const SDG_REC = {
  waterproof: { chip: '방수 공사', short: '누수 원인을 찾아 방수층부터 다시 잡는 공사', head: '방수 상태부터 확인해 보시면 좋겠어요', body: '물이 새는 자리와 물이 들어온 자리는 다를 때가 많습니다. 어디서 들어왔는지를 찾아야 같은 증상이 반복되지 않아요. 옥상·외벽·지하 중 어디를 먼저 볼지 현장에서 짚어드릴게요.' },
  repaint: { chip: '외벽 재도장', short: '균열을 보수한 뒤 외벽을 다시 칠하는 공사', head: '외벽 도장 상태부터 확인해 보시면 좋겠어요', body: '외벽 균열과 페인트 벗겨짐은 미관뿐 아니라 방수·단열에도 영향을 줘요. 균열을 먼저 보수하고 재도장해야 오래가고, 도막 두께·자재 규격을 현장에서 확인해 드릴게요.' },
  epoxy: { chip: '지하주차장 에폭시', short: '지하 바닥을 보수한 뒤 에폭시를 재시공하는 공사', head: '지하주차장 바닥부터 확인해 보시면 좋겠어요', body: '바닥 균열·박리는 분진과 미끄럼 사고로 이어질 수 있어요. 바닥 상태와 습기·누수 여부를 확인한 뒤, 보수 후 에폭시 재시공 범위를 현장에서 짚어드릴게요.' }
}
const SDG_PRIORITY = ['waterproof', 'repaint', 'epoxy']
let sdgAnswers = []
function startSelfDiag() { sdgAnswers = []; sdgRender(0) }
function sdgSetBar(done, total) {
  const bar = document.getElementById('sdgbar'), pct = document.getElementById('sdgpct')
  const p = Math.round(done / total * 100)
  if (bar) bar.style.width = p + '%'
  if (pct) pct.textContent = p + '%'
}
function sdgRender(qi) {
  const box = document.getElementById('sdg'); if (!box) return
  sdgSetBar(qi, SDG_Q.length)
  const Q = SDG_Q[qi]
  box.innerHTML = `<div style="padding:20px 16px">
    <div style="font-size:11px;font-weight:800;color:#2F6BF6">Q${qi + 1} / ${SDG_Q.length}</div>
    <div style="font-size:17px;font-weight:800;color:#141d34;line-height:1.4;margin-top:8px">${escH(Q.q)}</div>
    <div style="display:flex;flex-direction:column;gap:9px;margin-top:18px">
      ${Q.a.map((o, ai) => `<div data-sdg-a="${ai}" style="cursor:pointer;background:#fff;border:1.5px solid #e6eaf2;border-radius:12px;padding:15px 16px;font-size:13.5px;font-weight:700;color:#2a3350;display:flex;align-items:center;justify-content:space-between">${escH(o.t)}<span style="color:#c3ccdb">›</span></div>`).join('')}
    </div></div>`
  box.querySelectorAll('[data-sdg-a]').forEach(el => el.onclick = () => {
    sdgAnswers[qi] = Q.a[+el.dataset.sdgA]
    if (qi + 1 < SDG_Q.length) sdgRender(qi + 1); else sdgResult()
  })
}
function sdgResult() {
  const box = document.getElementById('sdg'); if (!box) return
  sdgSetBar(SDG_Q.length, SDG_Q.length)
  let recs = []
  sdgAnswers.forEach(a => (a.rec || []).forEach(r => { if (SDG_REC[r] && !recs.includes(r)) recs.push(r) }))
  recs.sort((a, b) => SDG_PRIORITY.indexOf(a) - SDG_PRIORITY.indexOf(b))
  const top = recs[0]
  const head = top ? SDG_REC[top].head : '지금은 큰 문제가 없어 보여요'
  const body = top ? SDG_REC[top].body
    : '답변을 보니 특별히 눈에 띄는 문제는 없어 보여요. 그래도 건물은 시간이 지나며 조금씩 변하니, 정기 점검은 챙기시는 걸 권장해요.'
  const list = recs.map(r => `<div style="display:flex;align-items:flex-start;gap:10px;background:#fff;border:1px solid #eef1f7;border-radius:12px;padding:12px 13px"><span style="width:7px;height:7px;border-radius:50%;background:#2F6BF6;flex-shrink:0;margin-top:5px"></span><div><div style="font-size:12.5px;font-weight:800;color:#1c2440">${escH(SDG_REC[r].chip)}</div><div style="font-size:10.5px;color:#5c6580;font-weight:600;margin-top:2px;line-height:1.5">${escH(SDG_REC[r].short)}</div></div></div>`).join('')
  box.innerHTML = `
    <div style="padding:15px 16px 13px;background:#fff;border-bottom:1px solid #eef1f7">
      <div style="display:flex;align-items:center;gap:9px"><span style="font-size:21px">🩺</span><div><div style="font-size:14px;font-weight:800;color:#141d34">30초 우리 단지 자가진단</div><div style="font-size:10px;color:#8b95ad;font-weight:600;margin-top:2px">로그인 없이 지금 바로 · 어떤 점검이 필요한지 알려드릴게요</div></div></div>
    </div>
    <div style="padding:18px 16px 26px">
      <div style="font-size:11px;font-weight:800;color:#2F6BF6">자가진단 결과</div>
      <div style="font-size:18px;font-weight:800;color:#141d34;line-height:1.42;margin-top:6px">${escH(head)}</div>
      <div style="font-size:12px;color:#404a63;line-height:1.85;margin-top:14px">${escH(body)}</div>
      ${list ? `<div style="font-size:12.5px;font-weight:800;color:#141d34;margin:18px 0 9px">이런 공정을 확인해 보세요</div><div style="display:flex;flex-direction:column;gap:8px">${list}</div>` : ''}
      <div style="background:#f2f6ff;border-radius:12px;padding:14px 15px;font-size:11.5px;color:#2a3350;font-weight:700;line-height:1.7;margin-top:15px">계획을 세우기 전에 상태를 먼저 확인해두시면 공사 범위와 예산을 잡기 수월해집니다.</div>
      <div style="font-size:10px;color:#9aa3b8;font-weight:600;line-height:1.7;margin-top:15px">자가진단은 참고용 안내예요. 같은 증상이어도 단지의 기간·환경에 따라 원인이 달라지기 때문에, 정확한 상태는 현장에서 직접 확인해 드릴게요.</div>
      <div data-inquiry="1" style="cursor:pointer;background:linear-gradient(150deg,#243768,#1F2C5C);border-radius:14px;padding:15px 16px;color:#fff;text-align:center;margin-top:18px"><div style="font-size:10.5px;color:#c3cee6;font-weight:700">외벽 정밀 진단, 비용 부담 없이 받아보실 수 있어요</div><div style="font-size:13.5px;font-weight:800;margin-top:5px">드론 AI 하자진단 무상지원</div></div>
      <div data-inquiry="1" style="cursor:pointer;margin-top:11px;background:#2F6BF6;color:#fff;border-radius:12px;padding:15px;text-align:center;font-size:13.5px;font-weight:800">진단 결과로 상담 남기기</div>
      <a href="tel:16006069" style="display:block;text-decoration:none;margin-top:9px;background:#fff;border:1.5px solid #e6eaf2;color:#e4544b;border-radius:12px;padding:14px;text-align:center;font-size:13px;font-weight:800">📞 전화로 바로 상담 1600-6069</a>
      <div id="sdg-again" style="cursor:pointer;margin-top:15px;text-align:center;font-size:12px;font-weight:700;color:#8b95ad">↻ 처음부터 다시 하기</div>
    </div>`
  const ag = document.getElementById('sdg-again'); if (ag) ag.onclick = startSelfDiag
}

// ── 영상으로 보는 감리 이야기 (유튜브 Shorts) ────────────
const VIDEOS = [
  { id: 'FI86cA8S6Uo', title: '옥상 방수 감리는?' },
  { id: 'I-PiIwjT6ME', title: '22년차 건축사의 옥상 하자유형은?' },
  { id: 'v41iig-WyzY', title: '외벽 도장 마감공사 감리는?' },
  { id: 'uOQHBbDvo-s', title: '아파트 외벽 도장 감리는?' },
  { id: 'pP00I2IJSWs', title: '아파트 보수공사, 잘못하면 수천만원 손해?' }
]
function renderVideos() {
  document.querySelectorAll('.res-videos').forEach((row) => {
    row.innerHTML = VIDEOS.map((v) => `<div data-ytid="${v.id}" style="cursor:pointer;flex:0 0 132px">
      <div style="height:200px;border-radius:12px;background:linear-gradient(180deg,rgba(10,16,34,.1),rgba(10,16,34,.6)),url('https://img.youtube.com/vi/${v.id}/hqdefault.jpg') center/cover;position:relative;padding:10px;display:flex;flex-direction:column;justify-content:space-between">
        <div style="align-self:flex-end;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.9);color:#2F6BF6;display:flex;align-items:center;justify-content:center;font-size:12px">▶</div>
        <div style="font-size:11px;font-weight:800;color:#fff;line-height:1.3;text-shadow:0 1px 4px rgba(0,0,0,.5)">${escH(v.title)}</div>
      </div>
      <div style="font-size:9px;color:#8b95ad;font-weight:700;margin-top:5px">▶ Shorts로 보기</div>
    </div>`).join('')
  })
}

// ── 입주민 ≡ 메뉴 ────────────────────────────────────────
function openResidentMenu() {
  let ov = document.getElementById('res-menu-ov')
  if (ov) { ov.remove(); return }
  ov = document.createElement('div')
  ov.id = 'res-menu-ov'
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,22,48,.42);z-index:60;display:flex;align-items:flex-end'
  ov.innerHTML = '<div style="background:#fff;width:100%;border-radius:18px 18px 0 0;padding:6px 0 16px">' +
    '<div style="width:38px;height:4px;border-radius:9px;background:#e2e7f0;margin:9px auto 8px"></div>' +
    '<div data-menu="terms" style="padding:15px 20px;font-size:13px;font-weight:700;color:#1c2440;cursor:pointer">📄  이용약관 · 회사 소개</div>' +
    '<div data-menu="logout" style="padding:15px 20px;font-size:13px;font-weight:700;color:#e4544b;cursor:pointer">🚪  로그아웃</div>' +
    '</div>'
  ov.onclick = (e) => {
    const it = e.target.closest('[data-menu]')
    if (!it) { if (e.target === ov) ov.remove(); return }
    ov.remove()
    if (it.dataset.menu === 'terms') window.showScreen('s22')
    else if (it.dataset.menu === 'logout') { sb.auth.signOut().then(() => window.showScreen('s01')) }
  }
  document.body.appendChild(ov)
}

// ── 위임 클릭: data-nav / data-soon / data-back / data-notice ──
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]'); if (nav) { window.showScreen(nav.dataset.nav); if (nav.dataset.nav === 's23') loadCases(); if (nav.dataset.nav === 's05') startSelfDiag(); return }
  const back = e.target.closest('[data-back]'); if (back) { window.goBack(); return }
  const nt = e.target.closest('[data-notice]'); if (nt) { openNotice(NOTICES[nt.dataset.notice]); return }
  const yt = e.target.closest('[data-ytid]'); if (yt) { window.open('https://www.youtube.com/shorts/' + yt.dataset.ytid, '_blank', 'noopener'); return }
  const cs = e.target.closest('[data-case-id]'); if (cs) { openCaseDetail(CASES[cs.dataset.caseId]); return }
  const soon = e.target.closest('[data-soon]'); if (soon) { alert('영상은 곧 제공될 예정이에요.\n준비되면 이곳에서 감리 이야기를 영상으로 보여드릴게요.'); return }
  const fi = e.target.closest('.faq-item'); if (fi) {
    const ans = fi.querySelector('.faq-ans'), plus = fi.querySelector('.faq-plus')
    const open = ans && ans.style.display === 'none'
    if (ans) ans.style.display = open ? 'block' : 'none'
    if (plus) plus.textContent = open ? '－' : '＋'
    return
  }
})

// ── 감리사: 내 담당 단지 불러오기 ─────────────────────────
function escH(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
let AUD_APTS = {}
function auditorCard(a) {
  AUD_APTS[a.id] = a
  const stages = (window.methodStages && window.methodStages(a.method)) || null
  const tot = stages ? stages.length : (a.progress_total || 0)
  const cur = a.progress_current || 0
  const pct = tot ? Math.round(cur / tot * 100) : 0
  const st = { in_progress: ['진행중', '#1f8a5b', '#e7f5ee'], done: ['완료', '#5a6480', '#eef1f7'], scheduled: ['점검예정', '#c98a1e', '#fbf1de'] }
  const [lbl, col, bg] = st[a.status] || st.scheduled
  // 현재 공정 단계 이름
  let stageLine
  if (stages) stageLine = cur >= tot ? '✅ 공사 완료' : `현재 ${cur + 1}단계 · ${escH(stages[cur])}`
  else stageLine = escH(a.construction_type) || '공법 미지정'
  return `<div data-apt-id="${a.id}" style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:10px 11px;display:flex;gap:10px;align-items:center;cursor:pointer">
    <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(150deg,#5c86c8,#33507f);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">🏢</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(a.name)}</div>
      <div style="font-size:9.5px;color:#8b95ad;font-weight:600;margin-top:1px">${escH(a.region) || '지역 미정'} · ${escH(a.construction_type) || '종류 미정'}</div>
      <div style="font-size:10px;color:#2F6BF6;font-weight:800;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${stageLine}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px"><div style="flex:1;height:5px;border-radius:9px;background:#eef1f7;overflow:hidden"><div style="width:${pct}%;height:100%;background:#2F6BF6;border-radius:9px"></div></div><span style="font-size:9px;font-weight:800;color:#2F6BF6">${cur}/${tot}</span></div>
    </div>
    <span style="align-self:flex-start;font-size:8.5px;font-weight:800;color:${col};background:${bg};padding:3px 7px;border-radius:99px">${lbl}</span>
  </div>`
}
let AUD_LIST = []           // 불러온 담당 단지 전체
let audFilter = 'all'       // 활성 필터: all / in_progress / scheduled / done
let audQuery = ''           // 검색어
async function loadAuditorApts() {
  currentApt = null // 홈으로 오면 '단지 선택' 해제 → 일정은 개인 일정 모드
  const cont = document.getElementById('aud-apts'); if (!cont) return
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: apts, error } = await sb.from('apartments').select('*').eq('auditor_id', user.id).order('created_at', { ascending: false })
  if (error) { cont.innerHTML = '<div style="padding:20px;color:#8b95ad;font-size:12px">단지를 불러오지 못했어요</div>'; return }
  AUD_LIST = apts || []
  apts && apts.forEach(a => { AUD_APTS[a.id] = a })
  renderAudApts()
}
function renderAudApts() {
  const cont = document.getElementById('aud-apts'); if (!cont) return
  const sub = document.getElementById('aud-sub')
  if (sub) {
    const ip = AUD_LIST.filter(a => a.status === 'in_progress').length
    const sc = AUD_LIST.filter(a => a.status === 'scheduled').length
    sub.textContent = AUD_LIST.length ? `맡은 단지 ${AUD_LIST.length}곳 · 진행 ${ip} · 점검예정 ${sc}` : '배정된 단지가 아직 없어요'
  }
  if (!AUD_LIST.length) {
    cont.innerHTML = '<div style="padding:26px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 배정된 담당 단지가 없어요.<br>관리자가 단지를 배정하면 여기에 표시돼요.</div>'
    return
  }
  const q = audQuery.trim().toLowerCase()
  const list = AUD_LIST.filter(a => {
    if (audFilter !== 'all' && a.status !== audFilter) return false
    if (q) { const hay = ((a.name || '') + ' ' + (a.region || '') + ' ' + (a.construction_type || '')).toLowerCase(); if (!hay.includes(q)) return false }
    return true
  })
  cont.innerHTML = list.length
    ? list.map(auditorCard).join('')
    : '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">조건에 맞는 단지가 없어요.</div>'
}
window.loadAuditorApts = loadAuditorApts

// ── 감리보고서: 목록 · 작성 · 상세 ─────────────────────────
let currentApt = null
let REPORTS = {}

function openApt(a) {
  if (!a) return
  currentApt = a
  const nm = document.getElementById('rep-apt-name'); if (nm) nm.textContent = a.name
  renderStageTrack(a)
  window.showScreen('s08')
  loadReports(a.id)
}
// 공정 순서 체크리스트 (지금 어느 단계인지 순서대로) — 감리사/입주민 공용
function renderStageTrack(a, boxId) {
  const box = document.getElementById(boxId || 'stage-track'); if (!box) return
  const stages = (window.methodStages && window.methodStages(a.method)) || null
  if (!stages) { box.innerHTML = '<div style="background:#f6f9ff;border:1px solid #e2ebff;border-radius:13px;padding:14px 13px;font-size:11px;color:#8b95ad;font-weight:600;text-align:center">공사 공정 정보가 아직 등록되지 않았어요.</div>'; return }
  const cur = a.progress_current || 0, tot = stages.length
  const head = cur >= tot
    ? '<span style="color:#1f8a5b">✅ 모든 공정 완료</span>'
    : `현재 <b style="color:#2F6BF6">${cur + 1}단계 · ${escH(stages[cur])}</b>`
  const rows = stages.map((nm, i) => {
    let ic, cName, cSub, weight
    if (i < cur) { ic = '<span style="color:#1f8a5b">✔</span>'; cName = '#8b95ad'; cSub = '완료'; weight = '600' }
    else if (i === cur && cur < tot) { ic = '<span style="color:#2F6BF6">●</span>'; cName = '#1c2440'; cSub = '진행중'; weight = '800' }
    else { ic = '<span style="color:#c3ccdb">○</span>'; cName = '#aab2c5'; cSub = '예정'; weight = '600' }
    const subCol = cSub === '진행중' ? '#2F6BF6' : (cSub === '완료' ? '#1f8a5b' : '#aab2c5')
    const info = window.stageInfo ? window.stageInfo(nm) : null
    const caret = info ? '<span class="stg-caret" style="font-size:12px;color:#b3bccf;flex-shrink:0;width:14px;text-align:center">▾</span>' : '<span style="width:14px;flex-shrink:0"></span>'
    const panel = info ? `<div class="stg-info" style="display:none;margin:0 0 8px 22px;border-left:2px solid #cfe0ff;padding:9px 0 5px 13px">
        <div style="font-size:11px;font-weight:800;color:#2F6BF6;margin-bottom:3px">🔧 이 단계는요</div>
        <div style="font-size:11.5px;color:#3a445e;font-weight:600;line-height:1.7">${escH(info.what)}</div>
        <div style="font-size:11px;font-weight:800;color:#1f8a5b;margin:9px 0 3px">✅ 왜 할까요?</div>
        <div style="font-size:11.5px;color:#3a445e;font-weight:600;line-height:1.7">${escH(info.why)}</div>
      </div>` : ''
    return `<div class="stg-row"${info ? ' onclick="toggleStg(this)"' : ''} style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-radius:8px;${info ? 'cursor:pointer' : ''}">
      <span style="width:15px;text-align:center;font-size:12px">${ic}</span>
      <span style="flex:1;font-size:12.5px;font-weight:${weight};color:${cName};${i < cur ? 'text-decoration:line-through' : ''}">${i + 1}. ${escH(nm)}</span>
      <span style="font-size:9.5px;font-weight:800;color:${subCol}">${cSub}</span>
      ${caret}
    </div>${panel}`
  }).join('')
  const pct = tot ? Math.round(cur / tot * 100) : 0
  box.innerHTML = `<div style="background:#f6f9ff;border:1px solid #e2ebff;border-radius:13px;padding:12px 13px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:12px;font-weight:800;color:#3a445e">🛠️ 공정 순서 · ${escH(window.methodLabel(a.method))}</span>
      <span style="font-size:10.5px;font-weight:800;color:#2F6BF6">${cur}/${tot}</span>
    </div>
    <div style="height:5px;border-radius:9px;background:#e2ebff;overflow:hidden;margin-bottom:8px"><div style="width:${pct}%;height:100%;background:#2F6BF6;border-radius:9px"></div></div>
    <div style="font-size:11px;color:#5c6580;font-weight:600;margin-bottom:4px">${head}</div>
    <div style="font-size:10px;color:#8b95ad;font-weight:700;margin-bottom:8px">👆 각 단계를 누르면 무엇을·왜 하는지 알려드려요</div>
    ${rows}
  </div>`
}
// 공정 단계 펼치기/접기 (책갈피식 설명)
window.toggleStg = function (row) {
  const panel = row.nextElementSibling
  if (!panel || !panel.classList || !panel.classList.contains('stg-info')) return
  const open = panel.style.display !== 'none'
  panel.style.display = open ? 'none' : 'block'
  const c = row.querySelector('.stg-caret'); if (c) c.textContent = open ? '▾' : '▴'
  row.style.background = open ? '' : '#eaf1ff'
}
let REP_LIST = []       // 현재 단지의 보고서 전체
let repQuery = ''       // 보고서 검색어
async function loadReports(aptId) {
  const cont = document.getElementById('report-list'); if (!cont) return
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const rs = document.getElementById('rep-search'); if (rs) rs.value = ''; repQuery = ''
  const { data: reports, error } = await sb.from('reports').select('*').eq('apartment_id', aptId).order('created_at', { ascending: false })
  if (error) { cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">보고서를 불러오지 못했어요</div>'; return }
  REP_LIST = reports || []
  renderReports()
}
function renderReports() {
  const cont = document.getElementById('report-list'); if (!cont) return
  if (!REP_LIST.length) {
    cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 작성한 감리보고서가 없어요.<br>위 “＋ 감리보고서 작성”으로 첫 보고서를 남겨보세요.</div>'
    return
  }
  const q = repQuery.trim().toLowerCase()
  const list = q
    ? REP_LIST.filter(r => ((r.title || '') + ' ' + (r.stage || '') + ' ' + (r.content || '')).toLowerCase().includes(q))
    : REP_LIST
  cont.innerHTML = list.length
    ? list.map(reportCard).join('')
    : '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">검색 결과가 없어요.</div>'
}
function reportCard(r) {
  REPORTS[r.id] = r
  const d = (r.created_at || '').slice(0, 10).replace(/-/g, '.')
  const ph = Array.isArray(r.photos) ? r.photos : []
  const thumb = ph.length
    ? `<div style="width:50px;height:50px;border-radius:10px;background:url('${ph[0]}') center/cover;flex-shrink:0;position:relative"><span style="position:absolute;left:4px;bottom:4px;font-size:8px;font-weight:800;color:#fff;background:rgba(15,22,48,.5);padding:1px 5px;border-radius:5px">${ph.length}장</span></div>`
    : `<div style="width:50px;height:50px;border-radius:10px;background:#eef1f7;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">📄</div>`
  return `<div data-report-id="${r.id}" style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:10px;display:flex;gap:10px;align-items:center;cursor:pointer">${thumb}
    <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800;color:#1c2440">${escH(r.title)}</div>
    <div style="font-size:10px;color:#8b95ad;font-weight:600;margin-top:3px">${d}${r.stage ? ' · ' + escH(r.stage) : ''}${ph.length ? ' · 사진 ' + ph.length + '장' : ''}</div></div>
  </div>`
}
// 사진 업로드 (Supabase Storage)
let W_PHOTOS = []
function renderPhotoGrid() {
  const grid = document.getElementById('w-photo-grid'); if (!grid) return
  const thumbs = W_PHOTOS.map((u, i) => `<div style="aspect-ratio:1;border-radius:8px;background:url('${u}') center/cover;position:relative"><span data-rmphoto="${i}" style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#d94b4b;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</span></div>`).join('')
  const add = '<label style="aspect-ratio:1;border-radius:8px;border:2px dashed #c3ccdb;background:#fff;display:flex;align-items:center;justify-content:center;color:#9aa3b6;font-size:17px;cursor:pointer">＋<input id="w-photo-input" type="file" accept="image/*" multiple style="display:none"></label>'
  grid.innerHTML = thumbs + add
  const inp = document.getElementById('w-photo-input')
  if (inp) inp.onchange = (e) => handlePhotoSelect(e.target.files)
  grid.querySelectorAll('[data-rmphoto]').forEach(x => x.onclick = () => { W_PHOTOS.splice(+x.dataset.rmphoto, 1); renderPhotoGrid() })
}
async function handlePhotoSelect(files) {
  const { data: { user } } = await sb.auth.getUser()
  for (const file of Array.from(files)) {
    const safe = file.name.replace(/[^\w.]/g, '_')
    const path = user.id + '/' + Date.now() + '_' + Math.round(Math.random() * 1e6) + '_' + safe
    const { error } = await sb.storage.from('report-photos').upload(path, file, { upsert: false })
    if (error) { alert('사진 업로드 실패: ' + error.message); continue }
    const { data: pub } = sb.storage.from('report-photos').getPublicUrl(path)
    W_PHOTOS.push(pub.publicUrl)
    renderPhotoGrid()
  }
}
function openWrite() {
  if (!currentApt) return
  const nm = document.getElementById('w-apt-name'); if (nm) nm.textContent = currentApt.name
  const t = document.getElementById('w-title'), c = document.getElementById('w-content'), s = document.getElementById('w-stage')
  if (t) t.value = ''; if (c) c.value = ''; if (s) s.value = ''
  W_PHOTOS = []; renderPhotoGrid()
  window.showScreen('s09')
}
async function saveReport() {
  if (!currentApt) return
  const title = (document.getElementById('w-title') || {}).value?.trim()
  const content = (document.getElementById('w-content') || {}).value?.trim()
  const stage = (document.getElementById('w-stage') || {}).value?.trim()
  if (!title) { alert('제목을 입력하세요'); return }
  const { data: { user } } = await sb.auth.getUser()
  const btn = document.getElementById('w-submit'); if (btn) btn.textContent = '등록 중…'
  const { error } = await sb.from('reports').insert({ apartment_id: currentApt.id, author_id: user.id, title, content: content || null, stage: stage || null, photos: W_PHOTOS })
  if (btn) btn.textContent = '등록하기'
  if (error) { alert('등록 실패: ' + error.message); return }
  window.showScreen('s08')
  loadReports(currentApt.id)
}
function openReport(r) {
  if (!r) return
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
  set('d-title', r.title || '감리보고서')
  set('d-date', (r.created_at || '').slice(0, 10).replace(/-/g, '.'))
  const st = document.getElementById('d-stage')
  if (st) { if (r.stage) { st.textContent = r.stage; st.style.display = '' } else { st.style.display = 'none' } }
  set('d-body', r.content || '작성된 내용이 없어요.')
  // 사진 표시 — 옆으로 넘기는 스와이프 사진첩
  const ph = Array.isArray(r.photos) ? r.photos : []
  const p1 = document.getElementById('d-photo1'), p2 = document.getElementById('d-photo2')
  if (p2) p2.style.display = 'none'
  let dots = document.getElementById('d-photo-dots')
  if (ph.length && p1) {
    p1.style.display = ''
    p1.style.cssText = 'display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-radius:12px'
    // 사진 전체가 보이도록 contain (잘리지 않게) + 중립 배경
    p1.innerHTML = ph.map(u => `<div style="flex:0 0 100%;scroll-snap-align:center;height:300px;border-radius:12px;background:#eef1f7 url('${u}') center/contain no-repeat"></div>`).join('')
    if (!dots) { dots = document.createElement('div'); dots.id = 'd-photo-dots'; dots.style.cssText = 'display:flex;justify-content:center;gap:5px;margin-top:9px'; p1.after(dots) }
    dots.style.display = ph.length > 1 ? 'flex' : 'none'
    dots.innerHTML = ph.map((_, i) => `<span style="width:6px;height:6px;border-radius:50%;background:${i === 0 ? '#2F6BF6' : '#d3dae8'}"></span>`).join('')
    p1.onscroll = () => {
      const idx = Math.round(p1.scrollLeft / p1.clientWidth)
      Array.from(dots.children).forEach((d, i) => { d.style.background = i === idx ? '#2F6BF6' : '#d3dae8' })
    }
    p1.scrollLeft = 0
  } else {
    if (p1) p1.style.display = 'none'
    if (dots) dots.style.display = 'none'
  }
  // 둘째 본문 섹션(사용 안 함) 숨김
  const h2 = document.getElementById('d-h2'); if (h2) { h2.style.display = 'none'; if (h2.nextElementSibling) h2.nextElementSibling.style.display = 'none' }
  window.showScreen('s10')
}
window.openApt = openApt; window.openReport = openReport

// ── 감리사: 공사 일정 (달력) ─────────────────────────────
let schedYM = null
async function loadSchedule() {
  const { data: { user } } = await sb.auth.getUser()
  const sub = document.getElementById('s-sub'), addBtn = document.getElementById('sc-add-btn')
  if (!schedYM) { const d = new Date(); schedYM = { y: d.getFullYear(), m: d.getMonth() } }
  let scheds = []
  // 역할을 DB에서 새로 읽어 판단(캐시된 currentRole 신뢰하지 않음)
  const { data: prof } = await sb.from('profiles').select('role, apartment_id').eq('id', user.id).single()
  const isAuditor = prof && prof.role === 'auditor'
  if (!isAuditor) {
    // 입주민·관리소장: 우리 단지 일정만 (보기 전용)
    if (addBtn) addBtn.style.display = 'none'
    const form = document.getElementById('sc-form'); if (form) form.style.display = 'none'
    if (!prof || !prof.apartment_id) { if (sub) sub.textContent = '아직 배정된 단지가 없어요'; renderCalendar([]); renderSchedList([]); return }
    // 우리 단지 이름 표시
    const { data: apt } = await sb.from('apartments').select('name').eq('id', prof.apartment_id).single()
    if (sub) sub.innerHTML = (apt ? '<b style="color:#2F6BF6">' + escH(apt.name) + '</b> · ' : '') + '우리 단지 방문·점검 일정이에요'
    const { data } = await sb.from('schedules').select('*').eq('apartment_id', prof.apartment_id).order('date')
    scheds = data || []
  } else {
    // 감리사 → 내 전체 일정(개인 + 담당 단지 모두). RLS가 볼 수 있는 것만 돌려줌
    if (addBtn) addBtn.style.display = ''
    if (sub) sub.innerHTML = '<b style="color:#2F6BF6">내 전체 일정</b> &mdash; 개인 🔒 + 담당 단지 👥 를 한눈에'
    const { data } = await sb.from('schedules').select('*').order('date')
    scheds = data || []
  }
  if (isAuditor) populateSchedAptSelect()
  renderCalendar(scheds)
  renderSchedList(scheds)
}
function populateSchedAptSelect() {
  const sel = document.getElementById('sc-apt'); if (!sel) return
  const apts = Object.values(AUD_APTS)
  sel.innerHTML = '<option value="">🔒 개인 일정 (나만 봐요)</option>' +
    apts.map(a => `<option value="${a.id}">${escH(a.name)} · 단지 일정 (입주민도 봄)</option>`).join('')
  sel.value = currentApt ? currentApt.id : ''
}
function renderCalendar(scheds) {
  const { y, m } = schedYM
  const mo = document.getElementById('s-month'); if (mo) mo.textContent = y + '년 ' + (m + 1) + '월'
  const first = new Date(y, m, 1).getDay()
  const total = new Date(y, m + 1, 0).getDate()
  const today = new Date()
  const mark = {}
  scheds.forEach(s => { if (s.date) { const d = new Date(s.date); if (d.getFullYear() === y && d.getMonth() === m) mark[d.getDate()] = true } })
  let cells = ''
  for (let i = 0; i < first; i++) cells += '<span></span>'
  for (let d = 1; d <= total; d++) {
    const isT = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d
    const dot = mark[d] ? '<span style="position:absolute;left:50%;transform:translateX(-50%);bottom:1px;width:4px;height:4px;border-radius:99px;background:#2F6BF6"></span>' : ''
    const st = isT ? 'position:relative;padding:6px 0;background:#2F6BF6;color:#fff;border-radius:9px;font-weight:800' : 'position:relative;padding:6px 0'
    cells += '<span style="' + st + '">' + d + dot + '</span>'
  }
  const el = document.getElementById('s-days'); if (el) el.innerHTML = cells
}
function renderSchedList(scheds) {
  const el = document.getElementById('s-list'); if (!el) return
  if (!scheds.length) { el.innerHTML = '<div style="padding:22px 10px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">등록된 일정이 없어요.<br>“＋ 일정 추가”로 방문 일정을 남겨보세요.</div>'; return }
  const wd = ['일', '월', '화', '수', '목', '금', '토']
  el.innerHTML = scheds.map(s => {
    const d = s.date ? new Date(s.date) : null
    const ds = d ? `${d.getMonth() + 1}/${d.getDate()} (${wd[d.getDay()]})` : ''
    // 감리사만: 개인 일정인지 어느 단지 일정인지 배지로 표시
    let badge = ''
    if (currentRole === 'auditor') {
      if (s.apartment_id) {
        const apt = AUD_APTS[s.apartment_id]
        badge = `<span style="font-size:9px;font-weight:800;color:#2F6BF6;background:#e8f0ff;padding:2px 7px;border-radius:6px">👥 ${apt ? escH(apt.name) : '단지'}</span>`
      } else {
        badge = `<span style="font-size:9px;font-weight:800;color:#8b7a2f;background:#f6efd8;padding:2px 7px;border-radius:6px">🔒 개인</span>`
      }
    }
    return `<div style="border-left:3px solid #2F6BF6;background:#f8faff;border-radius:0 10px 10px 0;padding:10px 11px"><div style="display:flex;align-items:center;gap:6px"><div style="font-size:11.5px;font-weight:800;color:#1c2440">${escH(s.title)}</div>${badge ? '<span style="margin-left:auto">' + badge + '</span>' : ''}</div><div style="font-size:10px;color:#5c6580;font-weight:600;margin-top:3px">${ds}${s.description ? ' · ' + escH(s.description) : ''}</div></div>`
  }).join('')
}
async function addSchedule() {
  const { data: { user } } = await sb.auth.getUser()
  const date = document.getElementById('sc-date').value
  const title = document.getElementById('sc-title').value.trim()
  const desc = document.getElementById('sc-desc').value.trim()
  if (!date || !title) { alert('날짜와 일정 내용을 입력하세요'); return }
  const sel = document.getElementById('sc-apt')
  const aptId = sel ? sel.value : ''
  const row = { date, title, description: desc || null }
  if (aptId) { row.apartment_id = aptId; row.owner_id = null }   // 단지 일정 (입주민도 봄)
  else { row.owner_id = user.id; row.apartment_id = null }        // 개인 일정 (나만 봄)
  const { error } = await sb.from('schedules').insert(row)
  if (error) { alert('등록 실패: ' + error.message); return }
  document.getElementById('sc-date').value = ''; document.getElementById('sc-title').value = ''; document.getElementById('sc-desc').value = ''
  document.getElementById('sc-form').style.display = 'none'
  loadSchedule()
}
window.loadSchedule = loadSchedule

// 아이디 → 내부 이메일 변환 (아임웹처럼 이메일 없이 아이디만으로 가입·로그인)
const ID_DOMAIN = '@aptsquare.app'
function idToEmail(v) {
  v = (v || '').trim().toLowerCase()
  if (!v) return ''
  if (v.indexOf('@') >= 0) return v            // 이메일을 직접 입력한 경우 그대로 사용
  return v + ID_DOMAIN
}

async function doLogin() {
  const id = $('login-email').value.trim()
  const pw = $('login-pw').value
  if (!id || !pw) { setMsg('아이디와 비밀번호를 입력하세요'); return }
  setMsg('로그인 중…', true)
  const { error } = await sb.auth.signInWithPassword({ email: idToEmail(id), password: pw })
  if (error) { setMsg(ko(error.message)); return }
  setMsg('')
  route()
}

async function doSignup() {
  const id = $('login-email').value.trim()
  const pw = $('login-pw').value
  const name = $('signup-name').value.trim()
  const phone = $('signup-phone').value.trim()
  if (!id || !pw || !name) { setMsg('아이디·비밀번호·이름을 입력하세요'); return }
  if (pw.length < 6) { setMsg('비밀번호는 6자 이상으로 정해주세요'); return }
  setMsg('가입 중…', true)
  const { error } = await sb.auth.signUp({ email: idToEmail(id), password: pw, options: { data: { name, phone, username: id.toLowerCase() } } })
  if (error) { setMsg(ko(error.message)); return }
  setMsg('가입 완료! 관리자 승인 후 이용할 수 있어요.', true)
  setTimeout(() => window.showScreen('s02'), 1400)
}

// 로그인 ↔ 회원가입 모드 전환
function setMode(mode) {
  const signup = mode === 'signup'
  $('signup-fields').style.display = signup ? 'block' : 'none'
  $('auth-submit').textContent = signup ? '회원가입' : '로그인'
  $('auth-submit').dataset.mode = mode
  $('auth-toggle-signup').style.display = signup ? 'none' : 'inline'
  $('auth-toggle-login').style.display = signup ? 'inline' : 'none'
  setMsg('')
}

function wire() {
  const submit = $('auth-submit')
  if (submit) submit.onclick = () => (submit.dataset.mode === 'signup' ? doSignup() : doLogin())
  const ts = $('auth-toggle-signup'); if (ts) ts.onclick = () => setMode('signup')
  const tl = $('auth-toggle-login'); if (tl) tl.onclick = () => setMode('login')
  const out = $('logout-btn'); if (out) out.onclick = async () => { await sb.auth.signOut(); window.showScreen('s01') }
  // 감리보고서 흐름
  const rw = $('rep-write-btn'); if (rw) rw.onclick = openWrite
  const ws = $('w-submit'); if (ws) ws.onclick = saveReport
  document.addEventListener('click', (e) => {
    const c = e.target.closest('#aud-apts [data-apt-id]'); if (c) { openAuditorMenu(AUD_APTS[c.dataset.aptId]); return }
    const r = e.target.closest('[data-report-id]'); if (r) { openReport(REPORTS[r.dataset.reportId]); return }
    // 담당 단지 필터 칩 (전체/진행중/점검예정/완료)
    const f = e.target.closest('#aud-filters [data-filter]')
    if (f) {
      audFilter = f.dataset.filter
      document.querySelectorAll('#aud-filters [data-filter]').forEach(el => {
        const on = el.dataset.filter === audFilter
        el.style.color = on ? '#fff' : '#5a6480'
        el.style.background = on ? '#2F6BF6' : '#eef1f7'
        el.style.fontWeight = on ? '800' : '700'
      })
      renderAudApts(); return
    }
  })
  // 담당 단지 검색
  const as = $('aud-search'); if (as) as.oninput = () => { audQuery = as.value; renderAudApts() }
  // 감리사 단지 메뉴 (감리보고서 / 현장 사진)
  const amR = $('aud-menu-report'); if (amR) amR.onclick = () => { if (currentApt) openApt(currentApt) }
  const amF = $('aud-menu-field'); if (amF) amF.onclick = () => { if (currentApt) openAuditorField(currentApt) }
  // 현장 현황 검색 (입주민 / 감리사)
  const ffs = $('field-search'); if (ffs) ffs.oninput = renderFieldList
  const affs = $('audfield-search'); if (affs) affs.oninput = renderAudFieldList
  // 감리보고서 검색
  const rps = $('rep-search'); if (rps) rps.oninput = () => { repQuery = rps.value; renderReports() }
  // 공사 일정
  const addBtn = $('sc-add-btn'); if (addBtn) addBtn.onclick = () => { const f = $('sc-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none' }
  const scSave = $('sc-save'); if (scSave) scSave.onclick = addSchedule
  // 입주민 홈 · 빠른 메뉴
  const goSchedule = () => { showScreen('s14'); loadSchedule() }
  const icSch = $('res-ic-schedule'); if (icSch) icSch.onclick = goSchedule
  const nextCard = $('res-next-card'); if (nextCard) nextCard.onclick = goSchedule
  const icProg = $('res-ic-progress'); if (icProg) icProg.onclick = () => { window.showScreen('s24'); loadResidentProgress() }
  const icCase = $('res-ic-case'); if (icCase) icCase.onclick = () => { showScreen('s23'); loadCases() }
  const icRep = $('res-ic-report'); if (icRep) icRep.onclick = () => { showScreen('s12'); loadResidentReports() }
  const icField = $('res-ic-field'); if (icField) icField.onclick = () => { showScreen('s26'); loadFieldUpdates() }
  const menuBtn = $('res-menu-btn'); if (menuBtn) menuBtn.onclick = openResidentMenu
  const audCard = $('res-aud-card'); if (audCard) audCard.onclick = openInquiry
  const noPhone = () => alert('담당 감리사 연락처가 아직 등록되지 않았어요.\n(감리사가 회원가입 시 연락처를 입력하면 표시돼요.)')
  const qc = $('q-call'); if (qc) qc.onclick = () => { if (RES_AUD_PHONE) window.location.href = 'tel:' + RES_AUD_PHONE.replace(/[^0-9+]/g, ''); else noPhone() }
  const qs = $('q-sms'); if (qs) qs.onclick = () => { if (RES_AUD_PHONE) window.location.href = 'sms:' + RES_AUD_PHONE.replace(/[^0-9+]/g, ''); else noPhone() }
  // 하단 네비게이션 (홈 / 보고서 / 일정)
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav > div'); if (!nav) return
    const t = nav.textContent || ''
    if (t.indexOf('문의') >= 0) return // 문의는 별도 처리
    if (!currentRole) { // 비회원: 홈은 둘러보기(s04), 그 외는 로그인 유도
      if (t.indexOf('홈') >= 0) showScreen('s04'); else showScreen('s01')
      return
    }
    if (t.indexOf('홈') >= 0) {
      if (currentRole === 'auditor') { showScreen('s07'); loadAuditorApts() } else { showScreen('s11'); loadResidentHome() }
    } else if (t.indexOf('보고서') >= 0) {
      if (currentRole === 'auditor') { if (currentApt) { showScreen('s08'); loadReports(currentApt.id) } else { showScreen('s07'); loadAuditorApts() } }
    } else if (t.indexOf('진행현황') >= 0) {
      showScreen('s24'); loadResidentProgress()
    } else if (t.indexOf('일정') >= 0) {
      showScreen('s14'); loadSchedule()
    }
  })
  // 앱 열 때: 로그인돼 있으면 알맞은 화면, 아니면 비회원 둘러보기 홈(s04)
  sb.auth.getSession().then(({ data }) => { if (data.session) route(); else { window.showScreen('s04'); loadResidentNotices('s04-notices') } })
}

// ── 문의 버튼 → 홈페이지 링크 ─────────────────────────────
const INQUIRY_URL = 'https://aptsquare.net/ask'
function normText(s) { return (s || '').replace(/[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, '') }
const INQUIRY_PHRASES = ['문의', '문의하기', '1:1문의하기', '담당감리자에게문의하기', '무료상담·문의', '무료진단신청하기', '무료진단을신청해요']
function tagInquiry() {
  document.querySelectorAll('.screen *').forEach((el) => {
    if (el.childElementCount > 2) return
    if (INQUIRY_PHRASES.includes(normText(el.textContent))) {
      el.dataset.inquiry = '1'
      el.style.cursor = 'pointer'
    }
  })
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-inquiry]')
  if (el) { e.preventDefault(); window.open(INQUIRY_URL, '_blank', 'noopener') }
})

function boot() {
  try { wire() } catch (e) { console.error(e) }
  try { tagInquiry() } catch (e) { console.error(e) }
  try { wireBackArrows() } catch (e) { console.error(e) }
  try { renderVideos() } catch (e) { console.error(e) }
}
if (document.readyState !== 'loading') boot()
else document.addEventListener('DOMContentLoaded', boot)
