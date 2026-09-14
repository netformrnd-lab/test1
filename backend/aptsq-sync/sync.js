// ──────────────────────────────────────────────────────────────────────────
//  aptsq-sync : POUR 영업일정(Firebase RTDB) ↔ 아파트스퀘어(Supabase) 양방향 동기화
//
//  실행: node sync.js            (상주 = 실시간 양방향)
//        node sync.js --once     (한 번만 당겨오고 종료, 점검용)
//
//  ⚠️  동기화 대상은 일정 노드 8개(pt/briefing/sales/seminar/personal/
//      meetings/vacation/asq) 뿐. 정산·급여·하이웍스 데이터는 절대 건드리지 않음.
//
//  루프 방지
//   · POUR→아파트스퀘어로 넣은 row 는 source='pour' → 되돌려 쓰지 않음
//   · 아파트스퀘어→POUR 로 넣은 객체엔 _origin:'aptsq' 표식 → 되돌려 읽지 않음
//  충돌: 마지막에 바뀐 쪽이 이김(Last-Write-Wins, ext_updated_at/updated_at 비교)
//  삭제: 한 쪽에서 지워지면 다른 쪽의 짝도 삭제
// ──────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const M = require('./mapping');

// ── 환경변수 ────────────────────────────────────────────────────────────────
const {
  FIREBASE_DATABASE_URL = 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app',
  FIREBASE_SERVICE_ACCOUNT,          // 서비스계정 JSON 경로 또는 JSON 문자열
  SUPABASE_URL = 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY,         // service_role 키 (절대 깃에 올리지 말 것)
} = process.env;

const ONCE = process.argv.includes('--once');

function die(msg) { console.error('❌ ' + msg); process.exit(1); }
if (!FIREBASE_SERVICE_ACCOUNT) die('FIREBASE_SERVICE_ACCOUNT 가 없습니다 (.env 확인)');
if (!SUPABASE_SERVICE_ROLE_KEY) die('SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (.env 확인)');

// ── Firebase Admin ──────────────────────────────────────────────────────────
function loadServiceAccount(v) {
  const s = v.trim();
  if (s.startsWith('{')) return JSON.parse(s);         // JSON 문자열
  return require(require('path').resolve(s));           // 파일 경로
}
admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount(FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: FIREBASE_DATABASE_URL,
});
const rtdb = admin.database();

// ── Supabase (service_role = RLS 우회, 서버 전용) ────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(new Date().toISOString(), ...a);

// 방금 내가 쓴 키를 잠깐 기억해 두었다가 에코(되울림) 이벤트를 무시한다
const recentlyWritten = new Map(); // key -> expireAt(ms)
function markWritten(key, ms = 4000) { recentlyWritten.set(key, Date.now() + ms); }
function wasJustWritten(key) {
  const exp = recentlyWritten.get(key);
  if (!exp) return false;
  if (Date.now() > exp) { recentlyWritten.delete(key); return false; }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  방향 A : POUR(RTDB) → 아파트스퀘어(Supabase)
// ════════════════════════════════════════════════════════════════════════════
async function importPourEntry(node, id, s) {
  if (!s || typeof s !== 'object') return;
  if (s._origin === 'aptsq') return;                 // 우리가 POUR에 넣은 것 → 되돌려 읽지 않음
  const syncId = `pour:${node}:${id}`;
  if (wasJustWritten('sb:' + syncId)) return;

  const row = M.pourToSupabase(node, id, s);
  if (!row.date) return;                             // 날짜 없는 건 스킵

  // sync_id 로 이미 있으면 update, 없으면 insert
  const { data: existing } = await sb
    .from('schedules').select('id').eq('sync_id', syncId).maybeSingle();

  if (existing) {
    await sb.from('schedules').update(row).eq('id', existing.id);
  } else {
    await sb.from('schedules').insert(row);
  }
  markWritten('pour:' + syncId); // 곧 도착할 POUR 쪽 에코 방지는 불필요하지만 대칭 위해
  log(`A⬅  POUR/${node}/${id} → Supabase (${row.title})`);
}

async function removePourEntry(node, id) {
  const syncId = `pour:${node}:${id}`;
  const { data } = await sb.from('schedules').select('id').eq('sync_id', syncId).maybeSingle();
  if (data) {
    await sb.from('schedules').delete().eq('id', data.id);
    log(`A🗑  POUR/${node}/${id} 삭제 → Supabase 짝 삭제`);
  }
}

function watchPour() {
  for (const node of M.SYNC_NODES) {
    const ref = rtdb.ref(node);
    ref.on('child_added',   snap => importPourEntry(node, snap.key, snap.val()).catch(e => log('A err', e.message)));
    ref.on('child_changed', snap => importPourEntry(node, snap.key, snap.val()).catch(e => log('A err', e.message)));
    ref.on('child_removed', snap => removePourEntry(node, snap.key).catch(e => log('A err', e.message)));
  }
  log('▶ POUR(RTDB) 감시 시작:', M.SYNC_NODES.join(', '));
}

// ════════════════════════════════════════════════════════════════════════════
//  방향 B : 아파트스퀘어(Supabase) → POUR(RTDB)
// ════════════════════════════════════════════════════════════════════════════
async function pushSupabaseRow(row) {
  if (!row || row.source !== 'aptsq') return;        // POUR에서 온 건 되돌려 쓰지 않음
  const obj = M.supabaseToPour(row);
  if (!obj) return;                                  // 내보낼 노드가 없는 category
  const node = M.CATEGORY_TO_NODE[row.category];
  if (wasJustWritten('rt:' + node + '/' + obj.id)) return;

  markWritten('rt:' + node + '/' + obj.id);
  await rtdb.ref(`${node}/${M.safeId(obj.id)}`).set(obj);
  log(`B⮕  Supabase ${row.id} → POUR/${node}/${obj.id} (${row.title})`);
}

async function removeSupabaseRowFromPour(row) {
  const node = M.CATEGORY_TO_NODE[row.category];
  if (!node) return;
  const rtdbId = M.safeId(`asq_${row.id}`);
  await rtdb.ref(`${node}/${rtdbId}`).remove();
  log(`B🗑  Supabase ${row.id} 삭제 → POUR/${node}/${rtdbId} 삭제`);
}

function watchSupabase() {
  sb.channel('aptsq-sync-schedules')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, payload => {
      const row = payload.new || payload.old;
      if (!row) return;
      if (payload.eventType === 'DELETE') {
        if ((payload.old || {}).source === 'aptsq') removeSupabaseRowFromPour(payload.old).catch(e => log('B err', e.message));
      } else {
        pushSupabaseRow(payload.new).catch(e => log('B err', e.message));
      }
    })
    .subscribe(status => log('▶ Supabase 실시간 구독:', status));
}

