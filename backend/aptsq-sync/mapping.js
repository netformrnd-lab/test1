// ──────────────────────────────────────────────────────────────────────────
//  POUR 영업일정(Firebase RTDB, test-168a4)  ↔  아파트스퀘어(Supabase schedules)
//  필드 매핑 한 곳. 양방향 변환을 여기서만 관리한다.
// ──────────────────────────────────────────────────────────────────────────

// POUR RTDB 노드 → 아파트스퀘어 category
// (아파트스퀘어 sc-cat 옵션과 1:1로 맞춰둔 값. supabase-app.js APP_CAT_LABEL 참고)
const NODE_TO_CATEGORY = {
  pt: 'pt',
  briefing: 'bids',     // 현설
  sales: 'sales',       // 영업
  seminar: 'seminar',
  personal: 'personal',
  meetings: 'meeting',  // 회의
  vacation: 'vacation', // 휴가
  asq: 'asq',           // 아스퀘
};

// 역매핑 (아파트스퀘어 category → POUR 노드)
const CATEGORY_TO_NODE = Object.fromEntries(
  Object.entries(NODE_TO_CATEGORY).map(([node, cat]) => [cat, node])
);
// 아파트스퀘어에만 있는 'work'(공사일정)은 POUR로 내보내지 않는다(현장 내부 일정).

// 동기화 대상 노드 (정산/급여 데이터는 절대 건드리지 않음)
const SYNC_NODES = Object.keys(NODE_TO_CATEGORY);

