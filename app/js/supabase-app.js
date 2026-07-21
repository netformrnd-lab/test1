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
  window.showScreen(profile.role === 'auditor' ? 's07' : 's11')
}

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
