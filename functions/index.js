// POUR RTDB(test-168a4) 의 일정 노드가 바뀌면 → 즉시 아파트스퀘어(Supabase)에 반영.
// 8개 일정 노드에만 트리거(정산·급여 등 다른 노드는 절대 안 건드림).
// 루프 방지: _origin='aptsq'(우리가 내보낸 것)는 되돌려 읽지 않음.
const functions = require('firebase-functions/v1');
const M = require('./mapping');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INSTANCE = 'test-168a4-default-rtdb';
const REGION = 'asia-southeast1';

async function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

// 단지 목록 캐시(영업→단지 자동 배정 매칭용). 함수 인스턴스가 살아있는 동안 재사용.
let APT_CACHE = { at: 0, list: [] };
async function getApts() {
  if (APT_CACHE.list.length && Date.now() - APT_CACHE.at < 5 * 60 * 1000) return APT_CACHE.list;
  try {
    const r = await sb('apartments?select=id,name');
    const data = await r.json().catch(() => []);
    if (Array.isArray(data)) {
      APT_CACHE = { at: Date.now(), list: data.map(a => ({ id: a.id, name: a.name, norm: M.normName(a.name) })) };
    }
  } catch (e) { /* 실패해도 매칭만 건너뜀 */ }
  return APT_CACHE.list;
}

async function upsert(node, id, s) {
  if (!s || typeof s !== 'object' || s._origin === 'aptsq') return;   // 우리가 내보낸 건 스킵
  const row = M.pourToSupabase(node, id, s);
  if (!row.date) {
    // 날짜가 지워졌거나(또는 애초에 없음) → 기존에 넣어둔 짝이 있으면 캘린더에서 삭제.
    //  (안 그러면 옛 날짜가 그대로 남아 "영업에서 지웠는데 우리 캘린더엔 그대로" 버그)
    await sb(`schedules?sync_id=eq.${encodeURIComponent(row.sync_id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return;
  }
  const r = await sb(`schedules?sync_id=eq.${encodeURIComponent(row.sync_id)}&select=id,apartment_id`);
  const ex = await r.json().catch(() => []);
  // 영업이 글로 적은 단지명 → 비슷한 단지에 자동 배정(확신 있을 때만)
  const autoApt = M.matchApartmentForEntry(s, await getApts());
  if (Array.isArray(ex) && ex.length) {
    if (ex[0].apartment_id) delete row.apartment_id;      // 이미 배정된 단지(관리자 수동 포함)는 유지 — 건드리지 않음
    else row.apartment_id = autoApt || null;              // 비어있을 때만 자동으로 채움
    await sb(`schedules?id=eq.${ex[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  } else {
    row.apartment_id = autoApt || null;
    await sb('schedules', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  }
}

async function del(node, id, before) {
  // POUR에서 지운 게 '우리가 내보낸 일정(_origin=aptsq)'이면 → 우리 원본(Supabase, id=_aptsqId)을 삭제.
  //   (안 그러면 우리 원본이 남아 대시보드에 계속 보이고, 배치가 POUR로 다시 되살림)
  if (before && before._origin === 'aptsq' && before._aptsqId) {
    await sb(`schedules?id=eq.${encodeURIComponent(before._aptsqId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return;
  }
  const sync_id = `pour:${node}:${id}`;
  await sb(`schedules?sync_id=eq.${encodeURIComponent(sync_id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

function handler(node) {
  return async (change, context) => {
    const id = context.params.id;
    const after = change.after.exists() ? change.after.val() : null;
    const before = change.before.exists() ? change.before.val() : null;
    try {
      if (after === null) await del(node, id, before);   // 지워짐 → 아스퀘에서도 삭제(우리 것이면 원본까지)
      else await upsert(node, id, after);                 // 추가/수정 → 아스퀘 upsert
    } catch (e) { console.error('sync err', node, id, e && e.message); }
    return null;
  };
}

for (const node of ['pt', 'briefing', 'sales', 'seminar', 'personal', 'meetings', 'vacation', 'asq']) {
  exports[node] = functions.region(REGION).database.instance(INSTANCE).ref(`/${node}/{id}`).onWrite(handler(node));
}