// RTDB 키로 쓸 수 없는 문자 치환 (App.jsx safeId와 동일 규칙)
function safeId(id) {
  return String(id).replace(/[.#$/\[\]]/g, '_');
}

// POUR 소프트 삭제 판별: POUR는 일정을 지울 때 키를 없애지 않고
//  deleted:true (또는 deletion 객체)만 세팅한다. 이 플래그가 있으면 '삭제된 것'으로 취급.
function isDeleted(s) {
  return !!(s && typeof s === 'object' && (s.deleted === true || (s.deletion && typeof s.deletion === 'object')));
}

// 이름에서 '님' 떼기 (App.jsx normalizeSchedule과 동일)
function stripNim(name) {
  return typeof name === 'string' ? name.replace(/\s*님$/, '').trim() : name;
}

// 여러 이름 필드를 하나의 담당자 문자열로
function assigneeText(s) {
  if (Array.isArray(s.assignees)) return s.assignees.map(stripNim).filter(Boolean).join(', ');
  if (Array.isArray(s.attendees)) return s.attendees.map(stripNim).filter(Boolean).join(', ');
  return stripNim(s.ptAssignee || s.assignee || '') || '';
}

// ── POUR(RTDB) 일정 → 아파트스퀘어 schedules row ───────────────────────────
// node: 'pt'|'briefing'|... , id: RTDB push-id, s: 일정 객체
function pourToSupabase(node, id, s) {
  const title =
    s.siteName || s.title || s.company || s.requester || '(제목 없음)';

  // 시간 + 담당 + 내용을 description 한 줄로 모은다(아파트스퀘어는 단일 메모 필드)
  const parts = [];
  if (s.time) parts.push(s.time);
  const who = assigneeText(s);
  if (who) parts.push('담당 ' + who);
  if (s.location) parts.push(s.location);
  if (s.content) parts.push(s.content);
  if (s.workType) parts.push(s.workType);
  if (s.note) parts.push(s.note);

  return {
    source: 'pour',
    sync_id: `pour:${node}:${id}`,
    category: NODE_TO_CATEGORY[node] || null,
    date: pickDate(s),
    title: String(title).slice(0, 300),
    description: parts.join(' · ').slice(0, 1000) || null,
    assignee_name: who || null,  // 담당자 — 캘린더/앱에서 담당 표시에 사용
    apartment_id: null,          // POUR 일정은 특정 단지에 매이지 않음
    resident_visible: false,     // 영업일정은 입주민에게 비공개가 기본
    ext_updated_at: new Date().toISOString(),
  };
}

// ── 아파트스퀘어 schedules row → POUR(RTDB) 일정 객체 ──────────────────────
//  POUR 캘린더는 실제 POUR 일정과 '똑같은 모양'만 화면에 그린다:
//   · 반드시 type(노드명) + dateType:'confirmed' + status:'확정' 가 있어야 달력에 뜸.
//   · 노드마다 제목 필드가 다름(pt/briefing=siteName, 나머지=title, sales=company).
//  → POUR 실데이터(dumpnodes.js 로 확인)와 동일한 필드를 채워 넣는다.
function supabaseToPour(row) {
  const node = CATEGORY_TO_NODE[row.category];
  if (!node) return null; // 내보낼 노드가 없는 category(work 등)는 건너뜀

  const rtdbId = `asq_${row.id}`;           // 우리 쪽 id 기반의 안정적인 키

  // meta(POUR 상세 폼)가 있으면 그대로 POUR 모양으로 전송 (id/_origin/date 만 보정)
  if (row.meta && typeof row.meta === 'object') {
    const m = Object.assign({}, row.meta);
    // ★ POUR 달력은 dateType==="confirmed"&&date 만 그림(monthOnly/pending은 안 그림).
    //   그래서 '예정'을 POUR 달력에 띄우려면 confirmed 로 보내되 제목에 [예정] 표식을 단다.
    if (m.dateType === 'expected') {
      const theDate = m.date || row.date || '';
      const tag = '[예정] ';
      if (theDate) {
        m.dateType = 'confirmed';
        m.status = '월예정';
        m.date = theDate;
        if (!m.expectedMonth) m.expectedMonth = String(theDate).slice(0, 7);
        if (m.siteName) m.siteName = String(m.siteName).startsWith(tag) ? m.siteName : tag + m.siteName;
        if (m.title) m.title = String(m.title).startsWith(tag) ? m.title : tag + m.title;
        if (!m.siteName && !m.title) m.title = tag.trim();
      } else {
        m.dateType = 'monthOnly'; m.status = '월예정';   // 날짜 없으면 달력에 못 놓음(예정월 목록만)
      }
    } else if (m.dateType === 'tbd') {
      m.dateType = 'pending';
      m.status = '일정조율중';
    }
    return Object.assign(m, {
      id: rtdbId, _origin: 'aptsq', _aptsqId: String(row.id),
      _syncedAt: new Date().toISOString(),
      date: m.date || row.date || '',
    });
  }

  const title = row.title || '';
  const memo = row.description || '';
  const who = row.assignee_name || '';      // 담당자 이름(POUR는 assignees 배열/assignee 문자열 사용)
  const date = row.date || '';
  const syncedAt = new Date().toISOString();

  // sales(영업)는 POUR에서 type/dateType 없이 단순 구조 → 그대로 맞춤
  if (node === 'sales') {
    return {
      id: rtdbId, date, company: title, content: memo, assignee: who,
      contactPerson: '', contactPhone: '', followUp: '',
      _origin: 'aptsq', _aptsqId: String(row.id), _syncedAt: syncedAt,
    };
  }

  // 그 외 노드: POUR 확정일정 공통 필드
  const base = {
    id: rtdbId, date,
    type: node === 'meetings' ? 'meeting' : node,   // POUR 항목 type
    dateType: 'confirmed',                          // ★ 이게 있어야 POUR 달력에 그려짐
    status: '확정',
    mainCategory: '재도장',
    address: '', competitor: '', dateNote: '', expectedMonth: '',
    location: '', note: memo, participants: '', ptAssignee: '',
    requester: '', time: '', workType: '',
    _origin: 'aptsq', _aptsqId: String(row.id), _syncedAt: syncedAt,
  };

  switch (node) {
    case 'pt':
      return { ...base, siteName: title, title: '', ptAssignee: who };
    case 'briefing':                                 // 현설
      return { ...base, siteName: title, title: '', assignee: who, ptProduct: '', bidDeadline: '' };
    case 'meetings':                                 // 회의
      return { id: rtdbId, date, type: 'meeting', title, time: '', location: '',
        attendees: who ? [who] : [], responses: {}, createdAt: syncedAt,
        _origin: 'aptsq', _aptsqId: String(row.id), _syncedAt: syncedAt };
    case 'seminar':
    case 'personal':
    case 'vacation':
      return { ...base, title, siteName: '', assignee: '', assignees: who ? [who] : [], ptProduct: '', bidDeadline: '' };
    case 'asq':                                      // 아스퀘 (POUR에도 있는 분류)
      return { ...base, title, siteName: title, assignee: who, assignees: who ? [who] : [], ptProduct: '', bidDeadline: '' };
    default:
      return { ...base, title };
  }
}

// ── 영업(POUR) 텍스트에 적힌 단지명 → 아파트스퀘어 단지 자동 매칭 ──────────────
//  영업담당이 일정에 단지를 '글로' 적으면(siteName/title/company/location/content 등)
//  이름이 충분히 비슷한 단지에 자동 배정한다. 애매하면(확신 부족) 배정하지 않음
//  → 기존처럼 관리자 수동 배정. 오배정(엉뚱한 단지에 붙는 것)보다 미배정이 안전.
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')                                   // 괄호 안 제거
    .replace(/\d+\s*차/g, ' ')                                  // 1차 / 2차
    .replace(/아파트단지|아파트|apartment|apt|오피스텔|주상복합|빌라|단지|현장/g, ' ')
    .replace(/[^0-9a-z가-힣]/g, '');                             // 공백·기호 모두 제거
}

// 문자 bigram 집합(짧은 한글 단지명 비교에 적합)
function bigrams(str) {
  const g = new Set();
  if (str.length === 1) { g.add(str); return g; }
  for (let i = 0; i < str.length - 1; i++) g.add(str.slice(i, i + 2));
  return g;
}
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a), gb = bigrams(b);
  let inter = 0;
  for (const x of ga) if (gb.has(x)) inter++;
  const uni = ga.size + gb.size - inter;
  return uni ? inter / uni : 0;
}