// ── 풀 싱크(양쪽을 한 번씩 훑어 맞춘다: 생성·수정·삭제 모두) ──────────────────
//   --once / 크론(GitHub Actions) 모드는 이 한 번으로 완전한 양방향 동기화가 됨.
async function reconcileSync() {
  // ── 방향 A : POUR(RTDB) → Supabase ──────────────────────────────────────
  const livePourSyncIds = new Set();   // 지금 POUR에 살아있는 pour 일정
  const aptsqIdsInPour = new Set();    // POUR에 남아있는 '아파트스퀘어발' 일정의 원본 id
  for (const node of M.SYNC_NODES) {
    const snap = await rtdb.ref(node).get();
    const val = snap.val() || {};
    for (const [id, s] of Object.entries(val)) {
      if (s && s._origin === 'aptsq') {            // 우리가 내보낸 것 → 되돌려 읽지 않음
        if (s._aptsqId) aptsqIdsInPour.add(String(s._aptsqId));
        continue;
      }
      livePourSyncIds.add(`pour:${node}:${id}`);
      await importPourEntry(node, id, s);
    }
  }
  // POUR에서 사라진 pour 일정 → Supabase 짝 삭제
  const { data: pourRows } = await sb.from('schedules').select('id,sync_id').eq('source', 'pour');
  for (const r of pourRows || []) {
    if (r.sync_id && !livePourSyncIds.has(r.sync_id)) {
      await sb.from('schedules').delete().eq('id', r.id);
      log(`A🗑  POUR에서 사라짐 → Supabase ${r.id} 삭제`);
    }
  }

  // ── 방향 B : Supabase(aptsq) → POUR(RTDB) ───────────────────────────────
  const { data: rows } = await sb.from('schedules').select('*').eq('source', 'aptsq');
  const liveAptsqIds = new Set();
  for (const row of rows || []) {
    if (M.CATEGORY_TO_NODE[row.category]) liveAptsqIds.add(String(row.id));
    await pushSupabaseRow(row);
  }
  // 아파트스퀘어에서 사라진 일정 → POUR 짝 삭제
  for (const aptsqId of aptsqIdsInPour) {
    if (!liveAptsqIds.has(aptsqId)) {
      for (const node of M.SYNC_NODES) {   // 어느 노드인지 몰라 전 노드에서 제거 시도
        await rtdb.ref(`${node}/${M.safeId('asq_' + aptsqId)}`).remove();
      }
      log(`B🗑  아파트스퀘어에서 사라짐 → POUR asq_${aptsqId} 삭제`);
    }
  }
  log('✅ 동기화 완료');
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('aptsq-sync 시작', ONCE ? '(--once)' : '(상주)');
  await reconcileSync();
  if (ONCE) { process.exit(0); }
  watchPour();
  watchSupabase();
  log('🔄 양방향 실시간 동기화 가동 중… (Ctrl+C 로 종료)');
})().catch(e => die(e.stack || e.message));
