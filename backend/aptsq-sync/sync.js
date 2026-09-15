// ──────────────────────────────────────────────────────────────────────────
//  aptsq-sync : POUR 영업일정(Firebase RTDB) ↔ 아파트스퀘어(Supabase) 양방향 동기화
//
//  ✅ Firebase 서비스계정 불필요 — RTDB 권한이 열려 있어 REST 주소만으로 읽고 씀.
//     (POUR 앱 자체가 로그인 없이 RTDB 를 읽고 쓰는 구조라 규칙이 public)
//     필요한 비밀키는 Supabase service_role 하나뿐.
//
//  실행: node sync.js            (상주 = 주기적 폴링 양방향)
//        node sync.js --once     (한 번만 맞추고 종료 · GitHub Actions 용)
//
//  ⚠️  동기화 대상은 일정 노드 8개뿐. 정산·급여·하이웍스 데이터는 건드리지 않음.
//  루프 방지: source='pour' 는 되돌려 쓰지 않고, _origin='aptsq' 는 되돌려 읽지 않음
//  삭제: 한 쪽에서 지워지면 다른 쪽 짝도 삭제
// ──────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const M = require('./mapping');

// ── 환경변수 ────────────────────────────────────────────────────────────────
const {
  FIREBASE_DATABASE_URL = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app',
  FIREBASE_DB_SECRET,                // (선택) RTDB 규칙이 닫혀 있을 때만 필요. 열려 있으면 비워둠.
  SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY,         // Supabase service_role 키 (절대 깃에 올리지 말 것)
  POLL_SECONDS = '60',               // 상주 모드 폴링 주기(초)
} = process.env;

const ONCE = process.argv.includes('--once');
const RTDB = FIREBASE_DATABASE_URL.replace(/\/$/, '');
const AUTH_QS = FIREBASE_DB_SECRET ? `?auth=${encodeURIComponent(FIREBASE_DB_SECRET)}` : '';

function die(msg) { console.error('❌ ' + msg); process.exit(1); }
if (!SUPABASE_SERVICE_ROLE_KEY) die('SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (.env 확인)');
if (typeof fetch !== 'function') die('Node 18+ 가 필요합니다 (global fetch 없음)');

