// 콘솔 스크린샷용 목(mock) 데이터 — 실제 DB가 아닌 가짜 데이터 (화면 구성·디자인 비교용)
// 날짜는 실행일 기준 상대값으로 만듭니다.
module.exports = function makeMock (today) {
  const T = today ? new Date(today) : new Date(); T.setHours(0, 0, 0, 0)
  const d = (n) => { const x = new Date(T); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
  const ts = (n, h) => d(n) + 'T' + String(h || 9).padStart(2, '0') + ':00:00Z'
  const AUD = ['조현식', '황윤선', '이필선', '한준엽', '김성민', '정정훈', '김영성'].map((name, i) => ({ id: 'u' + (i + 1), name, role: 'auditor', approved: true, email: 'aud' + (i + 1) + '@aptsquare.app', phone: '010-1234-00' + (10 + i) }))
  const MEMBERS = [{ id: 'adm', name: '관리자', role: 'admin', approved: true, email: 'admin@aptsquare.app' }, ...AUD,
    { id: 'r1', name: '김입주', role: 'resident', approved: true, apartment_id: 'a1' }, { id: 'r2', name: '박소장', role: 'manager', approved: false, apartment_id: 'a2' }]
  const A = (id, name, region, status, method, pc, auditor, extra) => Object.assign({ id, name, region, status, method, progress_current: pc, progress_total: (({ repaint: 6, metalroof: 8, shingle: 8, epoxy: 6, composite: 7, block: 8, ascon: 8 })[method] || 0), auditor_id: auditor, households: 500 + Math.floor(Math.random() * 900), supervision_fee: 12000000, received_amount: 6000000, created_at: ts(-60) }, extra || {})
  const APTS = [
    A('a1', '교촌동제이파크아파트', '대전', 'in_progress', 'repaint', 3, 'u3'),
    A('a2', '대전 파밀리에아파트', '대전', 'in_progress', 'repaint', 4, 'u3'),
    A('a3', '수원 매탄임광아파트', '수원', 'in_progress', 'composite', 0, 'u1'),
    A('a4', '수원 영통SK뷰아파트', '수원', 'in_progress', 'repaint', 4, 'u1'),
    A('a5', '시흥 해가든더클래식', '시흥', 'in_progress', 'epoxy', 2, 'u7'),
    A('a6', '용인 신봉동부센트레빌5단지', '용인 수지', 'in_progress', 'repaint', 1, 'u1'),
    A('a7', '용인 장미마을 래미안2차 아파트', '용인', 'in_progress', 'composite', 6, 'u4'),
    A('a8', '청담삼성1차아파트', '서울 강남', 'in_progress', 'repaint', 3, 'u2'),
    A('a9', '태영데시앙아파트', '신촌', 'in_progress', 'repaint', 5, 'u2'),
    A('a10', '태전1차이편한세상아파트', '광주', 'in_progress', 'repaint', 0, 'u1'),
    A('a11', '세종 센트럴파크아파트', '세종', 'scheduled', 'metalroof', 0, 'u5'),
    A('a12', '광명 푸르지오아파트', '경기 광명', 'scheduled', 'shingle', 0, null),
    A('a13', '하남 미사강변아파트', '경기 하남', 'scheduled', null, 0, 'u6'),
    A('a14', '가온12단지더하이스트', '세종', 'done', 'repaint', 6, 'u1'),
    A('a15', '고양 강선6단지금호한양', '고양', 'done', 'composite', 7, 'u1')
  ]
  const APT_AUD = { a1: ['u3'], a2: ['u3', 'u1'], a3: ['u1', 'u3'], a4: ['u1', 'u6'], a5: ['u7', 'u1'], a6: ['u1', 'u5'], a7: ['u4', 'u1'], a8: ['u2'], a9: ['u2'], a10: ['u1'], a11: ['u5'], a13: ['u6'], a14: ['u1', 'u2', 'u3'], a15: ['u1'] }
  const CS = {}
  const cs = (name, data) => { CS[name] = data }
  cs('교촌동제이파크아파트', { own: true, stage: '공사중', methods: ['repaint'], progress: { repaint: 3 }, cycle: '주1회', visitDay: '수' })
  cs('대전 파밀리에아파트', { own: true, stage: '공사중', methods: ['repaint', 'composite'], progress: { repaint: 4, composite: 2 }, cycle: '주2회', visitDay: '화·목' })
  cs('수원 매탄임광아파트', { own: true, stage: '공사중', methods: ['composite'], progress: { composite: 0 }, cycle: '주1회', visitDay: '금' })
  cs('수원 영통SK뷰아파트', { own: true, stage: '공사중', methods: ['repaint', 'epoxy'], progress: { repaint: 4, epoxy: 5 }, cycle: '주2회', visitDay: '월·수' })
  cs('시흥 해가든더클래식', { own: true, stage: '공사중', methods: ['epoxy'], progress: { epoxy: 2 }, cycle: '주1회', visitDay: '목' })
  cs('용인 신봉동부센트레빌5단지', { own: true, stage: '공사중', methods: ['repaint'], progress: { repaint: 1 } })
  cs('용인 장미마을 래미안2차 아파트', { own: true, stage: '준공처리중', methods: ['composite'], progress: { composite: 6 }, cycle: '주1회', visitDay: '화' })
  cs('청담삼성1차아파트', { own: true, stage: '공사중', methods: ['repaint'], progress: { repaint: 3 }, cycle: '주1회', visitDay: '수' })
  cs('태영데시앙아파트', { own: true, stage: '공사중', methods: ['repaint'], progress: { repaint: 5 }, cycle: '주1회', visitDay: '월' })
  cs('태전1차이편한세상아파트', { stage: '공사중' })
  cs('세종 센트럴파크아파트', { stage: '계약' }); cs('광명 푸르지오아파트', { stage: '착공' }); cs('하남 미사강변아파트', { stage: '착공' })
  cs('가온12단지더하이스트', { own: true, stage: '준공', stageAt: ts(-20), methods: ['repaint'], progress: { repaint: 6 }, cycle: '주1회', visitDay: '수' })
  cs('고양 강선6단지금호한양', { stage: '준공', stageAt: ts(-45) })
  const L = '━━━━━━━━━━━━━━━━━━'
  const rep = (id, apt, wt, round, n, title1, body, author) => ({ id, apartment_id: apt, author_id: author || 'u1', worktype: wt, created_at: ts(n, 18), published: false,
    title: '[감리일지] ' + (APTS.find(a => a.id === apt) || {}).name + (wt ? ' · ' + wt : '') + ' · 제' + round + '차 · ' + d(n),
    content: L + '\n      공 사 감 리 일 지\n' + L + '\n공사명: 현장 ' + wt + '\n날짜: ' + d(n) + ' | 날씨: 맑음 | 단계: 공사중 | 회차: 제' + round + '차\n' + L + '\n[작업사항]\n\n[시공사 보고]\n▪ ' + body + '\n\n[감리 확인]\n▪ ' + body + ' 확인\n' + L + '\n[특기사항]\n· 아파트 감리일지\n\n공종: ' + title1 + '\n\n---\n\n1. ' + title1 + ' 점검\n\n- ' + body + '\n' + L + '\n[지적사항 및 처리결과]\n없음\n' })
  const REPORTS = [
    rep('p1', 'a1', '재도장', 1, -16, '외벽 고압세척 및 균열보수', '1동·2동 세척 완료', 'u3'),
    rep('p2', 'a1', '재도장', 2, -9, '외부 수성도장 및 그래픽도장', '1동, 2동, 5동, 6동 수성도장 공사 완료 확인', 'u3'),
    rep('p3', 'a2', '재도장', 3, -4, '외부 수성도장 및 그래픽도장, 외부 균열보수', '3동 그래픽 작업 진행', 'u3'),
    rep('p4', 'a2', '옥상', 1, -6, '옥상 복합 방수시트 부착', '101동 방수시트 부착 상태 양호', 'u1'),
    rep('p5', 'a3', '옥상', 1, -23, '관리소장님 지적사항', '우수관 주변 바탕정리 요청', 'u1'),
    rep('p6', 'a4', '재도장', 5, -4, '도장 금지 조건에 해당하여 금일 도장 작업 미실시', '기온 5도 이하로 도장 작업 중단', 'u1'),
    rep('p7', 'a4', '재도장', 6, -1, '공사 마무리 점검', '잔손보기 및 청소', 'u1'),
    rep('p8', 'a5', '지하주차장', 2, -10, '에폭시 중도 1차 도포', 'B1 중도 1차 완료', 'u7'),
    rep('p9', 'a6', '재도장', 1, -8, '금일 공정 및 현장현황', '고압세척 시작', 'u1'),
    rep('p10', 'a7', '옥상', 9, -8, '준공검사 아파트측과 11월4일 예정일로 결정', '상도 도포 완료', 'u4'),
    rep('p11', 'a8', '재도장', 1, -8, '재도장 1차', '바인더 작업', 'u2'),
    rep('p12', 'a9', '재도장', 4, -8, '금일 작업 내용', '공사 마무리 단계', 'u2'),
    rep('p13', 'a10', '재도장', 1, -10, '재도장 1차', '착수 점검', 'u1')
  ]
  const SCHEDULES = []
  let sid = 1
  APTS.forEach(a => { const c = CS[a.name] || {}; if (!c.visitDay || a.status === 'done') return; const days = c.visitDay.split('·'); const W = ['월', '화', '수', '목', '금', '토', '일']
    for (let n = -21; n <= 28; n++) { const dt = new Date(T); dt.setDate(dt.getDate() + n); const wd = W[(dt.getDay() + 6) % 7]; if (!days.includes(wd)) continue
      SCHEDULES.push({ id: 's' + (sid++), apartment_id: a.id, date: d(n), title: '🔧 정기 방문', description: '담당 ' + ((AUD.find(u => u.id === a.auditor_id) || {}).name || '-'), assignee_id: a.auditor_id, category: 'asq', source: 'aptsq', resident_visible: true, done_at: n < 0 ? ts(n, 15) : null }) } })
  SCHEDULES.push({ id: 's' + (sid++), date: d(2), title: '세종 센트럴파크 현장설명회', category: 'bids', source: 'pour', assignee_name: '정정훈' }, { id: 's' + (sid++), date: d(5), title: '월례 회의', category: 'meeting', source: 'aptsq' })
  const SALES = [
    { id: 'L1', name: '부천 중동 대림아파트', stage: 'inquiry', region: '부천', construction_type: '외벽 재도장', amount: 15000000, created_at: ts(-3), stage_changed_at: ts(-3), owner: '정정훈' },
    { id: 'L2', name: '안양 평촌 목련마을', stage: 'meeting', region: '안양', construction_type: '옥상방수', amount: 9000000, created_at: ts(-7), stage_changed_at: ts(-4), owner: '조현식' },
    { id: 'L3', name: '성남 분당 시범단지', stage: 'quote', region: '성남', construction_type: '외벽 재도장', amount: 22000000, created_at: ts(-12), stage_changed_at: ts(-1), owner: '정정훈' },
    { id: 'L4', name: '인천 송도더샵', stage: 'contract', region: '인천', construction_type: '지하주차장 에폭시', amount: 18000000, created_at: ts(-20), stage_changed_at: ts(-6), owner: '조현식' },
    { id: 'L5', name: '세종 센트럴파크아파트', stage: 'won', region: '세종', amount: 14000000, apartment_id: 'a11', created_at: ts(-30), stage_changed_at: ts(-10), owner: '정정훈' }
  ]
  const SITE_NOTES = [
    { id: 'n1', apartment_id: 'a1', body: '관리소장님과 그래픽 도안 협의, 11월 초 완료 목표', kind: 'note', created_at: ts(-2, 10), author_name: '이필선' },
    { id: 'n2', apartment_id: 'a4', body: '기온 저하로 도장 중단. 다음 주 재개 예정', kind: 'issue', created_at: ts(-4, 16), author_name: '조현식' },
    { id: 'n3', apartment_id: 'a7', body: '준공검사 11/4 확정, 서류 준비', kind: 'note', created_at: ts(-8, 11), author_name: '한준엽' }
  ]
  const AREQS = [{ id: 'q1', apartment_id: 'a12', auditor_id: 'u5', status: 'pending', created_at: ts(-1) }]
  return { MEMBERS, APTS, APT_AUD, CSITES: CS, REPORTS, SCHEDULES, SALES, SITE_NOTES, AREQS, FIELDS: [], CONTRACTS: [], SURVEYS: [], NOTICES: [{ id: 'nt1', title: '감리일지 공개 가이드 업데이트', created_at: ts(-5) }], CASES: [], LEAFLETS: [], CREDS: [], CHAT: [], MGRFORMS: [], CARDS: [], ROADMAP: [], DOCS: [], VIEWS: {} }
}
