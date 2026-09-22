// 아파트스퀘어 영상 제작실 — PC에서 도는 작은 서버.
//
// 하는 일
//  1. prompt-studio.html 을 브라우저에 띄운다 (claude.ai 가 아니라 이 PC에서).
//  2. 영상 목록·설정·지식을 data/store.json 에 저장한다.
//  3. 검수 요청을 클로드와 ChatGPT에 대신 보낸다.
//  4. 헤이젠 API로 영상 생성을 요청하고 상태를 확인한다.
//
// API 키는 설정.txt 에만 있고 브라우저로 내려가지 않는다.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');
const STORE_FILE = join(DATA_DIR, 'store.json');

/* ── 설정 읽기 ─────────────────────────────────────────────── */

function loadEnv() {
  const out = { ...process.env };
  for (const name of ['설정.txt', '.env']) {
    const p = join(HERE, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (v) out[k] = v;
    }
  }
  return out;
}

const ENV = loadEnv();
const PORT = Number(ENV.PORT) || 8765;

const HEYGEN_KEY = ENV.HEYGEN_API_KEY || '';
const CLAUDE_KEY = ENV.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = ENV.OPENAI_API_KEY || '';
const OPENAI_MODEL = ENV.OPENAI_MODEL || 'gpt-4o';
const HG = {
  base: 'https://api.heygen.com',
  create: ENV.HEYGEN_CREATE_PATH || '/v2/video/generate',
  status: ENV.HEYGEN_STATUS_PATH || '/v1/video_status.get',
  quota: ENV.HEYGEN_QUOTA_PATH || '/v2/user/remaining_quota',
  body: ENV.HEYGEN_BODY || 'agent'
};

/* ── 저장소 ────────────────────────────────────────────────── */

let store = { videos: {}, config: {} };
let writing = null;

async function loadStore() {
  try {
    store = JSON.parse(await readFile(STORE_FILE, 'utf8'));
  } catch {
    store = { videos: {}, config: {} };
  }
  if (!store.videos) store.videos = {};
  if (!store.config) store.config = {};
}

async function saveStore() {
  // 겹쳐 쓰지 않도록 직전 쓰기가 끝난 뒤 한 번만 쓴다.
  writing = (writing || Promise.resolve())
    .then(() => mkdir(DATA_DIR, { recursive: true }))
    .then(() => writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8'))
    .catch((e) => console.error('저장 실패:', e.message));
  return writing;
}

/* ── 검수: 클로드 · ChatGPT ────────────────────────────────── */

// 두 서비스 모두 "JSON만 답하라"고 해도 앞뒤에 말을 붙일 때가 있다.
function parseJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

let anthropic = null;
async function claudeClient() {
  if (anthropic) return anthropic;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: CLAUDE_KEY });
  return anthropic;
}

async function askClaude(input) {
  const client = await claudeClient();
  const res = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: input }]
  });
  if (res.stop_reason === 'refusal') {
    const why = res.stop_details?.explanation || '';
    throw Object.assign(new Error('클로드가 이 내용을 검수하지 않았습니다. ' + why), { code: 'refused' });
  }
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function askOpenAI(input) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: input }],
      response_format: { type: 'json_object' }
    })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j?.error?.message || ('ChatGPT 오류 ' + r.status);
    throw Object.assign(new Error(msg), { code: r.status === 429 ? 'rate_limited' : 'upstream_error' });
  }
  return j?.choices?.[0]?.message?.content || '';
}

// 1차는 클로드, 2차는 ChatGPT. 한쪽 키만 있으면 있는 쪽이 둘 다 본다.
function reviewerFor(pass) {
  const wantOpenAI = pass === 1;
  if (wantOpenAI && OPENAI_KEY) return { name: 'ChatGPT', run: askOpenAI };
  if (!wantOpenAI && CLAUDE_KEY) return { name: '클로드', run: askClaude };
  if (CLAUDE_KEY) return { name: '클로드', run: askClaude };
  if (OPENAI_KEY) return { name: 'ChatGPT', run: askOpenAI };
  return null;
}