// ── Supabase (service_role = RLS 우회, 서버 전용) ────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── Firebase RTDB REST 헬퍼 (서비스계정 불필요) ──────────────────────────────
function rtdbUrl(path) {
  return `${RTDB}/${path}.json${AUTH_QS}`;
}
async function rtdbGet(path) {
  const res = await fetch(rtdbUrl(path));
  if (!res.ok) throw new Error(`RTDB GET ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}
async function rtdbPut(path, obj) {
  const res = await fetch(rtdbUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`RTDB PUT ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}
async function rtdbDelete(path) {
  const res = await fetch(rtdbUrl(path), { method: 'DELETE' });
  if (!res.ok) throw new Error(`RTDB DELETE ${path} → ${res.status}`);
}

// ── 방향 A : POUR 한 건 → Supabase upsert ────────────────────────────────────
async function importPourEntry(node, id, s) {
  if (!s || typeof s !== 'object') return false;
  if (s._origin === 'aptsq') return false;           // 우리가 내보낸 것 → 되돌려 읽지 않음
  const row = M.pourToSupabase(node, id, s);
  if (!row.date) return false;                        // 날짜 없는 건 스킵
  const { data: existing, error: selErr } = await sb
    .from('schedules').select('id,category,date,title,description').eq('sync_id', row.sync_id).maybeSingle();
  if (selErr) { log(`  ⚠️ ${node}/${id} 조회실패: ${selErr.message}`); return false; }
  if (existing) {
    // 내용이 그대로면 업데이트 생략 → 매 배치마다 무의미한 write 로 실시간이 폭주(앱 번쩍임)하는 것 방지
    const same = existing.category === row.category
      && String(existing.date || '') === String(row.date || '')
      && (existing.title || '') === (row.title || '')
      && (existing.description || '') === (row.description || '');
    if (same) return false;
    const { error } = await sb.from('schedules').update(row).eq('id', existing.id);
    if (error) { log(`  ⚠️ ${node}/${id} 저장실패: ${error.message}`); return false; }
    return true;
  }
  const { error } = await sb.from('schedules').insert(row);
  if (error) { log(`  ⚠️ ${node}/${id} 저장실패: ${error.message}`); return false; }
  return true;                                        // 실제로 저장에 성공한 것만 true
}

// ── 방향 B : Supabase(aptsq) 한 건 → POUR PUT ────────────────────────────────
async function pushSupabaseRow(row) {
  if (!row || row.source !== 'aptsq') return;        // POUR 에서 온 건 되돌려 쓰지 않음
  const obj = M.supabaseToPour(row);
  if (!obj) return;                                  // 내보낼 노드가 없는 category
  const node = M.CATEGORY_TO_NODE[row.category];
  await rtdbPut(`${node}/${M.safeId(obj.id)}`, obj);
}

// ── 풀 싱크(양쪽을 한 번씩 훑어 생성·수정·삭제 모두 맞춘다) ────────────────────
async function reconcileSync() {
  // source 없는(옛날 콘솔로 넣은) 우리 일정 → 'aptsq' 로 표시(POUR 전송 대상이 되도록).
  // POUR 에서 온 건 source='pour' 라 건드리지 않음.
  {
    const { data: fixed, error } = await sb.from('schedules').update({ source: 'aptsq' }).is('source', null).select('id');
    if (!error && fixed && fixed.length) log(`source 없던 우리 일정 ${fixed.length}건 → aptsq 표시`);
  }

  // 방향 A : POUR → Supabase
  const livePourSyncIds = new Set();
  const aptsqIdsInPour = new Set();
  for (const node of M.SYNC_NODES) {
    const val = (await rtdbGet(node)) || {};
    let n = 0, total = 0, noDate = 0; let sample = null;
    for (const [id, s] of Object.entries(val)) {
      if (s && s._origin === 'aptsq') { if (s._aptsqId) aptsqIdsInPour.add(String(s._aptsqId)); continue; }
      total++;
      livePourSyncIds.add(`pour:${node}:${id}`);
      if (!(s && M.pickDate(s))) {                    // 날짜를 못 찾아 건너뛰는 건 따로 집계
        noDate++;
        if (!sample && s && typeof s === 'object') sample = Object.keys(s).slice(0, 12).join(', ');
        continue;
      }
      if (await importPourEntry(node, id, s)) n++;    // 저장 성공한 것만 카운트
    }
    // 종류별 요약: 전체 / 저장 / 날짜없어 건너뜀 (+ 건너뛴 첫 건의 필드명)
    log(`A⬅  POUR/${node}: 전체 ${total} · 저장 ${n} · 날짜없음 ${noDate}` + (noDate && sample ? `  (건너뛴 필드예시: ${sample})` : ''));
  }
  // POUR 에서 사라진 pour 일정 → Supabase 짝 삭제
  const { data: pourRows } = await sb.from('schedules').select('id,sync_id').eq('source', 'pour');
  for (const r of pourRows || []) {
    if (r.sync_id && !livePourSyncIds.has(r.sync_id)) {
      await sb.from('schedules').delete().eq('id', r.id);
      log(`A🗑  POUR에서 사라짐 → Supabase ${r.id} 삭제`);
    }
  }

  // 방향 B : Supabase(aptsq) → POUR
  const { data: rows } = await sb.from('schedules').select('*').eq('source', 'aptsq');
  const liveAptsqIds = new Set();
  let pushed = 0;
  for (const row of rows || []) {
    if (M.CATEGORY_TO_NODE[row.category]) { liveAptsqIds.add(String(row.id)); await pushSupabaseRow(row); pushed++; }
  }
  if (pushed) log(`B⮕  Supabase(aptsq) → POUR ${pushed}건`);
  // 아파트스퀘어에서 사라진 일정 → POUR 짝 삭제
  for (const aptsqId of aptsqIdsInPour) {
    if (!liveAptsqIds.has(aptsqId)) {
      for (const node of M.SYNC_NODES) {
        await rtdbDelete(`${node}/${M.safeId('asq_' + aptsqId)}`).catch(() => {});
      }
      log(`B🗑  아파트스퀘어에서 사라짐 → POUR asq_${aptsqId} 삭제`);
    }
  }
  log('✅ 동기화 완료');
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('aptsq-sync 시작', ONCE ? '(--once)' : `(상주 · ${POLL_SECONDS}초 주기)`, '· RTDB:', RTDB);
  await reconcileSync();
  if (ONCE) { process.exit(0); }
  const ms = Math.max(15, parseInt(POLL_SECONDS, 10) || 60) * 1000;
  setInterval(() => { reconcileSync().catch(e => log('sync err', e.message)); }, ms);
  log(`🔄 ${ms / 1000}초마다 양방향 동기화 (Ctrl+C 로 종료)`);
})().catch(e => die(e.stack || e.message));
