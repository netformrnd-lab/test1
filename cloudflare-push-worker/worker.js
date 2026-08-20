// 아파트스퀘어 푸시 발송 Worker (독립 Cloudflare Worker)
// Supabase Database Webhook가 이 Worker로 새 글(감리일지/현장현황/공지/채팅)을 POST하면,
// 대상 사용자들의 FCM 토큰을 찾아 Firebase(FCM v1)로 푸시를 발송한다.
//
// Cloudflare 대시보드 → Workers & Pages → Create → Worker 로 만들고 이 코드를 붙여넣기.
// 그다음 Settings → Variables and Secrets 에 아래 6개를 추가(비밀은 Secret 권장):
//   SUPABASE_URL           = https://gndktayoicegyqyllybk.supabase.co
//   SUPABASE_SERVICE_ROLE  = (Supabase service_role 키)
//   FCM_PROJECT_ID         = aptsquare-4cb7b
//   FCM_CLIENT_EMAIL       = firebase-adminsdk-...@aptsquare-4cb7b.iam.gserviceaccount.com
//   FCM_PRIVATE_KEY        = (서비스계정 private_key, -----BEGIN PRIVATE KEY----- 통째로)
//   PUSH_WEBHOOK_SECRET    = (아무 비밀문자열; 웹훅 URL ?secret= 로 검증)

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

    const url = new URL(request.url)
    const given = url.searchParams.get('secret') || request.headers.get('x-webhook-secret') || ''
    if (!env.PUSH_WEBHOOK_SECRET || given !== env.PUSH_WEBHOOK_SECRET) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    let payload
    try { payload = await request.json() } catch (e) { return json({ ok: false, error: 'bad json' }, 400) }
    const table = payload.table
    const type = payload.type
    const rec = payload.record || {}
    const old = payload.old_record || {}

    try {
      const plan = await buildPlan(env, table, type, rec, old)
      if (!plan || !plan.userIds || plan.userIds.length === 0) return json({ ok: true, sent: 0, reason: 'no targets' })
      const tokens = await tokensForUsers(env, plan.userIds)
      if (tokens.length === 0) return json({ ok: true, sent: 0, reason: 'no tokens' })
      const accessToken = await getAccessToken(env)
      let sent = 0, failed = 0
      for (const tk of tokens) {
        const ok = await sendOne(env, accessToken, tk, plan.title, plan.body, plan.data || {})
        if (ok) sent++; else failed++
      }
      return json({ ok: true, sent, failed })
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500)
    }
  }
}

// ---------- 이벤트별 대상/문구 결정 ----------
async function buildPlan(env, table, type, rec, old) {
  if (table === 'reports') {
    if (type === 'INSERT') {
      const aptName = await aptName_(env, rec.apartment_id)
      return { title: '🔔 새 감리일지 확인 요청', body: (aptName ? aptName + ' · ' : '') + (rec.title || '') + ' — 감리사가 올렸어요', userIds: await admins_(env), data: { kind: 'report_new', apartment_id: rec.apartment_id || '' } }
    }
    if (type === 'UPDATE' && !old.published && rec.published) {
      const aptName = await aptName_(env, rec.apartment_id)
      return { title: '📄 새 감리일지가 공개됐어요', body: (aptName ? aptName + ' · ' : '') + (rec.pub_title || rec.title || ''), userIds: await residents_(env, rec.apartment_id), data: { kind: 'report_pub', apartment_id: rec.apartment_id || '' } }
    }
    return null
  }

  if (table === 'field_updates' && type === 'INSERT') {
    const aptName = await aptName_(env, rec.apartment_id)
    return { title: '📷 새 현장 사진이 올라왔어요', body: (aptName ? aptName + ' · ' : '') + (rec.title || ''), userIds: await residents_(env, rec.apartment_id), data: { kind: 'field_new', apartment_id: rec.apartment_id || '' } }
  }

  if (table === 'notices' && type === 'INSERT') {
    return { title: '📢 새 공지사항', body: rec.title || '', userIds: await allResidents_(env), data: { kind: 'notice' } }
  }

  if (table === 'chat_messages' && type === 'INSERT') {
    const ids = await chatRecipients_(env, rec)
    const preview = (rec.body || '').slice(0, 60)
    return { title: '💬 ' + (rec.sender_name || '새 메시지'), body: preview, userIds: ids, data: { kind: 'chat', thread: rec.thread || '', apartment_id: rec.apartment_id || '' } }
  }

  return null
}

