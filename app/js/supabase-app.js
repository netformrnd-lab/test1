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
  if (profile.role === 'auditor') { window.showScreen('s07'); loadAuditorApts() }
  else { window.showScreen('s11') }
}

// ── 감리사: 내 담당 단지 불러오기 ─────────────────────────
function escH(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function auditorCard(a) {
  const cur = a.progress_current || 0, tot = a.progress_total || 0
  const pct = tot ? Math.round(cur / tot * 100) : 0
  const st = { in_progress: ['진행중', '#1f8a5b', '#e7f5ee'], done: ['완료', '#5a6480', '#eef1f7'], scheduled: ['점검예정', '#c98a1e', '#fbf1de'] }
  const [lbl, col, bg] = st[a.status] || st.scheduled
  return `<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:10px 11px;display:flex;gap:10px;align-items:center">
    <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(150deg,#5c86c8,#33507f);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">🏢</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(a.name)}</div>
      <div style="font-size:9.5px;color:#8b95ad;font-weight:600;margin-top:1px">${escH(a.region) || '지역 미정'} · ${escH(a.construction_type) || '종류 미정'}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px"><div style="flex:1;height:5px;border-radius:9px;background:#eef1f7;overflow:hidden"><div style="width:${pct}%;height:100%;background:#2F6BF6;border-radius:9px"></div></div><span style="font-size:9px;font-weight:800;color:#2F6BF6">${cur}/${tot}</span></div>
    </div>
    <span style="align-self:flex-start;font-size:8.5px;font-weight:800;color:${col};background:${bg};padding:3px 7px;border-radius:99px">${lbl}</span>
  </div>`
}
async function loadAuditorApts() {
  const cont = document.getElementById('aud-apts'); if (!cont) return
  const sub = document.getElementById('aud-sub')
  const { data: { user } } = await sb.auth.getUser(); if (!user) return
  const { data: apts, error } = await sb.from('apartments').select('*').eq('auditor_id', user.id).order('created_at', { ascending: false })
  if (error) { cont.innerHTML = '<div style="padding:20px;color:#8b95ad;font-size:12px">단지를 불러오지 못했어요</div>'; return }
  if (!apts || !apts.length) {
    cont.innerHTML = '<div style="padding:26px 12px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.6">아직 배정된 담당 단지가 없어요.<br>관리자가 단지를 배정하면 여기에 표시돼요.</div>'
    if (sub) sub.textContent = '배정된 단지가 아직 없어요'
    return
  }
  cont.innerHTML = apts.map(auditorCard).join('')
  if (sub) {
    const ip = apts.filter(a => a.status === 'in_progress').length
    const sc = apts.filter(a => a.status === 'scheduled').length
    sub.textContent = `맡은 단지 ${apts.length}곳 · 진행 ${ip} · 점검예정 ${sc}`
  }
}
window.loadAuditorApts = loadAuditorApts

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