/* ── 헤이젠 ───────────────────────────────────────────────── */

async function hg(path, { method = 'GET', body } = {}) {
  const res = await fetch(HG.base + path, {
    method,
    headers: {
      'X-Api-Key': HEYGEN_KEY,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

// 응답 모양이 계정·버전마다 달라서 흔한 자리를 모두 훑는다.
function dig(obj, keys) {
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o)) return undefined;
    seen.add(o);
    for (const k of keys) if (typeof o[k] === 'string' || typeof o[k] === 'number') return o[k];
    for (const v of Object.values(o)) {
      const r = walk(v, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(obj, 0);
}

function createBody(prompt, title) {
  if (HG.body === 'avatar') {
    return {
      title,
      caption: true,
      dimension: { width: 1920, height: 1080 },
      video_inputs: [{ voice: { type: 'text', input_text: prompt } }]
    };
  }
  return { prompt, title, orientation: 'landscape', caption: true };
}

/* ── 페이지 ───────────────────────────────────────────────── */

function pagePath() {
  for (const p of [join(HERE, 'prompt-studio.html'), resolve(HERE, '..', 'prompt-studio.html')]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const RESET = `
  :root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
  body{margin:0;font:14px/1.6 system-ui,-apple-system,sans-serif;background:#f6f7f9}
  img{max-width:100%}
  [hidden]{display:none!important}
`;

function shim() {
  return `
window.APTSQ_LOCAL = ${JSON.stringify({
    heygen: !!HEYGEN_KEY,
    claude: !!CLAUDE_KEY,
    openai: !!OPENAI_KEY,
    reviewer1: reviewerFor(0)?.name || null,
    reviewer2: reviewerFor(1)?.name || null
  })};
(function(){
  /* claude.ai 의 db 기능을 이 PC의 파일로 대신한다. 페이지 코드는 그대로 둔다. */
  var store={videos:{},config:{}}, subs=[];
  function pull(){
    return fetch('/api/store').then(function(r){return r.json();}).then(function(s){
      store = s && s.videos ? s : {videos:{},config:{}};
      subs.forEach(function(f){ try{ f(); }catch(e){} });
    }).catch(function(){});
  }
  function split(p){ var a=String(p).split('/'); return {col:a[0], id:a.slice(1).join('_')}; }
  function snapDoc(col,id){
    var v = (store[col]||{})[id];
    return {id:id, exists:!!v, data:function(){ return v; }, metadata:{fromCache:false,hasPendingWrites:false}};
  }
  function docRef(path){
    var s=split(path);
    return {
      id:s.id, path:path,
      get:function(){ return pull().then(function(){ return snapDoc(s.col,s.id); }); },
      set:function(d){
        if(!store[s.col]) store[s.col]={};
        store[s.col][s.id]=d;
        subs.forEach(function(f){ try{ f(); }catch(e){} });
        return fetch('/api/store/'+encodeURIComponent(s.col)+'/'+encodeURIComponent(s.id),
          {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
          .then(function(){});
      },
      update:function(d){ return this.set(Object.assign({}, (store[s.col]||{})[s.id]||{}, d)); },
      delete:function(){
        if(store[s.col]) delete store[s.col][s.id];
        subs.forEach(function(f){ try{ f(); }catch(e){} });
        return fetch('/api/store/'+encodeURIComponent(s.col)+'/'+encodeURIComponent(s.id),
          {method:'DELETE'}).then(function(){});
      },
      onSnapshot:function(next){
        var f=function(){ next(snapDoc(s.col,s.id)); };
        subs.push(f); f();
        return function(){ subs=subs.filter(function(x){return x!==f;}); };
      },
      collection:function(){ throw new Error('미지원'); }
    };
  }
  function colRef(col){
    return {
      path:col,
      doc:function(id){ return docRef(col+'/'+id); },
      onSnapshot:function(next){
        var f=function(){
          var m=store[col]||{}, docs=Object.keys(m).map(function(k){ return snapDoc(col,k); });
          next({docs:docs, size:docs.length, empty:!docs.length,
                docChanges:function(){ return []; }, metadata:{fromCache:false,hasPendingWrites:false}});
        };
        subs.push(f); f();
        return function(){ subs=subs.filter(function(x){return x!==f;}); };
      }
    };
  }
  var DB={ doc:docRef, collection:colRef };
  window.claude = { use:function(name){
    if(name==='db') return pull().then(function(){ return DB; });
    return Promise.resolve(null);
  }};
  setInterval(pull, 5000);
})();
`;
}

async function servePage(res) {
  const p = pagePath();
  if (!p) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('prompt-studio.html 을 찾지 못했습니다. 이 폴더나 바로 위 폴더에 두세요.');
    return;
  }
  const html = await readFile(p, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>' + RESET + '</style>' +
    '<script>' + shim() + '</script>' +
    '</head><body>' + html + '</body></html>'
  );
}

/* ── 라우팅 ───────────────────────────────────────────────── */

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 2e6) { req.destroy(); fail(new Error('too large')); }
    });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { fail(e); } });
    req.on('error', fail);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  try {
    if (path === '/' || path === '/index.html') return await servePage(res);

    if (path === '/api/health') {
      return json(res, 200, {
        heygen: !!HEYGEN_KEY, claude: !!CLAUDE_KEY, openai: !!OPENAI_KEY,
        heygenPaths: HG
      });
    }

    if (path === '/api/store' && req.method === 'GET') return json(res, 200, store);

    const m = path.match(/^\/api\/store\/([^/]+)\/([^/]+)$/);
    if (m) {
      const col = decodeURIComponent(m[1]), id = decodeURIComponent(m[2]);
      if (req.method === 'PUT') {
        const b = await readBody(req);
        if (!store[col]) store[col] = {};
        store[col][id] = b;
        await saveStore();
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        if (store[col]) delete store[col][id];
        await saveStore();
        return json(res, 200, { ok: true });
      }
    }

    if (path === '/api/review' && req.method === 'POST') {
      const { pass, input } = await readBody(req);
      const who = reviewerFor(pass | 0);
      if (!who) {
        return json(res, 200, { error: '설정.txt 에 클로드나 ChatGPT 키가 없습니다.', code: 'not_granted' });
      }
      try {
        const text = await who.run(String(input || ''));
        const data = parseJson(text);
        if (!data) return json(res, 200, { error: who.name + ' 답이 형식에 맞지 않습니다.', code: 'invalid_json' });
        return json(res, 200, { data, reviewer: who.name });
      } catch (e) {
        console.error('검수 실패:', e.message);
        return json(res, 200, { error: who.name + ': ' + e.message, code: e.code || 'upstream_error' });
      }
    }

    if (path.startsWith('/api/heygen/')) {
      if (!HEYGEN_KEY) return json(res, 200, { error: '설정.txt 에 HEYGEN_API_KEY 가 없습니다.' });

      if (path === '/api/heygen/discover') {
        const probes = [
          ['GET', '/v2/avatars'], ['GET', '/v2/voices'], ['GET', '/v2/templates'],
          ['GET', '/v2/user/remaining_quota'], ['GET', '/v1/user/remaining_quota'],
          ['POST', '/v2/video/generate'], ['POST', '/v3/video/generate'],
          ['POST', '/v2/video_agent/generate'], ['POST', '/v1/video.generate'],
          ['GET', '/v1/video_status.get?video_id=probe'], ['GET', '/v2/video/status?video_id=probe']
        ];
        const rows = [];
        for (const [method, p] of probes) {
          try {
            const r = await hg(p, method === 'POST' ? { method, body: { __probe: true } } : {});
            rows.push({ method, path: p, status: r.status, body: r.text.slice(0, 200) });
          } catch (e) {
            rows.push({ method, path: p, status: 'ERR', body: e.message });
          }
        }
        return json(res, 200, { rows, note: '400/422 는 주소는 맞고 본문이 다르다는 뜻, 404 는 없는 주소, 401 은 키 문제입니다.' });
      }

      if (path === '/api/heygen/quota') {
        const r = await hg(HG.quota);
        if (!r.ok) return json(res, 200, { error: 'HTTP ' + r.status + ' ' + r.text.slice(0, 200) });
        const q = dig(r.json, ['remaining_quota', 'remaining', 'quota', 'credits']);
        return json(res, 200, { remaining: q ?? null, raw: r.json });
      }

      if (path === '/api/heygen/create' && req.method === 'POST') {
        const { prompt, title } = await readBody(req);
        if (!prompt) return json(res, 200, { error: '프롬프트가 비어 있습니다.' });
        const r = await hg(HG.create, { method: 'POST', body: createBody(String(prompt), String(title || '영상')) });
        if (!r.ok) {
          return json(res, 200, {
            error: 'HTTP ' + r.status + ' — ' + r.text.slice(0, 400),
            hint: '설정.txt 의 HEYGEN_CREATE_PATH / HEYGEN_BODY 를 바꿔 보세요. /api/heygen/discover 로 확인할 수 있습니다.'
          });
        }
        const id = dig(r.json, ['video_id', 'videoId', 'id', 'task_id']);
        if (!id) return json(res, 200, { error: '영상 번호를 찾지 못했습니다. 응답: ' + r.text.slice(0, 400) });
        return json(res, 200, { id: String(id), raw: r.json });
      }

      if (path === '/api/heygen/status') {
        const id = url.searchParams.get('id');
        if (!id) return json(res, 200, { error: '영상 번호가 없습니다.' });
        const sep = HG.status.includes('?') ? '&' : '?';
        const r = await hg(HG.status + sep + 'video_id=' + encodeURIComponent(id));
        if (!r.ok) return json(res, 200, { error: 'HTTP ' + r.status + ' ' + r.text.slice(0, 300) });
        const status = String(dig(r.json, ['status', 'state']) || 'unknown');
        const videoUrl = dig(r.json, ['video_url', 'videoUrl', 'url', 'download_url']);
        const duration = Number(dig(r.json, ['duration', 'video_duration', 'seconds'])) || null;
        const error = dig(r.json, ['error', 'message', 'msg']);
        return json(res, 200, { status, url: videoUrl || null, duration, error: error || null });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('없는 주소입니다.');
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

/* ── 시작 ─────────────────────────────────────────────────── */

function openBrowser(addr) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', addr]]
    : process.platform === 'darwin' ? ['open', [addr]]
      : ['xdg-open', [addr]];
  // spawn 실패는 비동기 error 이벤트로 온다. 받아 두지 않으면 서버가 죽는다.
  try {
    const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log('  브라우저를 자동으로 못 열었습니다. 위 주소를 직접 여세요.'));
    child.unref();
  } catch {
    console.log('  브라우저를 자동으로 못 열었습니다. 위 주소를 직접 여세요.');
  }
}

await loadStore();

server.listen(PORT, '127.0.0.1', () => {
  const addr = 'http://localhost:' + PORT;
  console.log('');
  console.log('  아파트스퀘어 영상 제작실이 열렸습니다.');
  console.log('  주소: ' + addr);
  console.log('');
  console.log('  헤이젠 키: ' + (HEYGEN_KEY ? '있음' : '없음 — 설정.txt 를 확인하세요'));
  console.log('  클로드 키: ' + (CLAUDE_KEY ? '있음 (1차 검수)' : '없음'));
  console.log('  ChatGPT 키: ' + (OPENAI_KEY ? '있음 (2차 검수)' : '없음'));
  console.log('');
  console.log('  이 창을 닫으면 제작실도 닫힙니다.');
  console.log('');
  openBrowser(addr);
});