// ---------- Supabase 조회 (service_role) ----------
function sbHeaders(env) {
  return { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE, 'content-type': 'application/json' }
}
async function sbGet(env, pathAndQuery) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + pathAndQuery, { headers: sbHeaders(env) })
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return r.json()
}
async function aptName_(env, aptId) {
  if (!aptId) return ''
  const rows = await sbGet(env, 'apartments?id=eq.' + aptId + '&select=name')
  return (rows[0] && rows[0].name) || ''
}
async function admins_(env) {
  const rows = await sbGet(env, 'profiles?role=eq.admin&select=id')
  return rows.map(r => r.id)
}
async function residents_(env, aptId) {
  if (!aptId) return []
  const rows = await sbGet(env, 'profiles?apartment_id=eq.' + aptId + '&role=in.(resident,manager)&approved=eq.true&select=id')
  return rows.map(r => r.id)
}
async function allResidents_(env) {
  const rows = await sbGet(env, 'profiles?role=in.(resident,manager)&approved=eq.true&select=id')
  return rows.map(r => r.id)
}
async function auditors_(env, aptId) {
  if (!aptId) return []
  const a = await sbGet(env, 'apartment_auditors?apartment_id=eq.' + aptId + '&select=auditor_id')
  const b = await sbGet(env, 'apartments?id=eq.' + aptId + '&select=auditor_id')
  const set = new Set(a.map(r => r.auditor_id).filter(Boolean))
  if (b[0] && b[0].auditor_id) set.add(b[0].auditor_id)
  return [...set]
}
async function chatRecipients_(env, rec) {
  const thread = rec.thread || ''
  let ids = []
  if (thread.indexOf('guest:') === 0) {
    ids = await admins_(env)
  } else {
    const [res, aud, adm] = await Promise.all([residents_(env, rec.apartment_id), auditors_(env, rec.apartment_id), admins_(env)])
    ids = [...new Set([...res, ...aud, ...adm])]
  }
  if (rec.sender_id) ids = ids.filter(id => id !== rec.sender_id)
  return ids
}
async function tokensForUsers(env, userIds) {
  if (!userIds.length) return []
  const inList = '(' + userIds.join(',') + ')'
  const rows = await sbGet(env, 'device_tokens?user_id=in.' + inList + '&select=token')
  return [...new Set(rows.map(r => r.token).filter(Boolean))]
}

// ---------- FCM v1 발송 ----------
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim))
  const key = await importKey(env.FCM_PRIVATE_KEY)
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned))
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig))
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('oauth: ' + JSON.stringify(j).slice(0, 200))
  return j.access_token
}
async function sendOne(env, accessToken, token, title, body, data) {
  const msg = {
    message: {
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { sound: 'default', default_sound: true } },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    }
  }
  const r = await fetch('https://fcm.googleapis.com/v1/projects/' + env.FCM_PROJECT_ID + '/messages:send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
    body: JSON.stringify(msg)
  })
  if (r.ok) return true
  const txt = await r.text()
  if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(txt)) {
    try { await fetch(env.SUPABASE_URL + '/rest/v1/device_tokens?token=eq.' + encodeURIComponent(token), { method: 'DELETE', headers: sbHeaders(env) }) } catch (e) {}
  }
  return false
}

// ---------- 유틸 ----------
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
}
function b64url(str) { return b64urlBytes(new TextEncoder().encode(str)) }
function b64urlBytes(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function importKey(pem) {
  const clean = String(pem).replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(clean), c => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}
