// test-168a4 프로젝트 소유 계정·결제 상태 확인 (이메일은 앞 3글자만 보이게 가림)
const { GoogleAuth } = require('google-auth-library')
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')
const P = 'test-168a4'
const mask = (m) => m.replace(/^(\w+:)?([^@]{1,3})[^@]*@/, (_, t, a) => (t || '') + a + '***@')
;(async () => {
  const c = await new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
  console.log('배포용 로봇 계정 프로젝트:', sa.project_id)
  const go = async (label, fn) => { try { await fn() } catch (e) { console.log(`${label} 실패:`, (e.response && e.response.status) || '', String((e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message).slice(0, 200)) } }
  await go('프로젝트 정보', async () => {
    const r = await c.request({ url: `https://cloudresourcemanager.googleapis.com/v1/projects/${P}` })
    console.log('== 프로젝트 ==', r.data.name, '| 상태', r.data.lifecycleState, '| 만든 때', r.data.createTime, '| 상위', JSON.stringify(r.data.parent || {}))
  })
  await go('결제 상태', async () => {
    const r = await c.request({ url: `https://cloudbilling.googleapis.com/v1/projects/${P}/billingInfo` })
    console.log('== 결제 == 사용 중:', r.data.billingEnabled, '| 결제 계정:', r.data.billingAccountName || '(연결 없음)')
  })
  await go('권한 목록', async () => {
    const r = await c.request({ url: `https://cloudresourcemanager.googleapis.com/v1/projects/${P}:getIamPolicy`, method: 'POST', data: {} })
    for (const b of r.data.bindings || []) if (/owner|editor|billing/i.test(b.role)) console.log(`== ${b.role} ==`, b.members.filter((m) => !/serviceAccount/.test(m)).map(mask).join(', ') || '(사람 계정 없음)')
  })
})()