// apts: [{id, name, norm}] (norm = normName 미리 계산)
// 반환: 충분히 비슷한 단지 id (없으면 null)
function matchApartmentName(text, apts) {
  const t = normName(text);
  if (t.length < 2 || !Array.isArray(apts) || !apts.length) return null;
  let best = null, bestScore = 0, second = 0;
  for (const a of apts) {
    const an = a.norm;
    if (!an || an.length < 2) continue;
    let sc;
    if (t === an) sc = 1;
    else if (t.includes(an) || an.includes(t)) sc = 0.9;        // 포함관계 = 강한 신호
    else sc = similarity(t, an);
    if (sc > bestScore) { second = bestScore; bestScore = sc; best = a; }
    else if (sc > second) second = sc;
  }
  if (!best) return null;
  // 1등이 임계치를 넘고 2등과 충분히 벌어질 때만 배정(비슷한 단지가 둘이면 보류 → 수동)
  if (bestScore >= 0.6 && (bestScore - second) >= 0.12) return best.id;
  if (bestScore >= 0.9 && second < 0.6) return best.id;          // 단독 포함매치
  return null;
}

// 일정 한 건에서 단지명이 들어있을 만한 필드들을 훑어 매칭(앞쪽 필드 우선)
function matchApartmentForEntry(s, apts) {
  if (!s || typeof s !== 'object') return null;
  const fields = [s.siteName, s.title, s.company, s.location, s.requester, s.content, s.note];
  for (const f of fields) {
    if (!f || typeof f !== 'string') continue;
    const id = matchApartmentName(f, apts);
    if (id) return id;
  }
  return null;
}

// 일정 종류마다 날짜 필드명이 달라서(date/startDate/ptDate/...) 여러 곳을 훑는다.
// 명시 필드 → 없으면 값들 중 'YYYY-MM-DD' 처럼 생긴 문자열을 탐색(생성/수정 시각 필드는 제외).
const DATE_FIELDS = [
  'date', 'startDate', 'start', 'scheduleDate', 'dateStr', 'day', 'ymd',
  'ptDate', 'salesDate', 'visitDate', 'meetingDate', 'seminarDate',
  'vacationDate', 'briefingDate', 'when', 'dt', 'endDate', 'end',
];
const SKIP_DATE_KEY = /(created|updated|synced|modified|timestamp|_at$)/i;
function pickDate(s) {
  if (!s || typeof s !== 'object') return null;
  for (const f of DATE_FIELDS) {
    if (s[f] != null) { const d = normalizeDate(s[f]); if (d) return d; }
  }
  // 명시 필드에 없으면: 날짜처럼 생긴 문자열 값을 탐색
  for (const [k, v] of Object.entries(s)) {
    if (SKIP_DATE_KEY.test(k)) continue;
    if (typeof v === 'string' && /^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}/.test(v)) {
      const d = normalizeDate(v); if (d) return d;
    }
  }
  return null;
}

// 진단용: 이 일정에서 날짜가 들어있는 필드명(없으면 null)
function dateFieldOf(s) {
  if (!s || typeof s !== 'object') return null;
  for (const f of DATE_FIELDS) if (s[f] != null && normalizeDate(s[f])) return f;
  for (const [k, v] of Object.entries(s)) {
    if (SKIP_DATE_KEY.test(k)) continue;
    if (typeof v === 'string' && /^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}/.test(v) && normalizeDate(v)) return k + '(추정)';
  }
  return null;
}

// 'YYYY-MM-DD' / Date / timestamp 모두 받아 date 컬럼용 문자열로
function normalizeDate(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const parsed = new Date(d);
    return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
  }
  const parsed = new Date(d);
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
}

module.exports = {
  NODE_TO_CATEGORY,
  CATEGORY_TO_NODE,
  SYNC_NODES,
  safeId,
  pourToSupabase,
  supabaseToPour,
  normalizeDate,
  pickDate,
  dateFieldOf,
  normName,
  matchApartmentName,
  matchApartmentForEntry,
  isDeleted,
};
