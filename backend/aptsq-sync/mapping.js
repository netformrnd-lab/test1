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
    date: normalizeDate(s.date),
    title: String(title).slice(0, 300),
    description: parts.join(' · ').slice(0, 1000) || null,
    apartment_id: null,          // POUR 일정은 특정 단지에 매이지 않음
    resident_visible: false,     // 영업일정은 입주민에게 비공개가 기본
    ext_updated_at: new Date().toISOString(),
  };
}

// ── 아파트스퀘어 schedules row → POUR(RTDB) 일정 객체 ──────────────────────
// 노드별 필드 모양에 맞춰 최소 필드만 채운다.
function supabaseToPour(row) {
  const node = CATEGORY_TO_NODE[row.category];
  if (!node) return null; // 내보낼 노드가 없는 category(work 등)는 건너뜀

  const rtdbId = `asq_${row.id}`;           // 우리 쪽 id 기반의 안정적인 키
  const base = {
    id: rtdbId,
    date: row.date || '',
    _origin: 'aptsq',                        // 루프 방지 표식
    _aptsqId: row.id,                        // 원본 Supabase row id
    _syncedAt: new Date().toISOString(),
  };

  const title = row.title || '';
  const memo = row.description || '';

  switch (node) {
    case 'pt':
      return { ...base, siteName: title, note: memo, ptAssignee: '', workType: '', status: '' };
    case 'briefing':
      return { ...base, siteName: title, assignee: '', time: memo };
    case 'sales':
      return { ...base, company: title, content: memo, assignee: '' };
    case 'meetings':
      return { ...base, title, time: memo, location: '', attendees: [] };
    case 'personal':
    case 'seminar':
    case 'asq':
      return { ...base, title, time: memo, location: '', assignees: [] };
    case 'vacation':
      return { ...base, title, assignees: [] };
    default:
      return { ...base, title };
  }
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
};
