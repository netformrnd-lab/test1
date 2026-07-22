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
  if (/Invalid login/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요'
  if (/already registered|already been registered/i.test(m)) return '이미 가입된 이메일이에요'
  if (/Password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 해요'
  if (/valid email|invalid.*email/i.test(m)) return '이메일 형식이 올바르지 않아요'
  if (/Email not confirmed/i.test(m)) return '이메일 인증을 먼저 완료해 주세요'
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
  if (profile.role === 'auditor') { window.showScreen('s07'); loadAuditorApts() }
  else { window.showScreen('s11'); loadResidentHome() }
}
let currentRole = null

// ── 입주민·관리소장 홈: 우리 단지 정보 불러오기 ─────────────
async function loadResidentHome() {
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
  if (!prof || !prof.apartment_id) return
  const { data: apt } = await sb.from('apartments').select('*').eq('id', prof.apartment_id).single()
  if (!apt) return
  const nm = document.getElementById('res-apt-name'); if (nm) nm.textContent = apt.name
  const cur = apt.progress_current || 0, tot = apt.progress_total || 0, pct = tot ? Math.round(cur / tot * 100) : 0
  const pg = document.getElementById('res-prog'); if (pg) pg.innerHTML = cur + '<span style="opacity:.55">/' + tot + '</span>'
  const bar = document.getElementById('res-bar'); if (bar) bar.style.width = pct + '%'
  // 담당 감리사 이름 (PII 노출 없이 이름만 반환하는 함수 사용)
  if (apt.auditor_id) {
    const { data: audName } = await sb.rpc('apartment_auditor_name', { apt: apt.id })
    if (audName) {
      const an = document.getElementById('res-aud-name'); if (an) an.textContent = audName
      const av = document.getElementById('res-aud-av'); if (av) av.textContent = String(audName).slice(0, 1)
    }
  }
}
window.loadResidentHome = loadResidentHome

// ── 감리사: 내 담당 단지 불러오기 ─────────────────────────
function escH(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
let AUD_APTS = {}
function auditorCard(a) {
  AUD_APTS[a.id] = a
  const cur = a.progress_current || 0, tot = a.progress_total || 0
  const pct = tot ? Math.round(cur / tot * 100) : 0
  const st = { in_progress: ['진행중', '#1f8a5b', '#e7f5ee'], done: ['완료', '#5a6480', '#eef1f7'], scheduled: ['점검예정', '#c98a1e', '#fbf1de'] }
  const [lbl, col, bg] = st[a.status] || st.scheduled
  return `<div data-apt-id="${a.id}" style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:10px 11px;display:flex;gap:10px;align-items:center;cursor:pointer">
    <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(150deg,#5c86c8,#33507f);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">🏢</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(a.name)}</div>
      <div style="font-size:9.5px;color:#8b95ad;font-weight:600;margin-top:1px">${escH(a.region) || '지역 미정'} · ${escH(a.construction_type) || '종류 미정'}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px"><div style="flex:1;height:5px;border-radius:9px;background:#eef1f7;overflow:hidden"><div style="width:${pct}%;height:100%;background:#2F6BF6;border-radius:9px"></div></div><span style="font-size:9px;font-weight:800;color:#2F6BF6">${cur}/${tot}</span></div>
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
  window.showScreen('s08')
  loadReports(a.id)
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
    p1.innerHTML = ph.map(u => `<div style="flex:0 0 100%;scroll-snap-align:center;aspect-ratio:4/3;border-radius:12px;background:url('${u}') center/cover"></div>`).join('')
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
  if (currentRole !== 'auditor') {
    // 입주민·관리소장: 우리 단지 일정 (보기만)
    if (addBtn) addBtn.style.display = 'none'
    const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
    if (!prof || !prof.apartment_id) { if (sub) sub.textContent = '아직 배정된 단지가 없어요'; renderCalendar([]); renderSchedList([]); return }
    if (sub) sub.textContent = '우리 단지 방문·점검 일정이에요'
    const { data } = await sb.from('schedules').select('*').eq('apartment_id', prof.apartment_id).order('date')
    scheds = data || []
  } else {
    // 감리사 → 내 전체 일정(개인 + 담당 단지 모두). RLS가 볼 수 있는 것만 돌려줌
    if (addBtn) addBtn.style.display = ''
    if (sub) sub.innerHTML = '<b style="color:#2F6BF6">내 전체 일정</b> &mdash; 개인 🔒 + 담당 단지 👥 를 한눈에'
    const { data } = await sb.from('schedules').select('*').order('date')
    scheds = data || []
  }
  if (currentRole === 'auditor') populateSchedAptSelect()
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

async function doLogin() {
  const email = $('login-email').value.trim()
  const pw = $('login-pw').value
  if (!email || !pw) { setMsg('이메일과 비밀번호를 입력하세요'); return }
  setMsg('로그인 중…', true)
  const { error } = await sb.auth.signInWithPassword({ email, password: pw })
  if (error) { setMsg(ko(error.message)); return }
  setMsg('')
  route()
}

async function doSignup() {
  const email = $('login-email').value.trim()
  const pw = $('login-pw').value
  const name = $('signup-name').value.trim()
  const phone = $('signup-phone').value.trim()
  if (!email || !pw || !name) { setMsg('이메일·비밀번호·이름을 입력하세요'); return }
  setMsg('가입 중…', true)
  const { error } = await sb.auth.signUp({ email, password: pw, options: { data: { name, phone } } })
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
    const c = e.target.closest('#aud-apts [data-apt-id]'); if (c) { openApt(AUD_APTS[c.dataset.aptId]); return }
    const r = e.target.closest('#report-list [data-report-id]'); if (r) { openReport(REPORTS[r.dataset.reportId]); return }
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
  // 감리보고서 검색
  const rps = $('rep-search'); if (rps) rps.oninput = () => { repQuery = rps.value; renderReports() }
  // 공사 일정
  const addBtn = $('sc-add-btn'); if (addBtn) addBtn.onclick = () => { const f = $('sc-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none' }
  const scSave = $('sc-save'); if (scSave) scSave.onclick = addSchedule
  // 하단 네비게이션 (홈 / 보고서 / 일정)
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav > div'); if (!nav) return
    const t = nav.textContent || ''
    if (t.indexOf('문의') >= 0) return // 문의는 별도 처리
    if (t.indexOf('홈') >= 0) {
      if (currentRole === 'auditor') { showScreen('s07'); loadAuditorApts() } else { showScreen('s11'); loadResidentHome() }
    } else if (t.indexOf('보고서') >= 0) {
      if (currentRole === 'auditor') { if (currentApt) { showScreen('s08'); loadReports(currentApt.id) } else { showScreen('s07'); loadAuditorApts() } }
    } else if (t.indexOf('일정') >= 0) {
      showScreen('s14'); loadSchedule()
    }
  })
  // 앱 열 때 이미 로그인돼 있으면 알맞은 화면으로
  sb.auth.getSession().then(({ data }) => { if (data.session) route() })
}

// ── 문의 버튼 → 홈페이지 링크 ─────────────────────────────
const INQUIRY_URL = 'https://aptsquare.net/ask'
function normText(s) { return (s || '').replace(/[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, '') }
const INQUIRY_PHRASES = ['문의', '문의하기', '1:1문의하기', '담당감리자에게문의하기', '무료상담·문의']
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

function boot() { wire(); tagInquiry() }
if (document.readyState !== 'loading') boot()
else document.addEventListener('DOMContentLoaded', boot)
