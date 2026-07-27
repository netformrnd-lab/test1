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
  MY_ID = user.id; MY_NAME = profile.name || ''
  applyRoleNav(profile.role)
  // 현장 점검 저장 후 돌아왔을 때: 해당 단지 감리일지 목록으로 바로 이동
  const openAptId = new URLSearchParams(location.search).get('openApt')
  if (openAptId && profile.role === 'auditor') {
    try {
      history.replaceState(null, '', location.pathname)
      const { data: apt } = await sb.from('apartments').select('*').eq('id', openAptId).single()
      if (apt) { NAV_HIST.length = 0; NAV_HIST.push('s07'); openApt(apt); loadAuditorApts(); return }
    } catch (e) {}
  }
  if (profile.role === 'auditor') { window.showScreen('s07'); loadAuditorApts() }
  else { window.showScreen('s11'); loadResidentHome() }
}
let currentRole = null
let MY_ID = null, MY_NAME = ''

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
  checkSurveyBanner(apt)
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
// 동(棟) 추출: dong 컬럼 우선, 없으면 제목/내용에서 'N동' 자동 추출
function fieldDong(f) {
  if (f.dong) return f.dong
  const m = ((f.title || '') + ' ' + (f.content || '')).match(/(\d{1,3})\s*동/)
  return m ? (m[1] + '동') : '기타'
}
function dongList(items) {
  return [...new Set(items.map(fieldDong))].sort((a, b) => { const na = parseInt(a), nb = parseInt(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; if (!isNaN(na)) return -1; if (!isNaN(nb)) return 1; return a.localeCompare(b, 'ko') })
}
function dongBar(items, sel, fn) {
  const dongs = dongList(items)
  if (dongs.length <= 1) return ''
  const chip = (val, label, on) => `<span onclick="${fn}('${val}')" style="cursor:pointer;font-size:11px;font-weight:${on ? '800' : '700'};color:${on ? '#fff' : '#5a6480'};background:${on ? '#2F6BF6' : '#eef1f7'};padding:6px 13px;border-radius:99px;white-space:nowrap">${label}</span>`
  return `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:11px;scrollbar-width:none">${chip('', '전체', !sel)}${dongs.map(d => chip(d, d, sel === d)).join('')}</div>`
}
let FIELD_LIST = []       // 입주민 현장 현황 전체
let FIELD_DONG = ''
window.selectFieldDong = function (d) { FIELD_DONG = d; renderFieldList() }
function renderFieldList() {
  const cont = document.getElementById('field-list'); if (!cont) return
  const q = ((document.getElementById('field-search') || {}).value || '').trim().toLowerCase()
  let list = q ? FIELD_LIST.filter(f => ((f.title || '') + ' ' + (f.content || '')).toLowerCase().includes(q)) : FIELD_LIST
  const bar = dongBar(FIELD_LIST, FIELD_DONG, 'selectFieldDong')
  if (FIELD_DONG) list = list.filter(f => fieldDong(f) === FIELD_DONG)
  if (!list.length) { cont.innerHTML = bar + '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">' + (q || FIELD_DONG ? '해당 사진이 없어요.' : '아직 등록된 현장 기록이 없어요.<br>새 현장 사진이 올라오면 여기에 표시돼요.') + '</div>'; return }
  cont.innerHTML = bar + list.map(reportCard).join('')
}
// 현장 현황 상단: 공정 진행 단계 요약 (탭하면 s24 상세)
function renderFieldProgress(apt) {
  const box = document.getElementById('field-prog'); if (!box) return
  const stages = (apt && window.methodStages && window.methodStages(apt.method)) || null
  if (!stages) { box.style.display = 'none'; return }
  const cur = apt.progress_current || 0, tot = stages.length
  const pct = tot ? Math.round(Math.min(cur, tot) / tot * 100) : 0
  const pctEl = document.getElementById('field-prog-pct'); if (pctEl) pctEl.textContent = Math.min(cur, tot) + '/' + tot + ' 단계'
  const barEl = document.getElementById('field-prog-bar'); if (barEl) barEl.style.width = pct + '%'
  const capEl = document.getElementById('field-prog-cap')
  if (capEl) capEl.textContent = cur >= tot ? '✅ 모든 공정 완료' : ('현재 ' + (cur + 1) + '단계 · ' + stages[cur])
  box.style.display = 'block'
}
async function loadFieldUpdates() {
  const cont = document.getElementById('field-list'); if (!cont) return
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const fs = document.getElementById('field-search'); if (fs) fs.value = ''
  FIELD_DONG = ''
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
  const hdr = document.getElementById('field-apt')
  if (!prof || !prof.apartment_id) { if (hdr) hdr.textContent = '배정된 단지 없음'; FIELD_LIST = []; cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">배정된 단지가 없어요.</div>'; return }
  const { data: apt } = await sb.from('apartments').select('*').eq('id', prof.apartment_id).single()
  if (apt) RES_APT = apt
  if (hdr) hdr.textContent = apt ? apt.name : '우리 단지'
  renderFieldProgress(apt)
  checkSurveyBanner(apt)
  const { data } = await sb.from('field_updates').select('*').eq('apartment_id', prof.apartment_id).order('created_at', { ascending: false })
  FIELD_LIST = data || []
  renderFieldList()
}
// 감리사: 단지 선택 후 메뉴 (감리일지 / 현장 사진)
async function openAuditorMenu(a) {
  if (!a) return
  currentApt = a
  const nm = document.getElementById('aud-menu-apt'); if (nm) nm.textContent = a.name
  window.showScreen('s27')
}
window.openAuditorMenu = openAuditorMenu
// 감리사: 이 단지 현장 사진 목록
let AUDFIELD_LIST = []
let AUD_DONG = ''
window.selectAudDong = function (d) { AUD_DONG = d; renderAudFieldList() }
function renderAudFieldList() {
  const cont = document.getElementById('audfield-list'); if (!cont) return
  const q = ((document.getElementById('audfield-search') || {}).value || '').trim().toLowerCase()
  let list = q ? AUDFIELD_LIST.filter(f => ((f.title || '') + ' ' + (f.content || '')).toLowerCase().includes(q)) : AUDFIELD_LIST
  const bar = dongBar(AUDFIELD_LIST, AUD_DONG, 'selectAudDong')
  if (AUD_DONG) list = list.filter(f => fieldDong(f) === AUD_DONG)
  if (!list.length) { cont.innerHTML = bar + '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">' + (q || AUD_DONG ? '해당 사진이 없어요.' : '아직 이 단지에 등록된 현장 사진이 없어요.') + '</div>'; return }
  cont.innerHTML = bar + list.map(reportCard).join('')
}
async function openAuditorField(a) {
  if (!a) return
  const cont = document.getElementById('audfield-list'); if (!cont) return
  const hdr = document.getElementById('audfield-apt'); if (hdr) hdr.textContent = a.name
  const fs = document.getElementById('audfield-search'); if (fs) fs.value = ''
  AUD_DONG = ''
  window.showScreen('s28')
  cont.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data } = await sb.from('field_updates').select('*').eq('apartment_id', a.id).order('created_at', { ascending: false })
  AUDFIELD_LIST = data || []
  renderAudFieldList()
}
window.openAuditorField = openAuditorField

/* ===== 미팅 자료 (첫 미팅 질문리스트 / 내부 상담 체크리스트) ===== */
// ⚠️ 아래 항목은 임시 틀입니다. 실제 질문·체크 항목은 추후 교체 예정.
const MEET_DOCS = {
  first: {
    title: '첫 미팅 질문리스트',
    intro: '단지 관계자(관리소장·입주자대표)와 첫 미팅에서 확인할 항목이에요.',
    sections: [
      { h: '① 단지 기본 정보', items: ['준공 연도 / 총 세대수 / 동 수', '최근 대규모 수선 이력', '장기수선충당금 적립 현황'] },
      { h: '② 하자·현황', items: ['현재 가장 문제되는 하자 부위', '과거 보수 이력과 재발 여부', '누수·균열 관련 민원 빈도'] },
      { h: '③ 공사 범위·예산', items: ['이번에 검토 중인 공사 종류', '예상 예산 규모 / 확보 여부', '우선순위(꼭 해야 할 것 / 미룰 수 있는 것)'] },
      { h: '④ 의사결정·일정', items: ['의사결정 구조(입대의 의결 등)', '희망 착공 시기 / 제약 일정', '주민 동의·공지 방식'] },
      { h: '⑤ 감리 진행', items: ['감리 방문 가능 요일·시간', '현장 출입·주차 방법', '비상 연락 담당자'] }
    ]
  },
  internal: {
    title: '내부 상담 체크리스트',
    intro: '상담을 진행하며 우리가 빠짐없이 챙겨야 할 항목이에요.',
    sections: [
      { h: '① 상담 전 준비', items: ['단지 위치·규모 사전 조사', '유사 단지 시공 사례 준비', '견적 기준표·계약서 양식 지참'] },
      { h: '② 현장 확인', items: ['하자 부위 사진 촬영(전경·근접)', '공법 적용 가능성 검토', '안전·접근성 확인'] },
      { h: '③ 제안·설명', items: ['공법별 장단점 쉽게 설명', '예상 공사기간·비용 안내', '감리의 역할·이점 설명'] },
      { h: '④ 마무리', items: ['다음 미팅·현장 방문 일정 확정', '필요 서류 안내', '담당자 연락처 교환'] }
    ]
  }
}
function openMeetingDoc(type) {
  const doc = MEET_DOCS[type]; if (!doc) return
  const t = document.getElementById('meetdoc-title'); if (t) t.textContent = doc.title
  const body = document.getElementById('meetdoc-body'); if (!body) return
  body.innerHTML = `<div style="background:#fff;border:1px solid #eef1f7;border-radius:14px;padding:16px 15px">
      <div style="font-size:16px;font-weight:800;color:#141d34">${escH(doc.title)}</div>
      <div style="font-size:11.5px;color:#5c6580;font-weight:600;line-height:1.6;margin:6px 0 4px">${escH(doc.intro)}</div>
      <div style="font-size:10px;color:#aab2c4;font-weight:700;margin-bottom:6px">👆 항목을 누르면 체크돼요 · 실제 내용은 추후 업데이트됩니다</div>
      ${doc.sections.map(s => `<div style="margin-top:13px">
        <div style="font-size:12.5px;font-weight:800;color:#2F6BF6;margin-bottom:7px">${escH(s.h)}</div>
        ${s.items.map(it => `<div onclick="toggleCheck(this)" style="display:flex;align-items:flex-start;gap:9px;padding:9px 10px;background:#f7f9fc;border:1px solid #eef1f7;border-radius:10px;margin-bottom:6px;cursor:pointer">
          <span class="ck-box" style="width:18px;height:18px;border-radius:6px;border:2px solid #c3ccdb;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:800"></span>
          <span class="ck-txt" style="flex:1;font-size:12.5px;font-weight:600;color:#3a445e;line-height:1.55">${escH(it)}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>`
  window.showScreen('s30')
}
window.openMeetingDoc = openMeetingDoc
window.toggleCheck = function (row) {
  const on = row.dataset.on === '1'
  row.dataset.on = on ? '' : '1'
  const box = row.querySelector('.ck-box'), txt = row.querySelector('.ck-txt')
  if (on) { box.style.background = '#fff'; box.style.borderColor = '#c3ccdb'; box.textContent = ''; txt.style.color = '#3a445e'; txt.style.textDecoration = ''; row.style.background = '#f7f9fc' }
  else { box.style.background = '#1f8a5b'; box.style.borderColor = '#1f8a5b'; box.textContent = '✓'; txt.style.color = '#8b95ad'; txt.style.textDecoration = 'line-through'; row.style.background = '#eafaf2' }
}

/* ===== 소장님 작성지 (작성 링크를 소장님께 전송) ===== */
// 소장님이 열어서 직접 채우는 공개 폼 페이지 (같은 도메인의 /form/)
function managerFormUrl() {
  const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'form/'
  const name = currentApt ? currentApt.name : ''
  const params = []
  if (name) params.push('apt=' + encodeURIComponent(name))
  if (currentApt && currentApt.id) params.push('aptid=' + encodeURIComponent(currentApt.id))
  return base + (params.length ? '?' + params.join('&') : '')
}
function openManagerDoc() {
  const ap = document.getElementById('mgr-apt'); if (ap) ap.textContent = currentApt ? currentApt.name : '단지'
  const url = managerFormUrl()
  const lk = document.getElementById('mgr-link'); if (lk) lk.textContent = url
  const m = document.getElementById('mgr-msg'); if (m) m.textContent = ''
  const fb = document.getElementById('mgr-fallback'); if (fb) fb.remove()
  window.showScreen('s31')
}
window.openManagerDoc = openManagerDoc
// 받은 작성지 화면 (소장님이 제출한 내용)
function openReceivedForms() {
  const ap = document.getElementById('recv-apt'); if (ap) ap.textContent = currentApt ? currentApt.name : '단지'
  window.showScreen('s32')
  loadManagerForms()
}
window.openReceivedForms = openReceivedForms
// 이 단지의 제출된 소장님 작성지 목록
const MGR_LABELS = { writer_name: '작성자', phone: '연락처', households: '세대수/동수', built_year: '준공연도', issue: '주요 하자·불편', request: '요청·희망', wish_when: '희망 시기' }
async function loadManagerForms() {
  const box = document.getElementById('mgr-received'); if (!box) return
  box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px;font-weight:600">불러오는 중…</div>'
  if (!currentApt) { box.innerHTML = ''; return }
  let q = sb.from('manager_forms').select('*').order('created_at', { ascending: false })
  q = currentApt.id ? q.eq('apartment_id', currentApt.id) : q.eq('apt_name', currentApt.name)
  const { data, error } = await q
  if (error) { box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px;font-weight:600">불러오지 못했어요 (DB 준비 필요)</div>'; return }
  renderManagerForms(data || [])
}
function renderManagerForms(list) {
  const box = document.getElementById('mgr-received'); if (!box) return
  if (!list.length) {
    box.innerHTML = '<div style="padding:18px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 받은 작성지가 없어요.<br>위 링크를 소장님께 보내면 여기에 쌓여요.</div>'
    return
  }
  const name = currentApt ? currentApt.name : '단지'
  const items = list.map(r => {
    const d = (r.created_at || '').slice(0, 10).replace(/-/g, '.')
    const rows = Object.keys(MGR_LABELS).map(k => {
      const v = r[k]; if (!v) return ''
      return `<div style="display:flex;gap:8px;padding:4px 0"><span style="width:66px;flex-shrink:0;font-size:10.5px;font-weight:800;color:#8b95ad">${MGR_LABELS[k]}</span><span style="flex:1;font-size:12px;font-weight:600;color:#2a3350;line-height:1.55;white-space:pre-wrap">${escH(v)}</span></div>`
    }).join('')
    return `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:12px;padding:13px 14px;margin-top:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12.5px;font-weight:800;color:#141d34">📝 ${escH(r.writer_name) || '(작성자 미기재)'}</span>
        <span style="font-size:10px;color:#aab2c4;font-weight:700">${d}</span>
      </div>${rows}</div>`
  }).join('')
  box.innerHTML = `<div>
    <div onclick="toggleMgrRecv(this)" style="cursor:pointer;background:#eef4ff;border:1px solid #d7e3fb;border-radius:11px;padding:12px 13px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:12.5px;font-weight:800;color:#2F6BF6">🏢 ${escH(name)} <span style="font-size:10.5px;font-weight:700;opacity:.8">${list.length}건</span></span>
      <span class="mgr-recv-caret" style="font-size:12px;color:#2F6BF6">▾</span>
    </div>
    <div class="mgr-recv-body" style="display:none">${items}</div>
  </div>`
}
window.toggleMgrRecv = function (head) {
  const b = head.nextElementSibling; if (!b) return
  const open = b.style.display !== 'none'
  b.style.display = open ? 'none' : 'block'
  const c = head.querySelector('.mgr-recv-caret'); if (c) c.textContent = open ? '▾' : '▴'
}
function mgrMsg(html, ok) {
  const m = document.getElementById('mgr-msg'); if (!m) return
  m.style.color = ok ? '#1f8a5b' : '#e4544b'; m.innerHTML = html
}
// 링크 복사 (clipboard → execCommand → 화면 표시 폴백)
async function copyManagerDoc() {
  const url = managerFormUrl()
  let ok = false
  try { await navigator.clipboard.writeText(url); ok = true }
  catch (e) {
    try {
      const ta = document.createElement('textarea')
      ta.value = url; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      ok = document.execCommand('copy'); ta.remove()
    } catch (_) { ok = false }
  }
  if (ok) mgrMsg('✅ 링크 복사 완료! 카카오톡에 <b>붙여넣기</b> 해서 소장님께 보내세요.', true)
  else { mgrMsg('복사가 안 됐어요. 아래 링크를 길게 눌러 복사하세요.', false); showManagerFallback(url) }
}
window.copyManagerDoc = copyManagerDoc
// 복사 실패 시: 링크를 화면에 띄워 직접 복사하도록
function showManagerFallback(url) {
  let box = document.getElementById('mgr-fallback')
  if (!box) {
    box = document.createElement('input'); box.id = 'mgr-fallback'; box.readOnly = true
    box.style.cssText = 'width:100%;box-sizing:border-box;margin-top:8px;padding:11px;border:1.5px solid #FEE500;border-radius:10px;font-size:12px;font-family:inherit'
    const m = document.getElementById('mgr-msg'); if (m && m.parentNode) m.parentNode.insertBefore(box, m.nextSibling)
  }
  box.value = url; box.focus(); box.select()
}
// 링크 공유 우선 (제일 편함) → 공유 미지원/실패 시 자동으로 복사로
async function shareManagerDoc() {
  const url = managerFormUrl()
  const name = currentApt ? currentApt.name : ''
  const text = '[아파트스퀘어] ' + (name ? name + ' ' : '') + '관리소장님 작성지입니다. 아래 링크를 열어 간단히 작성해 주세요.'
  if (navigator.share) {
    try { await navigator.share({ title: '관리소장님 작성지', text, url }); return }
    catch (e) { if (e && e.name === 'AbortError') return }  // 취소는 무시, 그 외엔 복사로
  }
  copyManagerDoc()
}
window.shareManagerDoc = shareManagerDoc
// 소장님 작성 화면 미리보기 (새 탭)
function previewManagerForm() { window.open(managerFormUrl(), '_blank') }
window.previewManagerForm = previewManagerForm

// 입주민: 공개된 우리 단지 감리일지 목록
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
  if (!data || !data.length) { cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 공개된 감리일지가 없어요.<br>감리가 확인을 마치면 여기에 올라와요.</div>'; return }
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
  // 채팅 목록으로 돌아오면 안 읽음 배지를 즉시 최신화
  if (id === 's36' && typeof renderAuditorChatList === 'function') { try { renderAuditorChatList() } catch (e) {} }
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
  data.forEach(n => { NOTICES[n.id] = n })
  box.innerHTML = data.map((n, i) => {
    const d = (n.created_at || '').slice(2, 10).replace(/-/g, '.')
    const line = i < data.length - 1 ? 'border-bottom:1px solid #f0f2f7;' : ''
    return `<div data-notice="${n.id}" style="cursor:pointer;display:flex;justify-content:space-between;gap:8px;padding:12px 13px;${line}"><span style="font-size:12.5px;font-weight:600;color:#3a445e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(n.title)}</span><span style="font-size:10.5px;color:#aab2c4;font-weight:600;flex-shrink:0">${d}</span></div>`
  }).join('')
}
// 공지사항 전체 화면 (전체보기 → 별도 목록 화면)
async function openNoticeList() {
  window.showScreen('s38')
  const box = document.getElementById('notice-list'); if (!box) return
  box.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data } = await sb.from('notices').select('*').order('created_at', { ascending: false }).limit(100)
  if (!data || !data.length) { box.innerHTML = '<div style="padding:26px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">등록된 공지사항이 없어요.</div>'; return }
  data.forEach(n => { NOTICES[n.id] = n })
  box.innerHTML = data.map((n) => {
    const d = (n.created_at || '').slice(0, 10).replace(/-/g, '.')
    const body = (n.body || '').replace(/\s+/g, ' ').trim()
    return `<div data-notice="${n.id}" style="cursor:pointer;background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:13px 14px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:13px;font-weight:800;color:#1c2440;line-height:1.4">${escH(n.title)}</span><span style="font-size:10px;color:#aab2c4;font-weight:700;flex-shrink:0">${d}</span></div>${body ? `<div style="font-size:11.5px;color:#8b95ad;font-weight:600;margin-top:5px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(body)}</div>` : ''}</div>`
  }).join('')
}
window.openNoticeList = openNoticeList

/* ===== 공사 완료 후 만족도 조사 ===== */
const SURVEY_ITEMS = [
  { key: 'r_comm', label: '감리 소통', desc: '연락·설명이 잘 됐나요?' },
  { key: 'r_site', label: '현장 관리·안전', desc: '현장이 안전하게 관리됐나요?' },
  { key: 'r_defect', label: '하자 대응', desc: '하자를 잘 잡아냈나요?' },
  { key: 'r_quality', label: '시공 품질', desc: '마감·품질이 만족스러웠나요?' }
]
let SURVEY = null // { apt, overall, r_comm.., best, again, comment } — best/again은 자유 입력
// 공사 완료 여부: status='done' 또는 공정 단계가 모두 끝남
function isConstructionDone(apt) {
  if (!apt) return false
  if (apt.status === 'done') return true
  const stages = (window.methodStages && window.methodStages(apt.method)) || null
  if (stages && (apt.progress_current || 0) >= stages.length) return true
  return false
}
function surveyKey(aptId) { return 'aptsq_survey_' + aptId }
// 홈·현장현황 상단 만족도 배너 표시 여부
async function checkSurveyBanner(apt) {
  const homeB = document.getElementById('res-survey-banner')
  const fieldB = document.getElementById('field-survey-banner')
  const show = (on) => { if (homeB) homeB.style.display = on ? 'flex' : 'none'; if (fieldB) fieldB.style.display = on ? 'block' : 'none' }
  if (!apt || !isConstructionDone(apt)) { show(false); return }
  // 이미 참여했으면 배너 숨김 (로컬 우선, DB로 확인)
  if (localStorage.getItem(surveyKey(apt.id))) { show(false); return }
  try {
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data } = await sb.from('surveys').select('id').eq('apartment_id', apt.id).eq('respondent_id', user.id).limit(1)
      if (data && data.length) { localStorage.setItem(surveyKey(apt.id), '1'); show(false); return }
    }
  } catch (e) {}
  show(true)
}
window.checkSurveyBanner = checkSurveyBanner
// 별점 위젯 HTML
function starRow(key, val) {
  let s = ''
  for (let i = 1; i <= 5; i++) {
    const on = i <= val
    s += `<span onclick="svSetStar('${key}',${i})" style="cursor:pointer;font-size:27px;line-height:1;color:${on ? '#F5A623' : '#dfe3ec'}">★</span>`
  }
  return `<div style="display:flex;gap:4px">${s}</div>`
}
// 별점 변경 시에도 자유 입력 값이 날아가지 않도록 현재 textarea 값을 먼저 보존
window.svSetStar = function (key, v) {
  if (!SURVEY) return
  const be = document.getElementById('sv-best'); if (be) SURVEY.best = be.value
  const ag = document.getElementById('sv-again'); if (ag) SURVEY.again = ag.value
  const cm = document.getElementById('sv-comment'); if (cm) SURVEY.comment = cm.value
  SURVEY[key] = v; renderSurveyForm()
}
async function openSurvey() {
  let apt = RES_APT
  if (!apt) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) { showScreen('s01'); return }
    const { data: prof } = await sb.from('profiles').select('apartment_id').eq('id', user.id).single()
    if (prof && prof.apartment_id) { const { data } = await sb.from('apartments').select('*').eq('id', prof.apartment_id).single(); apt = data; RES_APT = data }
  }
  const nm = document.getElementById('survey-apt'); if (nm) nm.textContent = apt ? apt.name : '우리 단지'
  window.showScreen('s39')
  const body = document.getElementById('survey-body')
  if (!apt) { if (body) body.innerHTML = '<div style="padding:24px;text-align:center;color:#8b95ad;font-size:12px">배정된 단지가 없어요.</div>'; return }
  // 이미 참여했는지 확인
  if (body) body.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:22px">불러오는 중…</div>'
  try {
    const { data: { user } } = await sb.auth.getUser()
    const { data } = await sb.from('surveys').select('id').eq('apartment_id', apt.id).eq('respondent_id', user.id).limit(1)
    if (data && data.length) { localStorage.setItem(surveyKey(apt.id), '1'); renderSurveyDone(); return }
  } catch (e) {}
  SURVEY = { apt: apt, overall: 0, r_comm: 0, r_site: 0, r_defect: 0, r_quality: 0, best: '', again: '', comment: '' }
  renderSurveyForm()
}
window.openSurvey = openSurvey
function renderSurveyDone(justSubmitted) {
  const body = document.getElementById('survey-body'); if (!body) return
  const title = justSubmitted ? '소중한 평가, 감사합니다' : '이미 참여해 주셨어요'
  const msg = justSubmitted
    ? '남겨주신 한마디 한마디를 감리사와 함께 깊이 새기겠습니다.<br><br>아파트스퀘어는 눈에 보이지 않는 곳까지 <b style="color:#F5A623">끝까지 곁에서 꼼꼼하게</b> 확인하는, 믿을 수 있는 감리로 늘 함께하겠습니다.'
    : '이미 소중한 의견을 남겨주셨어요.<br><br>보내주신 신뢰에 보답하는 마음으로, 아파트스퀘어는 <b style="color:#F5A623">한 단계 한 단계</b> 정직하게 확인하며 함께하겠습니다.'
  body.innerHTML = '<div style="text-align:center;padding:44px 24px">'
    + '<div style="font-size:52px;margin-bottom:14px">' + (justSubmitted ? '🎉' : '🙏') + '</div>'
    + '<div style="font-size:17px;font-weight:800;color:#1c2440">' + title + '</div>'
    + '<div style="font-size:13px;color:#5c6580;font-weight:600;margin-top:13px;line-height:1.85;word-break:keep-all;max-width:280px;margin-left:auto;margin-right:auto">' + msg + '</div>'
    + '<div style="margin-top:22px;display:inline-flex;align-items:center;gap:6px;background:#fff8ec;border:1px solid #f6e2bd;color:#a9791b;font-size:11px;font-weight:800;padding:8px 14px;border-radius:99px">⭐ 아파트스퀘어 · 감리 토탈 솔루션</div>'
    + '<div onclick="showScreen(currentRole===\'manager\'||currentRole===\'resident\'?\'s11\':\'s11\');loadResidentHome()" style="cursor:pointer;margin-top:24px;font-size:13px;font-weight:800;color:#2F6BF6">홈으로 돌아가기 ›</div>'
    + '</div>'
}
function renderSurveyForm() {
  const body = document.getElementById('survey-body'); if (!body || !SURVEY) return
  const sec = (t) => `<div style="font-size:13px;font-weight:800;color:#1c2440;margin:0 0 10px">${t}</div>`
  const card = (inner) => `<div style="background:#fff;border:1px solid #eef1f7;border-radius:14px;padding:15px;margin-bottom:12px">${inner}</div>`
  const chip = (label, on, fn) => `<span onclick="${fn}('${label}')" style="cursor:pointer;font-size:12px;font-weight:${on ? '800' : '700'};color:${on ? '#fff' : '#5a6480'};background:${on ? '#F5A623' : '#f0f2f7'};padding:8px 13px;border-radius:99px;white-space:nowrap;display:inline-block;margin:0 6px 6px 0">${label}</span>`
  let html = ''
  html += card(sec('전체 만족도는 어떠셨나요?') + '<div style="display:flex;justify-content:center;padding:4px 0">' + starRow('overall', SURVEY.overall) + '</div>')
  let items = SURVEY_ITEMS.map(it => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #f4f6fa"><div style="min-width:0"><div style="font-size:12.5px;font-weight:800;color:#26314d">${it.label}</div><div style="font-size:10px;color:#9aa3b6;font-weight:600;margin-top:1px">${it.desc}</div></div>${starRow(it.key, SURVEY[it.key])}</div>`).join('')
  html += card(sec('항목별 평가') + items)
  const taStyle = 'width:100%;box-sizing:border-box;resize:none;border:1px solid #e1e7f0;border-radius:11px;padding:11px 12px;font-size:13px;font-family:inherit;outline:none;line-height:1.5;background:#f7f9fc'
  html += card(sec('가장 만족스러웠던 점은? <span style="font-weight:600;color:#9aa3b6;font-size:11px">(자유롭게)</span>') + `<textarea id="sv-best" rows="2" placeholder="예: 하자를 꼼꼼히 잡아준 점이 가장 좋았어요" style="${taStyle}">${escH(SURVEY.best)}</textarea>`)
  html += card(sec('다음에 또 맡긴다면 하고 싶은 공정은? <span style="font-weight:600;color:#9aa3b6;font-size:11px">(자유롭게)</span>') + `<textarea id="sv-again" rows="2" placeholder="예: 옥상 방수, 외벽 도색도 맡기고 싶어요" style="${taStyle}">${escH(SURVEY.again)}</textarea>`)
  html += card(sec('한 줄 의견 <span style="font-weight:600;color:#9aa3b6;font-size:11px">(선택)</span>') + `<textarea id="sv-comment" rows="3" placeholder="자유롭게 남겨주세요" style="${taStyle}">${escH(SURVEY.comment)}</textarea>`)
  html += `<div id="sv-msg" style="text-align:center;font-size:11.5px;font-weight:700;color:#e4544b;min-height:15px;margin-bottom:6px"></div>`
  html += `<div onclick="submitSurvey()" style="cursor:pointer;text-align:center;background:#F5A623;color:#fff;font-size:14.5px;font-weight:800;padding:15px;border-radius:13px;box-shadow:0 10px 20px -12px rgba(245,166,35,.7)">만족도 제출하기</div>`
  body.innerHTML = html
  const bind = (id, k) => { const el = document.getElementById(id); if (el) el.addEventListener('input', () => { SURVEY[k] = el.value }) }
  bind('sv-best', 'best'); bind('sv-again', 'again'); bind('sv-comment', 'comment')
}
async function submitSurvey() {
  if (!SURVEY) return
  const be = document.getElementById('sv-best'); if (be) SURVEY.best = be.value
  const ag = document.getElementById('sv-again'); if (ag) SURVEY.again = ag.value
  const c = document.getElementById('sv-comment'); if (c) SURVEY.comment = c.value
  const msg = document.getElementById('sv-msg')
  if (!SURVEY.overall) { if (msg) msg.textContent = '전체 만족도 별점을 선택해 주세요.'; return }
  const { data: { user } } = await sb.auth.getUser(); if (!user) { showScreen('s01'); return }
  const { data: prof } = await sb.from('profiles').select('role, name').eq('id', user.id).single()
  const row = {
    apartment_id: SURVEY.apt.id, respondent_id: user.id,
    respondent_role: (prof && prof.role === 'manager') ? 'manager' : 'resident',
    overall: SURVEY.overall, r_comm: SURVEY.r_comm || null, r_site: SURVEY.r_site || null,
    r_defect: SURVEY.r_defect || null, r_quality: SURVEY.r_quality || null,
    best: (SURVEY.best || '').trim() || null, again: (SURVEY.again || '').trim() || null, comment: (SURVEY.comment || '').trim() || null
  }
  const { error } = await sb.from('surveys').upsert(row, { onConflict: 'apartment_id,respondent_id' })
  if (error) {
    if (msg) msg.textContent = /relation|table|column/.test(error.message) ? 'backend/migration-survey.sql 실행이 필요해요.' : ('제출 실패: ' + error.message)
    return
  }
  localStorage.setItem(surveyKey(SURVEY.apt.id), '1')
  checkSurveyBanner(SURVEY.apt)
  SURVEY = null
  renderSurveyDone(true)
}
window.submitSurvey = submitSurvey
// 감리사: 담당 단지 만족도 결과
async function openSurveyResults(apt) {
  const a = apt || currentApt; if (!a) return
  const nm = document.getElementById('svr-apt'); if (nm) nm.textContent = a.name
  window.showScreen('s40')
  const body = document.getElementById('svr-body'); if (!body) return
  body.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:22px">불러오는 중…</div>'
  const { data, error } = await sb.from('surveys').select('*').eq('apartment_id', a.id).order('created_at', { ascending: false })
  if (error) { body.innerHTML = '<div style="padding:20px;text-align:center;color:#8b95ad;font-size:12px;line-height:1.7">불러오지 못했어요.<br><b>backend/migration-survey.sql</b> 실행이 필요해요.</div>'; return }
  body.innerHTML = renderSurveyStats(data || [])
}
window.openSurveyResults = openSurveyResults
function avg(arr, key) { const v = arr.map(r => r[key]).filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : 0 }
function starText(n) { const f = Math.round(n); return '★★★★★'.slice(0, f) + '☆☆☆☆☆'.slice(0, 5 - f) }
function renderSurveyStats(rows) {
  if (!rows.length) return '<div style="padding:34px 16px;text-align:center;color:#8b95ad;font-size:12.5px;font-weight:600;line-height:1.7">아직 제출된 만족도가 없어요.<br>공사 완료 후 입주민이 참여하면 여기에 표시됩니다.</div>'
  const ov = avg(rows, 'overall')
  let html = `<div style="background:linear-gradient(150deg,#243768,#1F2C5C);border-radius:16px;padding:18px;color:#fff;margin-bottom:13px;text-align:center"><div style="font-size:11px;font-weight:800;color:#c3cee6">전체 만족도 · 응답 ${rows.length}명</div><div style="font-size:34px;font-weight:800;margin:6px 0 2px">${ov.toFixed(1)}<span style="font-size:15px;opacity:.6">/5</span></div><div style="font-size:19px;color:#F7C948;letter-spacing:2px">${starText(ov)}</div></div>`
  html += '<div style="background:#fff;border:1px solid #eef1f7;border-radius:14px;padding:15px;margin-bottom:13px">' + SURVEY_ITEMS.map(it => {
    const v = avg(rows, it.key), pct = Math.round(v / 5 * 100)
    return `<div style="padding:7px 0"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:#26314d"><span>${it.label}</span><span style="color:#F5A623">${v.toFixed(1)}</span></div><div style="height:6px;border-radius:9px;background:#f0f2f7;margin-top:5px;overflow:hidden"><div style="width:${pct}%;height:100%;background:#F5A623;border-radius:9px"></div></div></div>`
  }).join('') + '</div>'
  // 자유 입력 답변 목록 (가장 만족한 점 / 다음에 하고 싶은 공정 / 한 줄 의견)
  const textList = (title, key) => {
    const list = rows.filter(r => (r[key] || '').trim())
    if (!list.length) return ''
    return '<div style="font-size:12.5px;font-weight:800;color:#1c2440;margin:6px 2px 9px">' + title + '</div>' +
      list.map(r => `<div style="background:#fff;border:1px solid #eef1f7;border-radius:12px;padding:11px 13px;margin-bottom:8px"><div style="font-size:12.5px;color:#333c54;font-weight:600;line-height:1.6">“${escH(r[key])}”</div><div style="font-size:9.5px;color:#aab2c4;font-weight:700;margin-top:5px">${r.respondent_role === 'manager' ? '관리소장' : '입주민'}</div></div>`).join('')
  }
  html += textList('👍 가장 만족스러웠던 점', 'best')
  html += textList('🔁 다음에 하고 싶은 공정', 'again')
  html += textList('💬 한 줄 의견', 'comment')
  return html
}
window.renderSurveyStats = renderSurveyStats
// 우리 지역 감리 현황 (익명 · 이름/주소 없음) — 기본 5개, 전체보기로 더 표시
let REGION_ALL = []
let REGION_MORE = false
const REGION_CAP = 5
window.toggleRegionMore = function () { REGION_MORE = !REGION_MORE; renderRegionActivity() }
function renderRegionActivity() {
  const box = document.getElementById('res-region'); if (!box) return
  if (!REGION_ALL.length) { box.innerHTML = '<div style="padding:14px;font-size:11px;color:#8b95ad;font-weight:600;text-align:center">표시할 감리 활동이 없어요.</div>'; return }
  const stMap = { in_progress: ['감리 진행 중', '#2F6BF6'], scheduled: ['점검 예정', '#c98a1e'], done: ['점검 완료', '#1f8a5b'] }
  const list = REGION_MORE ? REGION_ALL : REGION_ALL.slice(0, REGION_CAP)
  let html = list.map((r, i) => {
    const [lbl, col] = stMap[r.status] || stMap.scheduled
    const region = r.region || '전국'
    const type = r.construction_type || '유지보수'
    const line = (i < list.length - 1 || REGION_ALL.length > REGION_CAP) ? 'border-bottom:1px solid #f0f2f7;' : ''
    return `<div style="display:flex;align-items:center;gap:9px;padding:12px 13px;${line}"><span style="width:7px;height:7px;border-radius:99px;background:${col};flex-shrink:0"></span><div style="flex:1;font-size:12.5px;font-weight:700;color:#2a3350;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(region)} · ${escH(type)}</div><span style="font-size:10.5px;color:${col};font-weight:800;flex-shrink:0">${lbl}</span></div>`
  }).join('')
  if (REGION_ALL.length > REGION_CAP) {
    const label = REGION_MORE ? '접기 ▲' : `전체보기 (+${REGION_ALL.length - REGION_CAP}) ▼`
    html += `<div onclick="toggleRegionMore()" style="cursor:pointer;text-align:center;padding:11px;font-size:12px;font-weight:800;color:#2F6BF6">${label}</div>`
  }
  box.innerHTML = html
}
async function loadRegionActivity() {
  const box = document.getElementById('res-region'); if (!box) return
  const { data } = await sb.rpc('region_activity')
  REGION_ALL = data || []
  REGION_MORE = false
  renderRegionActivity()
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

// ── 감리일지: 목록 · 작성 · 상세 ─────────────────────────
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
    <div style="font-size:11px;color:#5c6580;font-weight:600;margin-bottom:8px">${head}</div>
    <div class="stg-all" style="display:none">
      <div style="font-size:10px;color:#8b95ad;font-weight:700;margin-bottom:4px">👆 각 단계를 누르면 무엇을·왜 하는지 알려드려요</div>
      ${rows}
    </div>
    <div class="stg-toggle" onclick="toggleStageAll(this)" style="display:flex;align-items:center;justify-content:center;gap:5px;padding:9px;margin-top:2px;background:#eaf1ff;border-radius:9px;cursor:pointer;font-size:11px;font-weight:800;color:#2F6BF6">
      <span class="stg-toggle-txt">전체 공정 ${tot}단계 보기</span><span class="stg-toggle-ic">▾</span>
    </div>
  </div>`
}
// 전체 공정 순서 펼치기/접기
window.toggleStageAll = function (btn) {
  const box = btn.parentElement
  const all = box.querySelector('.stg-all'); if (!all) return
  const open = all.style.display !== 'none'
  all.style.display = open ? 'none' : 'block'
  const t = btn.querySelector('.stg-toggle-txt'), ic = btn.querySelector('.stg-toggle-ic')
  const tot = box.querySelectorAll('.stg-row').length
  if (t) t.textContent = open ? `전체 공정 ${tot}단계 보기` : '접기'
  if (ic) ic.textContent = open ? '▾' : '▴'
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
    cont.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 작성한 감리일지가 없어요.<br>위 “＋ 감리일지 작성”으로 첫 보고서를 남겨보세요.</div>'
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
window.toggleWTag = function (el) {
  const on = el.getAttribute('data-on') === '1'
  el.setAttribute('data-on', on ? '0' : '1')
  el.style.background = on ? '#fff' : '#2F6BF6'
  el.style.color = on ? '#3a445e' : '#fff'
  el.style.borderColor = on ? '#dbe3f0' : '#2F6BF6'
}
function openWrite() {
  if (!currentApt) return
  // 현장 점검 앱(체크리스트)으로 이동 — 단지 정보 전달, 저장 시 이 단지 감리일지로 정리됨
  const m = currentApt.method || ''
  let work = '', sub = ''
  if (m === 'repaint') work = '외벽 재도장'
  else if (m === 'metalroof') { work = '옥상방수'; sub = '금속기와' }
  else if (m === 'shingle') { work = '옥상방수'; sub = '싱글' }
  else if (m === 'epoxy') work = '지하주차장'
  const url = 'inspect/?apt=' + encodeURIComponent(currentApt.id) + '&name=' + encodeURIComponent(currentApt.name || '') + '&work=' + encodeURIComponent(work) + '&sub=' + encodeURIComponent(sub)
  location.href = url
}
async function saveReport() {
  if (!currentApt) return
  const stage = (document.getElementById('w-stage') || {}).value?.trim()
  const memo = (document.getElementById('w-memo') || {}).value?.trim()
  let title = (document.getElementById('w-title') || {}).value?.trim()
  const tags = Array.from(document.querySelectorAll('#w-tags .wtag[data-on="1"]')).map(x => x.dataset.tag)
  if (!W_PHOTOS.length && !tags.length && !memo) { alert('사진이나 특이사항을 하나 이상 남겨주세요'); return }
  if (!title) title = stage ? (stage + ' 점검') : '현장 점검'
  let content = ''
  if (tags.length) content += '특이사항: ' + tags.join(', ')
  if (memo) content += (content ? '\n' : '') + memo
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
  set('d-title', r.title || '감리일지')
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
    p1.innerHTML = ph.map(u => `<div onclick="zoomPhoto('${u}')" style="flex:0 0 100%;scroll-snap-align:center;height:300px;border-radius:12px;cursor:zoom-in;background:#eef1f7 url('${u}') center/contain no-repeat"></div>`).join('')
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
  // 일정 화면 하단 탭을 역할에 맞게 (감리사: 홈·보고서·일정·채팅 / 입주민: 5탭)
  const snav = document.getElementById('sched-nav')
  if (snav) snav.innerHTML = isAuditor
    ? '<div><div class="ic">🏠</div>홈</div><div><div class="ic">📄</div>보고서</div><div class="on"><div class="ic">📅</div>일정</div><div data-tab="chat"><div class="ic">💬</div>채팅</div>'
    : '<div data-tab="home"><div class="ic">🏠</div>홈</div><div data-tab="field"><div class="ic">📸</div>현황</div><div data-tab="schedule" class="on"><div class="ic">📅</div>일정</div><div data-tab="alim"><div class="ic">📖</div>이야기</div><div data-tab="chat"><div class="ic">💬</div>채팅</div>'
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

window.appLogout = async function () {
  try { await sb.auth.signOut() } catch (e) {}
  currentRole = null
  window.showScreen('s01')
}
function wire() {
  const submit = $('auth-submit')
  if (submit) submit.onclick = () => (submit.dataset.mode === 'signup' ? doSignup() : doLogin())
  const ts = $('auth-toggle-signup'); if (ts) ts.onclick = () => setMode('signup')
  const tl = $('auth-toggle-login'); if (tl) tl.onclick = () => setMode('login')
  const out = $('logout-btn'); if (out) out.onclick = async () => { await sb.auth.signOut(); window.showScreen('s01') }
  // 감리일지 흐름
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
  // 감리사 단지 메뉴 (감리일지 / 현장 사진 / 미팅 자료 / 소장님 작성지)
  const amR = $('aud-menu-report'); if (amR) amR.onclick = () => { if (currentApt) openApt(currentApt) }
  const amF = $('aud-menu-field'); if (amF) amF.onclick = () => { if (currentApt) openAuditorField(currentApt) }
  const amM = $('aud-menu-meeting'); if (amM) amM.onclick = () => window.showScreen('s29')
  const amG = $('aud-menu-manager'); if (amG) amG.onclick = () => openManagerDoc()
  const amRcv = $('aud-menu-received'); if (amRcv) amRcv.onclick = () => openReceivedForms()
  const amCt = $('aud-menu-contract'); if (amCt) amCt.onclick = () => openContracts()
  const amSv = $('aud-menu-survey'); if (amSv) amSv.onclick = () => { if (currentApt) openSurveyResults(currentApt) }
  // 채팅 입력
  const cSend = $('chat-send'); if (cSend) cSend.onclick = sendChat
  const cInp = $('chat-input')
  if (cInp) {
    cInp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } })
    cInp.addEventListener('input', () => { cInp.style.height = 'auto'; cInp.style.height = Math.min(cInp.scrollHeight, 88) + 'px' })
    cInp.addEventListener('focus', () => { setTimeout(() => { const bd = document.getElementById('chat-body'); if (bd) bd.scrollTop = bd.scrollHeight }, 350) })
  }
  // 미팅 자료 선택
  const mf = $('meet-first'); if (mf) mf.onclick = () => openMeetingDoc('first')
  const mi = $('meet-internal'); if (mi) mi.onclick = () => openMeetingDoc('internal')
  // 소장님 작성지: 카톡 링크 전송(메인) / 링크 복사 / 미리보기
  const mgS = $('mgr-share'); if (mgS) mgS.onclick = shareManagerDoc
  const mgC = $('mgr-copy'); if (mgC) mgC.onclick = copyManagerDoc
  const mgP = $('mgr-preview'); if (mgP) mgP.onclick = previewManagerForm
  // 현장 현황 검색 (입주민 / 감리사)
  const ffs = $('field-search'); if (ffs) ffs.oninput = renderFieldList
  const affs = $('audfield-search'); if (affs) affs.oninput = renderAudFieldList
  // 감리일지 검색
  const rps = $('rep-search'); if (rps) rps.oninput = () => { repQuery = rps.value; renderReports() }
  // 공사 일정
  const addBtn = $('sc-add-btn'); if (addBtn) addBtn.onclick = () => { const f = $('sc-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none' }
  const scSave = $('sc-save'); if (scSave) scSave.onclick = addSchedule
  // 입주민 홈 · 빠른 메뉴
  const goSchedule = () => { showScreen('s14'); loadSchedule() }
  const icSch = $('res-ic-schedule'); if (icSch) icSch.onclick = goSchedule
  const nextCard = $('res-next-card'); if (nextCard) nextCard.onclick = goSchedule
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
    if (nav.hasAttribute('data-tab')) return // 신규 5탭 nav는 data-tab 핸들러가 처리
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

/* ===== 알림 탭 = 아파트스퀘어 소개 (실행 로드맵 기반, 감리 토탈 솔루션) ===== */
// 콘텐츠(블로그·유튜브) 목록 — 실제 링크는 여기 채우면 됨
const ALIM_CONTENT = [
  { type: 'youtube', yt: 'yQUeooyXpPA', title: '아파트스퀘어 현장 쇼츠 ①', url: 'https://youtube.com/shorts/yQUeooyXpPA' },
  { type: 'youtube', yt: 'i7061vU2BXE', title: '아파트스퀘어 현장 쇼츠 ②', url: 'https://youtube.com/shorts/i7061vU2BXE' },
  { type: 'youtube', yt: 'Hz6Z2T1v5nY', title: '아파트스퀘어 현장 쇼츠 ③', url: 'https://youtube.com/shorts/Hz6Z2T1v5nY' },
  { type: 'youtube', yt: 'XVegF05f1js', title: '아파트스퀘어 현장 쇼츠 ④', url: 'https://youtube.com/shorts/XVegF05f1js' },
  { type: 'youtube', yt: 'k_RGeslphd0', title: '아파트스퀘어 현장 쇼츠 ⑤', url: 'https://youtube.com/shorts/k_RGeslphd0' },
  { type: 'youtube', yt: 'JfHwcYDGcck', title: '아파트스퀘어 현장 쇼츠 ⑥', url: 'https://youtube.com/shorts/JfHwcYDGcck' },
  { type: 'youtube', yt: 'OtNt2Jv08ag', title: '아파트스퀘어 영상 보기', url: 'https://youtu.be/OtNt2Jv08ag' },
  { type: 'blog', title: '아파트 외벽 도색 감리, 22년차 건축사가 짚어주는 핵심 포인트', url: 'https://blog.naver.com/aptsquare_/224318743314' },
  { type: 'blog', title: '지하주차장 에폭시 재하자, 감리 없이 반복되는 이유', url: 'https://blog.naver.com/aptsquare_/224324551316' },
  { type: 'blog', title: '22년차 건축사가 알려주는 아파트 보수공사 감리 — 소통과 품질의 기준', url: 'https://blog.naver.com/aptsquare_/224316637130' },
  { type: 'blog', title: '아파트 외벽누수, 공동주택 보수공사에 시공감리가 필요한 이유', url: 'https://blog.naver.com/aptsquare_/224310591587' },
  { type: 'blog', title: '아파트 보수공사 공동주택 시공감리 특허공법, 22년차 설계감리는?', url: 'https://blog.naver.com/aptsquare_/224298094040' }
]
// 아파트스퀘어 네이비 브랜드 히어로
function navyHero(kicker, title) {
  return '<div style="background:linear-gradient(155deg,#243768,#1F2C5C);color:#fff;padding:28px 20px 30px;position:relative;overflow:hidden">'
    + '<div style="position:absolute;top:-30px;right:-30px;width:150px;height:150px;background:radial-gradient(circle,rgba(127,161,224,.35),transparent 65%)"></div>'
    + '<div style="position:relative"><div style="font-size:10.5px;font-weight:800;letter-spacing:1.5px;color:#7FA1E0">' + kicker + '</div>'
    + '<div style="font-size:20px;font-weight:800;line-height:1.42;margin-top:9px">' + title + '</div></div></div>'
}
function alimCard(inner, pad) { return '<div style="background:#fff;border:1px solid #eef1f7;border-radius:15px;padding:' + (pad || '15px 15px') + ';box-shadow:0 8px 18px -14px rgba(23,38,80,.35)">' + inner + '</div>' }
const ALIM = {
  // 소개 · 비전 · 철학
  philosophy() {
    let h = navyHero('APARTSQUARE · 아파트 보수공사 감리', '아파트 보수공사,<br>쉽게 · 공정하게 · 안심되게')
    h += '<div style="padding:16px 14px 26px">'
    h += alimCard('<div style="font-size:12.5px;color:#404a63;font-weight:600;line-height:1.9">아파트스퀘어는 <b>비전문가도</b> 아파트 보수공사의<br><b style="color:#2F6BF6">진단 · 설계 · 입찰 · 시공 · 준공</b>을<br>쉽게 이해하고 공정하게 관리할 수 있도록 돕는<br><b>보수공사 감리 토탈 솔루션</b>입니다.</div>', '16px 15px')
    h += '<div style="background:#eef4ff;border:1px solid #d7e3fb;border-radius:15px;padding:16px 15px;margin-top:12px">'
      + '<div style="font-size:13px;font-weight:800;color:#2F6BF6;margin-bottom:6px">🛡️ 감리가 뭔가요?</div>'
      + '<div style="font-size:12px;color:#3a445e;font-weight:600;line-height:1.8">공사가 <b>약속대로 되는지 제3자가 확인</b>하는 일이에요. 공사업체가 아닌 <b>독립된 감리사</b>가 자재·공정·품질을 검측하고 기록으로 남겨 드려요.</div></div>'
    h += '<div style="font-size:12px;font-weight:800;color:#1c2440;margin:24px 4px 11px">아파트스퀘어가 지키는 세 가지</div>'
    h += '<div style="display:flex;flex-direction:column;gap:10px">'
    h += [['🔎', '쉽게 이해돼요', '전문적인 판단을 쉬운 말·현장 사진으로 설명해요.'],
      ['⚖️', '공정하게 결정해요', '할 공사와 미뤄도 되는 공사를 구분하고, 업체 선정도 공정하게.'],
      ['🛡️', '안심하고 맡겨요', '진단부터 준공·하자관리까지 표준화된 감리로 함께해요.']]
      .map(c => alimCard('<div style="display:flex;gap:12px;align-items:flex-start"><div style="width:42px;height:42px;border-radius:12px;background:#eef4ff;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:21px">' + c[0] + '</div><div><div style="font-size:13.5px;font-weight:800;color:#1c2440">' + c[1] + '</div><div style="font-size:11.5px;color:#5c6580;font-weight:600;line-height:1.6;margin-top:3px">' + c[2] + '</div></div></div>', '13px 14px')).join('')
    h += '</div>'
    h += '<div style="background:#1c2440;color:#fff;border-radius:15px;padding:20px 18px;margin-top:20px;text-align:center"><div style="font-size:12.5px;font-weight:600;color:#c3cee6;line-height:1.7">아파트스퀘어의 경쟁력은</div><div style="font-size:14.5px;font-weight:800;line-height:1.6;margin-top:8px">전문적인 판단을 고객이<br><span style="color:#7FA1E0">쉽게 이해하고, 공정하게 결정하고,<br>안심하고 맡길 수 있게</span> 만든<br>표준 감리 운영체계</div></div>'
    h += '</div>'
    return h
  },
  // 서비스 = 대표 상품 3종 + 대상 공종
  features() {
    const pkg = (ic, bg, name, tag, items) => alimCard(
      '<div style="display:flex;align-items:center;gap:11px;margin-bottom:10px"><div style="width:44px;height:44px;border-radius:12px;background:' + bg + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">' + ic + '</div><div><div style="font-size:14.5px;font-weight:800;color:#1c2440">' + name + '</div><div style="font-size:10.5px;font-weight:800;color:#2F6BF6;margin-top:2px">' + tag + '</div></div></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px">' + items.map(t => '<div style="display:flex;gap:7px;font-size:11.5px;color:#3a445e;font-weight:600;line-height:1.5"><span style="color:#2F6BF6;flex-shrink:0">✓</span><span>' + t + '</span></div>').join('') + '</div>', '15px 15px')
    let h = navyHero('SERVICE', '진단부터 준공까지,<br>필요한 만큼 맡기세요')
    h += '<div style="padding:16px 14px 2px"><div style="background:linear-gradient(150deg,#2455c0,#2F6BF6);border-radius:16px;padding:18px 17px;color:#fff;position:relative;overflow:hidden"><div style="position:absolute;top:-20px;right:-20px;width:110px;height:110px;background:radial-gradient(circle,rgba(255,255,255,.18),transparent 65%)"></div><div style="position:relative"><div style="display:inline-block;font-size:10px;font-weight:800;background:rgba(255,255,255,.2);padding:3px 9px;border-radius:99px">아파트스퀘어 대표 기술</div><div style="font-size:17px;font-weight:800;margin-top:9px">🚁 드론 AI 하자진단</div><div style="font-size:11.5px;color:#dbe6ff;font-weight:600;line-height:1.7;margin-top:7px">사람이 오르기 어려운 <b>외벽·옥상을 드론으로 정밀 촬영</b>하고, <b>AI가 균열·들뜸·누수 흔적을 분석</b>해요. 더 정확하고 안전하게 진단합니다.</div></div></div></div>'
    h += '<div style="padding:14px 14px 8px;display:flex;flex-direction:column;gap:12px">'
    h += pkg('🔍', '#eef4ff', '공사 전 진단 패키지', 'STEP 1 · 무엇을 할지 정해요', ['드론 AI 하자진단으로 정밀 촬영·분석', '현장 상태 진단', '할 공사 · 미뤄도 되는 공사 구분', '공법별 장단점 비교', '예상 공사비 범위 안내', '입주자대표회의 설명자료'])
    h += pkg('📐', '#eafaf2', '설계 · 입찰 패키지', 'STEP 2 · 공정하게 업체를 정해요', ['공사 범위 확정 · 설계도서 · 시방서', '물량 산출 · 입찰조건 작성', '업체 평가기준 수립', '현장설명회 · 기술평가 지원'])
    h += pkg('🛡️', '#fff4e6', '토털 감리 패키지', 'STEP 3 · 끝까지 확인해요', ['사전진단 · 설계 · 입찰 지원', '시공 감리 · 공정별 검측', '준공 검사 · 하자 관리'])
    h += '</div>'
    // 대상 공종
    h += '<div style="padding:14px 16px 6px"><div style="font-size:12px;font-weight:800;color:#1c2440;margin-bottom:9px">이런 공사를 감리해요</div><div style="display:flex;flex-wrap:wrap;gap:7px">'
      + ['외벽 재도장', '옥상 · 외벽 방수', '지하주차장 에폭시 · 누수', '보도블럭 · 아스콘'].map(t => '<span style="font-size:11px;font-weight:700;color:#3a445e;background:#eef1f7;padding:6px 11px;border-radius:99px">' + t + '</span>').join('') + '</div></div>'
    // 공사 중엔 앱으로
    h += '<div style="font-size:12px;font-weight:800;color:#1c2440;margin:22px 16px 10px">공사가 시작되면, 앱으로 확인해요</div>'
    h += '<div style="display:flex;flex-direction:column;gap:9px;padding:0 14px 26px">'
    h += [['📋', '감리일지', '감리사가 남긴 기록을 그날 바로', '현황'], ['📸', '현장 사진', '매 공정을 사진으로 투명하게', '현황'], ['📊', '공정 진행률', '지금 몇 단계인지 홈에서 한눈에', '홈'], ['💬', '담당 감리사', '궁금하면 카톡으로 바로 문의', '채팅']]
      .map(c => alimCard('<div style="display:flex;gap:11px;align-items:center"><div style="width:40px;height:40px;border-radius:11px;background:#f4f6fa;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:19px">' + c[0] + '</div><div style="flex:1"><div style="font-size:13px;font-weight:800;color:#1c2440">' + c[1] + '</div><div style="font-size:11px;color:#5c6580;font-weight:600;margin-top:2px">' + c[2] + '</div></div><span style="font-size:9.5px;font-weight:800;color:#2F6BF6;background:#eef4ff;padding:4px 8px;border-radius:99px;flex-shrink:0">' + c[3] + '</span></div>', '11px 13px')).join('')
    h += '</div>'
    return h
  },
  // 진행과정 = 고객 여정과 각 단계 경험
  process() {
    const J = [
      ['💬', '문의', '“우리 단지 상황을 이해하는 전문가를 찾았다.”'],
      ['📝', '상담', '“우리 문제를 정확히 이해하고 정리해줬다.”'],
      ['🔍', '현장 진단', '“무엇을 하고 무엇은 미뤄도 되는지 알게 됐다.”'],
      ['📄', '제안 · 계약', '“앞으로 어떤 절차로 진행되는지 명확하다.”'],
      ['⚖️', '설계 · 입찰', '“업체 선정 과정이 공정하고 설명 가능하다.”'],
      ['🏗️', '공사 · 감리', '“매일 안 가도 공사가 투명하게 관리되고 있다.”'],
      ['✅', '준공', '“공사가 제대로 끝났다는 근거가 있다.”'],
      ['🤝', '사후관리', '“일회성이 아니라, 장기적인 보수공사 파트너다.”']
    ]
    let h = navyHero('CUSTOMER JOURNEY', '문의부터 사후관리까지,<br>이런 경험을 드려요')
    h += '<div style="padding:20px 16px 26px">'
    J.forEach((s, i) => {
      const last = i === J.length - 1
      h += '<div style="display:flex;gap:13px">'
        + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0"><div style="width:38px;height:38px;border-radius:11px;background:#eef4ff;display:flex;align-items:center;justify-content:center;font-size:19px">' + s[0] + '</div>' + (last ? '' : '<div style="flex:1;width:2px;background:#cfe0ff;margin:4px 0"></div>') + '</div>'
        + '<div style="flex:1;padding-bottom:' + (last ? '0' : '16px') + '"><div style="font-size:14px;font-weight:800;color:#1c2440;margin-bottom:6px">' + s[1] + '</div>'
        + '<div style="background:#fff;border:1px solid #eef1f7;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#3a445e;font-weight:600;line-height:1.6;box-shadow:0 8px 18px -15px rgba(23,38,80,.35)">' + s[2] + '</div></div></div>'
    })
    h += '<div style="background:#eef4ff;border:1px solid #d7e3fb;border-radius:14px;padding:16px;text-align:center;margin-top:6px"><div style="font-size:12.5px;font-weight:800;color:#1c2440">우리 단지도 감리받고 싶다면?</div><div data-inquiry="1" style="cursor:pointer;margin-top:10px;background:#2F6BF6;color:#fff;border-radius:11px;padding:12px;font-size:13px;font-weight:800">💬 카카오톡으로 상담 신청</div></div>'
    h += '</div>'
    return h
  },
  content() {
    let h = navyHero('CONTENT', '감리 · 보수공사 이야기,<br>영상과 글로 만나요')
    const list = alimList()
    const yt = list.filter(c => c.type === 'youtube')
    const bl = list.filter(c => c.type === 'blog')
    h += '<div style="padding:16px 16px 6px"><div style="font-size:13px;font-weight:800;color:#1c2440">\u25b6 유튜브</div></div>'
    if (yt.length) {
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px 6px">'
      h += yt.map(c => '<div onclick="openAlimUrl(\'' + c.url + '\')" style="cursor:pointer">'
        + '<div style="position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:16/10"><img src="https://img.youtube.com/vi/' + c.yt + '/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover" loading="lazy"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="width:34px;height:34px;border-radius:50%;background:rgba(228,84,75,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;padding-left:2px">\u25b6</div></div></div>'
        + '<div style="font-size:11px;font-weight:700;color:#2a3350;line-height:1.4;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(c.title) + '</div></div>').join('')
      h += '</div>'
    }
    h += '<div style="padding:18px 16px 6px"><div style="font-size:13px;font-weight:800;color:#1c2440">\ud83d\udcd6 블로그</div></div>'
    h += '<div style="display:flex;flex-direction:column;gap:9px;padding:0 14px 8px">'
    h += bl.map(c => '<div onclick="openAlimUrl(\'' + c.url + '\')" style="display:flex;gap:11px;align-items:center;background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:11px 12px;cursor:pointer;box-shadow:0 8px 18px -14px rgba(23,38,80,.35)">'
      + '<div style="width:48px;height:48px;border-radius:11px;background:linear-gradient(150deg,#8fd3b0,#2f7a56);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:19px">\ud83d\udcd6</div>'
      + '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:800;color:#1c2440;line-height:1.4">' + escH(c.title) + '</div><div style="font-size:10px;font-weight:800;color:#2f7a56;margin-top:4px">네이버 블로그</div></div>'
      + '<span style="color:#c3ccdb;font-size:16px">\u203a</span></div>').join('')
    h += '</div>'
    h += '<div style="text-align:center;font-size:10.5px;color:#aab2c4;font-weight:600;padding:8px 16px 30px">더 많은 콘텐츠는 아파트스퀘어 채널에서 만나요</div>'
    return h
  }
}
// 자동 콘텐츠 피드 (앱이 브라우저에서 직접 읽음, CORS 중계 경유) — 실패 시 정적 목록 폴백
// 유튜브 채널 ID(UC...)를 알면 아래에 넣으면 유튜브도 자동 갱신됨. (비우면 유튜브는 아래 정적 목록 사용)
const ALIM_YT_CHANNEL = 'UCeZr7L1jurF7WF1wNUHxWMw'
const ALIM_PROXY = u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)
let ALIM_FEED = null, ALIM_FEED_STATE = 'idle'
function alimList() {
  const sYt = ALIM_CONTENT.filter(c => c.type === 'youtube')
  const sBl = ALIM_CONTENT.filter(c => c.type === 'blog')
  const fy = ((ALIM_FEED && ALIM_FEED.youtube) || []).map(v => ({ type: 'youtube', yt: v.id, title: v.title || '아파트스퀘어 영상', url: 'https://www.youtube.com/watch?v=' + v.id }))
  const fb = ((ALIM_FEED && ALIM_FEED.blog) || []).map(b => ({ type: 'blog', title: b.title || '아파트스퀘어 블로그', url: b.url }))
  return (fy.length ? fy : sYt).concat(fb.length ? fb : sBl)
}
async function fetchNaverFeed() {
  const r = await fetch(ALIM_PROXY('https://rss.blog.naver.com/aptsquare_.xml'))
  if (!r.ok) return []
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  return Array.from(doc.querySelectorAll('item')).slice(0, 15)
    .map(it => ({ title: ((it.querySelector('title') || {}).textContent || '').trim(), url: ((it.querySelector('link') || {}).textContent || '').trim() }))
    .filter(i => i.title && i.url)
}
async function fetchYtFeed(cid) {
  const r = await fetch(ALIM_PROXY('https://www.youtube.com/feeds/videos.xml?channel_id=' + cid))
  if (!r.ok) return []
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  return Array.from(doc.getElementsByTagName('entry')).slice(0, 15)
    .map(e => ({ id: ((e.getElementsByTagName('yt:videoId')[0] || {}).textContent || '').trim(), title: ((e.getElementsByTagName('title')[0] || {}).textContent || '').trim() }))
    .filter(i => i.id)
}
async function loadAlimFeed() {
  if (ALIM_FEED_STATE === 'loading' || ALIM_FEED_STATE === 'done') return
  ALIM_FEED_STATE = 'loading'
  const out = { youtube: [], blog: [] }
  await Promise.all([
    fetchNaverFeed().then(v => { out.blog = v }).catch(() => {}),
    (ALIM_YT_CHANNEL ? fetchYtFeed(ALIM_YT_CHANNEL) : Promise.resolve([])).then(v => { out.youtube = v }).catch(() => {})
  ])
  if (out.blog.length || out.youtube.length) { ALIM_FEED = out; ALIM_FEED_STATE = 'done' } else { ALIM_FEED_STATE = 'fail' }
  if (alimTab === 'content' && ALIM_FEED_STATE === 'done') renderAlim('content')
}
window.openAlimUrl = function (u) { if (u) window.open(u, '_blank', 'noopener') }
let alimTab = 'philosophy'
function renderAlim(tab) {
  alimTab = tab || alimTab
  const body = document.getElementById('alim-body'); if (!body) return
  body.innerHTML = (ALIM[alimTab] || ALIM.philosophy)()
  document.querySelectorAll('.alim-tab').forEach(t => {
    const on = t.dataset.atab === alimTab
    t.style.color = on ? '#2F6BF6' : '#98a1b5'
    t.style.fontWeight = on ? '800' : '700'
    t.style.borderBottomColor = on ? '#2F6BF6' : 'transparent'
  })
  const bd = document.querySelector('#s33 .bd'); if (bd) bd.scrollTop = 0
}
function openAlim() { window.showScreen('s33'); renderAlim(alimTab); loadAlimFeed() }
window.openAlim = openAlim
window.openAlimContent = function (i) {
  const c = ALIM_CONTENT[i]; if (!c) return
  if (c.url) window.open(c.url, '_blank', 'noopener')
  else alert('아직 링크가 연결되지 않았어요. 곧 준비됩니다!')
}

/* ===== 인앱 채팅 (입주민↔감리사 / 손님↔관리자) ===== */
/* ===== 계약서 (감리사) ===== */
let CONTRACTS = []
function openContracts() {
  if (!currentApt) return
  const ap = document.getElementById('ct-apt'); if (ap) ap.textContent = currentApt.name
  const msg = document.getElementById('ct-msg'); if (msg) msg.textContent = ''
  window.showScreen('s35')
  loadContracts()
}
window.openContracts = openContracts
async function loadContracts() {
  const box = document.getElementById('ct-list'); if (!box || !currentApt) return
  box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
  const { data, error } = await sb.from('contracts').select('*').eq('apartment_id', currentApt.id).order('created_at', { ascending: false })
  if (error) { box.innerHTML = '<div style="padding:16px;color:#8b95ad;font-size:12px;line-height:1.7">불러오지 못했어요.<br><b>backend/migration-week.sql</b> 실행이 필요해요.</div>'; return }
  CONTRACTS = data || []
  renderContracts()
}
function renderContracts() {
  const box = document.getElementById('ct-list'); if (!box) return
  if (!CONTRACTS.length) { box.innerHTML = '<div style="padding:22px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">아직 등록된 계약서가 없어요.<br>위 버튼으로 올려보세요.</div>'; return }
  box.innerHTML = CONTRACTS.map(c => {
    const d = (c.created_at || '').slice(0, 10).replace(/-/g, '.')
    const ic = c.kind === 'pdf' ? '📄' : '🖼️'
    return `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:13px;padding:12px 13px;display:flex;align-items:center;gap:11px">
      <div onclick="openContractFile('${c.file_url}','${c.kind}')" style="flex:1;display:flex;align-items:center;gap:11px;cursor:pointer;min-width:0"><div style="width:44px;height:44px;border-radius:11px;background:#f3eeff;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:21px">${ic}</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(c.name) || '계약서'}</div><div style="font-size:10.5px;color:#8b95ad;font-weight:600;margin-top:2px">${d} · ${c.kind === 'pdf' ? 'PDF' : '사진'} · 탭하면 열기</div></div></div>
      <span onclick="deleteContract('${c.id}')" style="flex-shrink:0;color:#e4544b;font-size:11px;font-weight:800;cursor:pointer;padding:6px">삭제</span>
    </div>`
  }).join('')
}
window.openContractFile = function (url, kind) { if (kind === 'image') zoomPhoto(url); else window.open(url, '_blank', 'noopener') }
async function uploadContract(files) {
  const f = files && files[0]; if (!f || !currentApt) return
  const msg = document.getElementById('ct-msg'); if (msg) { msg.style.color = '#8b95ad'; msg.textContent = '올리는 중…' }
  const safe = f.name.replace(/[^\w.\-]/g, '_')
  const path = 'contracts/' + currentApt.id + '/' + Date.now() + '_' + safe
  const { error: upErr } = await sb.storage.from('field-photos').upload(path, f, { upsert: false })
  if (upErr) { if (msg) { msg.style.color = '#e4544b'; msg.textContent = '업로드 실패: ' + upErr.message } return }
  const url = sb.storage.from('field-photos').getPublicUrl(path).data.publicUrl
  const kind = f.type === 'application/pdf' ? 'pdf' : 'image'
  const { error } = await sb.from('contracts').insert({ apartment_id: currentApt.id, name: f.name, file_url: url, kind })
  if (error) { if (msg) { msg.style.color = '#e4544b'; msg.textContent = '등록 실패: ' + error.message } return }
  if (msg) { msg.style.color = '#1f8a5b'; msg.textContent = '✅ 등록됐어요' }
  const fi = document.getElementById('ct-file'); if (fi) fi.value = ''
  loadContracts()
}
window.uploadContract = uploadContract
async function deleteContract(id) {
  if (!confirm('이 계약서를 삭제할까요?')) return
  const { error } = await sb.from('contracts').delete().eq('id', id)
  if (error) { alert('삭제 실패: ' + error.message); return }
  loadContracts()
}
window.deleteContract = deleteContract

// 사진 확대 (라이트박스)
window.zoomPhoto = function (url) {
  if (!url) return
  let ov = document.getElementById('photo-zoom')
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'photo-zoom'
    ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(8,12,24,.92);display:flex;align-items:center;justify-content:center;padding:16px'
    ov.onclick = () => { ov.style.display = 'none' }
    document.body.appendChild(ov)
  }
  ov.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain">' +
    '<span style="position:absolute;top:16px;right:18px;color:#fff;font-size:26px;font-weight:300">✕</span>'
  ov.style.display = 'flex'
}

function chatGuestId() {
  let g = localStorage.getItem('aptsq_guest')
  if (!g) { g = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem('aptsq_guest', g) }
  return g
}
let CHAT = { thread: '', aptId: null, role: 'guest', name: '', lastCount: -1 }
let CHAT_POLL = null
function roleLabel(r) { return { guest: '손님', resident: '입주민', manager: '관리소장', auditor: '감리사', admin: '아파트스퀘어' }[r] || '상대' }
async function openChat(o) {
  CHAT = { thread: o.thread, aptId: o.aptId || null, role: o.role, name: o.name || '', lastCount: -1 }
  const t = document.getElementById('chat-title'); if (t) t.textContent = o.title || '채팅'
  const s = document.getElementById('chat-sub'); if (s) s.textContent = o.sub || ''
  const av = document.getElementById('chat-av'); if (av) av.textContent = (o.title || '아').slice(0, 1)
  const body = document.getElementById('chat-body'); if (body) body.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:20px">불러오는 중…</div>'
  window.showScreen('s34')
  await loadChat(true)
  startChatPoll()
}
window.openChat = openChat
async function loadChat(scroll) {
  if (!CHAT.thread) return
  const { data, error } = await sb.from('chat_messages').select('*').eq('thread', CHAT.thread).order('created_at', { ascending: true })
  if (error) { const b = document.getElementById('chat-body'); if (b && CHAT.lastCount < 0) b.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:22px;line-height:1.7">채팅을 불러오지 못했어요.<br><b>backend/migration-chat.sql</b> 을 Supabase에서 실행해 주세요.</div>'; return }
  const msgs = data || []
  if (msgs.length === CHAT.lastCount) return
  CHAT.lastCount = msgs.length
  renderChat(msgs, scroll)
  if (msgs.length) localStorage.setItem(chatSeenKey(CHAT.thread), msgs[msgs.length - 1].created_at || new Date().toISOString())
  refreshChatBadge() // 읽는 즉시 새로고침 없이 배지 갱신 (역할별 정확 합산)
}
function renderChat(msgs, mode) {
  const body = document.getElementById('chat-body'); if (!body) return
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40
  if (!msgs.length) { body.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:26px 20px;line-height:1.7">아직 대화가 없어요.<br>편하게 메시지를 남겨보세요 💬</div>'; return }
  body.innerHTML = msgs.map(m => {
    const mine = m.sender_role === CHAT.role
    const time = (m.created_at || '').slice(11, 16)
    if (mine) return '<div style="align-self:flex-end;max-width:78%;display:flex;flex-direction:column;align-items:flex-end"><div style="background:#2F6BF6;color:#fff;border-radius:15px 15px 4px 15px;padding:9px 13px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word">' + escH(m.body) + '</div><div style="font-size:9px;color:#aab2c4;margin-top:3px">' + time + '</div></div>'
    return '<div style="align-self:flex-start;max-width:80%"><div style="font-size:9.5px;color:#8b95ad;font-weight:700;margin:0 0 3px 3px">' + escH(m.sender_name || roleLabel(m.sender_role)) + '</div><div style="background:#fff;border:1px solid #e6eaf2;border-radius:15px 15px 15px 4px;padding:9px 13px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#1c2440">' + escH(m.body) + '</div><div style="font-size:9px;color:#aab2c4;margin:3px 0 0 3px">' + time + '</div></div>'
  }).join('')
  if (mode === true || (mode === 'auto' && atBottom)) { body.scrollTop = body.scrollHeight }
}
async function sendChat() {
  const inp = document.getElementById('chat-input'); if (!inp) return
  const body = inp.value.trim(); if (!body || !CHAT.thread) return
  inp.value = ''; inp.style.height = 'auto'
  const { error } = await sb.from('chat_messages').insert({ thread: CHAT.thread, apartment_id: CHAT.aptId, sender_role: CHAT.role, sender_name: CHAT.name || roleLabel(CHAT.role), body })
  if (error) { alert('전송 실패: ' + error.message); inp.value = body; return }
  await loadChat(true)
}
window.sendChat = sendChat
function startChatPoll() { stopChatPoll(); CHAT_POLL = setInterval(() => { const s = document.getElementById('s34'); if (!s || !s.classList.contains('active')) { stopChatPoll(); return } loadChat('auto') }, 3500) }
function stopChatPoll() { if (CHAT_POLL) { clearInterval(CHAT_POLL); CHAT_POLL = null } }
// 하단 '채팅' 탭 진입: 로그인=담당 감리사와 / 비로그인=관리자(손님 상담)
function chatFromNav() {
  if (currentRole === 'auditor') { openAuditorChatList(); return }
  if (currentRole && RES_APT && RES_APT.id) {
    openChat({ thread: 'apt:' + RES_APT.id, aptId: RES_APT.id, role: (currentRole === 'manager' ? 'manager' : 'resident'), name: MY_NAME, title: RES_AUD_NAME ? (RES_AUD_NAME + ' 감리사') : '담당 감리사', sub: '우리 단지 감리 상담' })
  } else {
    openChat({ thread: 'guest:' + chatGuestId(), aptId: null, role: 'guest', name: '손님', title: '아파트스퀘어 상담', sub: '무엇이든 편하게 물어보세요' })
  }
}
window.chatFromNav = chatFromNav

// 감리사: 담당 단지별 채팅 목록
function openAuditorChatList() {
  window.showScreen('s36') // showScreen 훅이 renderAuditorChatList()를 호출
}
async function renderAuditorChatList() {
  const cont = document.getElementById('audchat-list'); if (!cont) return
  const apts = Object.values(AUD_APTS || {})
  if (!apts.length) { cont.innerHTML = '<div style="padding:26px 16px;text-align:center;color:#8b95ad;font-size:12.5px;line-height:1.7">담당 단지가 없어요.<br>홈에서 단지를 먼저 확인해 주세요.</div>'; return }
  cont.innerHTML = '<div style="text-align:center;color:#9aa3b6;font-size:12px;padding:18px">불러오는 중…</div>'
  const rows = []
  for (const a of apts) {
    const th = 'apt:' + a.id
    let last = null, unread = 0
    try {
      const { data } = await sb.from('chat_messages').select('*').eq('thread', th).order('created_at', { ascending: true })
      const msgs = data || []
      last = msgs.length ? msgs[msgs.length - 1] : null
      unread = unreadFor(msgs, 'auditor', th)
    } catch (e) {}
    rows.push({ a, last, unread })
  }
  rows.sort((x, y) => (y.last ? y.last.created_at : '').localeCompare(x.last ? x.last.created_at : ''))
  cont.innerHTML = rows.map(r => {
    const preview = r.last ? escH((r.last.sender_role === 'auditor' ? '나: ' : '') + r.last.body).slice(0, 40) : '아직 대화가 없어요'
    const time = r.last ? (r.last.created_at || '').slice(5, 16).replace('T', ' ') : ''
    const badge = r.unread > 0 ? '<span style="flex-shrink:0;background:#e4544b;color:#fff;font-size:10px;font-weight:800;min-width:18px;height:18px;border-radius:99px;padding:0 5px;display:flex;align-items:center;justify-content:center;line-height:1">' + (r.unread > 99 ? '99+' : r.unread) + '</span>' : ''
    return '<div onclick="openAuditorChatFor(\'' + r.a.id + '\')" style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:11px 12px;display:flex;gap:11px;align-items:center;cursor:pointer">' +
      '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(150deg,#7FA1E0,#4a6bb0);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:17px">🏢</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escH(r.a.name) + '</div>' +
      '<div style="font-size:11px;color:#8b95ad;font-weight:600;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + preview + '</div></div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0"><div style="font-size:9px;color:#aab2c4;font-weight:700">' + time + '</div>' + badge + '</div></div>'
  }).join('')
}
window.openAuditorChatList = openAuditorChatList
window.renderAuditorChatList = renderAuditorChatList
window.openAuditorChatFor = function (aptId) {
  const a = AUD_APTS[aptId]; if (!a) return
  openChat({ thread: 'apt:' + a.id, aptId: a.id, role: 'auditor', name: MY_NAME || '감리사', title: a.name, sub: '입주민과 대화' })
}

// 채팅 안 읽음 빨간 배지
function chatSeenKey(th) { return 'aptsq_seen_' + th }
function unreadFor(msgs, myRole, th) { const seen = localStorage.getItem(chatSeenKey(th)) || ''; return (msgs || []).filter(m => m.sender_role !== myRole && (m.created_at || '') > seen).length }
function setChatNavBadge(n) {
  document.querySelectorAll('.nav [data-tab="chat"]').forEach(tab => {
    let b = tab.querySelector('.chat-badge')
    if (!b) { b = document.createElement('span'); b.className = 'chat-badge'; b.style.cssText = 'position:absolute;top:-1px;left:56%;background:#e4544b;color:#fff;font-size:9px;font-weight:800;min-width:15px;height:15px;border-radius:99px;padding:0 4px;display:none;align-items:center;justify-content:center;line-height:1;z-index:2'; tab.style.position = 'relative'; tab.appendChild(b) }
    if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.style.display = 'flex' } else b.style.display = 'none'
  })
}
async function refreshChatBadge() {
  // 감리사: 담당 단지 전체의 안 읽음 합산
  if (currentRole === 'auditor') {
    try {
      const apts = Object.values(AUD_APTS || {})
      let total = 0
      for (const a of apts) {
        if (!a || !a.id) continue
        const th = 'apt:' + a.id
        const { data } = await sb.from('chat_messages').select('created_at,sender_role').eq('thread', th)
        total += unreadFor(data, 'auditor', th)
      }
      setChatNavBadge(total)
    } catch (e) {}
    return
  }
  let th, role
  if (currentRole && RES_APT && RES_APT.id) { th = 'apt:' + RES_APT.id; role = (currentRole === 'manager' ? 'manager' : 'resident') }
  else if (!currentRole) { th = 'guest:' + chatGuestId(); role = 'guest' }
  else { setChatNavBadge(0); return }
  try { const { data } = await sb.from('chat_messages').select('created_at,sender_role').eq('thread', th).order('created_at', { ascending: true }); setChatNavBadge(unreadFor(data, role, th)) } catch (e) {}
}
window.refreshChatBadge = refreshChatBadge
setInterval(refreshChatBadge, 20000)

// ── 문의 버튼 → 카카오톡 채널 채팅 ─────────────────────────────
const INQUIRY_URL = 'https://pf.kakao.com/_DpQHG/chat'
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

// 하단 5탭(홈·현황·일정·알림·채팅) + 알림 서브탭 라우팅
document.addEventListener('click', (e) => {
  const tabEl = e.target.closest('.nav [data-tab]')
  if (tabEl) {
    const tab = tabEl.dataset.tab
    if (tab === 'home') {
      if (currentRole === 'auditor') { showScreen('s07'); loadAuditorApts() }
      else if (currentRole) { showScreen('s11'); loadResidentHome() }
      else { showScreen('s04'); loadResidentNotices('s04-notices') }
    }
    else if (tab === 'field') { if (currentRole) { showScreen('s26'); loadFieldUpdates() } else { showScreen('s01') } }
    else if (tab === 'schedule') { if (currentRole) { showScreen('s14'); loadSchedule() } else { showScreen('s01') } }
    else if (tab === 'alim') { openAlim() }
    else if (tab === 'chat') { chatFromNav() }
    return
  }
  const at = e.target.closest('.alim-tab')
  if (at) { renderAlim(at.dataset.atab) }
})

function boot() {
  try { wire() } catch (e) { console.error(e) }
  try { tagInquiry() } catch (e) { console.error(e) }
  try { wireBackArrows() } catch (e) { console.error(e) }
  try { renderVideos() } catch (e) { console.error(e) }
}
if (document.readyState !== 'loading') boot()
else document.addEventListener('DOMContentLoaded', boot)
