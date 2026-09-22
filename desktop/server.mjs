// 아파트스퀘어 영상 제작실 — PC에서 도는 작은 서버.
//
// 이 프로그램이 하는 일은 하나다. 브라우저가 못 하는 바깥 통화를 대신 해 준다.
//   · 클로드에게 대본을 쓰게 한다
//   · GPT 에게 검수를 시킨다
//   · 헤이젠에게 영상을 만들게 한다
// 화면은 studio/index.html 그대로다. 같은 페이지가 여기서도 돌아간다.
//
// API 키는 이 폴더의 keys.json 에만 있다. 브라우저로는 가려진 형태만 내려간다.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');
const STORE = join(DATA, 'store.json');
const KEYS = join(HERE, 'keys.json');

/* ── 키 ────────────────────────────────────────────────────── */

const FIELDS = ['heygen', 'claude', 'openai', 'openaiModel',
                'heygenCreate', 'heygenStatus', 'heygenQuota', 'heygenBody'];
const DEFAULTS = {
  heygen: '', claude: '', openai: '', openaiModel: 'gpt-4o',
  heygenCreate: '/v2/video/generate',
  heygenStatus: '/v1/video_status.get',
  heygenQuota: '/v2/user/remaining_quota',
  heygenBody: 'agent'
};

let keys = { ...DEFAULTS };

function loadKeys() {
  // 예전 설정.txt 를 쓰던 분들을 위해 한 번 읽어 온다.
  for (const name of ['설정.txt', '.env']) {
    const p = join(HERE, name);
    if (!existsSync(p)) continue;
    const map = { HEYGEN_API_KEY: 'heygen', ANTHROPIC_API_KEY: 'claude',
                  OPENAI_API_KEY: 'openai', OPENAI_MODEL: 'openaiModel',
                  HEYGEN_CREATE_PATH: 'heygenCreate', HEYGEN_STATUS_PATH: 'heygenStatus',
                  HEYGEN_QUOTA_PATH: 'heygenQuota', HEYGEN_BODY: 'heygenBody' };
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = map[t.slice(0, i).trim()];
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (k && v) keys[k] = v;
    }
  }
  if (existsSync(KEYS)) {
    try {
      const j = JSON.parse(readFileSync(KEYS, 'utf8'));
      for (const f of FIELDS) if (typeof j[f] === 'string' && j[f]) keys[f] = j[f];
    } catch {}
  }
  for (const f of FIELDS) if (process.env[f.toUpperCase()]) keys[f] = process.env[f.toUpperCase()];
}

async function saveKeys() {
  await writeFile(KEYS, JSON.stringify(keys, null, 2), 'utf8');
}

// 화면에는 끝 네 자리만 보낸다.
function maskedKeys() {
  const mask = (v) => (v ? '••••••••' + String(v).slice(-4) : '');
  return {
    heygen: mask(keys.heygen), claude: mask(keys.claude), openai: mask(keys.openai),
    has: { heygen: !!keys.heygen, claude: !!keys.claude, openai: !!keys.openai },
    openaiModel: keys.openaiModel,
    heygenCreate: keys.heygenCreate, heygenStatus: keys.heygenStatus,
    heygenQuota: keys.heygenQuota, heygenBody: keys.heygenBody
  };
}

/* ── 저장소 ─────────────────────────────────────────────────── */

let store = { videos: [], settings: {}, notes: [] };
let writing = null;

async function loadStore() {
  try { store = JSON.parse(await readFile(STORE, 'utf8')); } catch {}
}
async function saveStore() {
  writing = (writing || Promise.resolve())
    .then(() => mkdir(DATA, { recursive: true }))
    .then(() => writeFile(STORE, JSON.stringify(store, null, 1), 'utf8'))
    .catch((e) => console.error('저장 실패:', e.message));
  return writing;
}

/* ── AI 에게 묻기 ───────────────────────────────────────────── */

// 두 서비스 모두 "JSON만 답하라"고 해도 앞뒤에 말을 붙일 때가 있다.
function parseJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const a = t.indexOf(open), b = t.lastIndexOf(close);
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  }
  return null;
}

let anthropic = null;
async function askClaude(input, signal) {
  if (!anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: keys.claude });
  }
  const res = await anthropic.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: input }]
  }, { signal });
  if (res.stop_reason === 'refusal') {
    throw Object.assign(
      new Error('클로드가 이 내용을 처리하지 않았습니다. ' + (res.stop_details?.explanation || '')),
      { code: 'refused' });
  }
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function askOpenAI(input, signal) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + keys.openai },
    body: JSON.stringify({
      model: keys.openaiModel || 'gpt-4o',
      messages: [{ role: 'user', content: input }],
      response_format: { type: 'json_object' }
    })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw Object.assign(new Error(j?.error?.message || ('ChatGPT 오류 ' + r.status)),
      { code: r.status === 429 ? 'rate_limited' : 'upstream_error' });
  }
  return j?.choices?.[0]?.message?.content || '';
}

// 2차 검수만 GPT 에게 보낸다. 서로 다른 눈으로 보라는 게 요점이다.
// 한쪽 키만 있으면 있는 쪽이 전부 본다.
function pick(role) {
  if (role === 'review2' && keys.openai) return { who: 'ChatGPT', run: askOpenAI };
  if (keys.claude) return { who: '클로드', run: askClaude };
  if (keys.openai) return { who: 'ChatGPT', run: askOpenAI };
  return null;
}

/* ── 헤이젠 ─────────────────────────────────────────────────── */

async function hg(path, { method = 'GET', body } = {}) {
  const res = await fetch('https://api.heygen.com' + path, {
    method,
    headers: {
      'X-Api-Key': keys.heygen, Accept: 'application/json',
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
function dig(obj, names) {
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 4 || seen.has(o)) return undefined;
    seen.add(o);
    for (const k of names) {
      const v = o[k];
      if (typeof v === 'string' || typeof v === 'number') return v;
    }
    for (const v of Object.values(o)) {
      const r = walk(v, d + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(obj, 0);
}

function createBody(prompt, title) {
  if (keys.heygenBody === 'avatar') {
    return { title, caption: true, dimension: { width: 1920, height: 1080 },
             video_inputs: [{ voice: { type: 'text', input_text: prompt } }] };
  }
  return { prompt, title, orientation: 'landscape', caption: true };
}

/* ── 페이지 ─────────────────────────────────────────────────── */

function pagePath() {
  for (const p of [join(HERE, 'index.html'),
                   resolve(HERE, '..', 'studio', 'index.html'),
                   resolve(HERE, '..', 'index.html')]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const RESET = `
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px/1.6 system-ui,-apple-system,sans-serif;background:#eef1f4}
img{max-width:100%}
[hidden]{display:none!important}
`;

function shim() {
  const flags = {
    local: true,
    heygen: !!keys.heygen,
    claude: !!keys.claude,
    openai: !!keys.openai,
    reviewer1: pick('review1')?.who || null,
    reviewer2: pick('review2')?.who || null
  };
  return `
window.APTSQ_LOCAL = ${JSON.stringify(flags)};
(function(){
  function post(url, body, signal){
    return fetch(url, {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body), signal: signal}).then(function(r){ return r.json(); });
  }

  /* 페이지는 claude.ai 의 두 기능만 쓴다. 둘 다 이 PC 것으로 갈아 끼운다. */

  var ART = { publish: function(files){
    var body = files && files['data/store.json'];
    if (typeof body !== 'string') return Promise.resolve({});
    return post('/api/store', JSON.parse(body)).then(function(){ return {}; });
  }};

  function sample(){ return Promise.reject({code:'not_declared'}); }
  sample.json = function(input, opts){
    opts = opts || {};
    return post('/api/ask', {input:input, role:opts.role || ''}, opts.signal)
      .then(function(j){
        if (!j || j.error) throw {code:(j && j.code) || 'upstream_error',
                                  message:(j && j.error) || '응답이 없습니다'};
        return j.data;
      }, function(e){
        if (e && (e.name === 'AbortError' || e.code === 'cancelled')) throw {code:'cancelled'};
        throw (e && e.code) ? e : {code:'upstream_error', message:String((e && e.message) || e)};
      });
  };
  sample.limits = function(){ return Promise.resolve({maxPromptBytes:65536}); };

  window.claude = { use: function(name){
    if (name === 'artifact' || name === 'self') return Promise.resolve(ART);
    if (name === 'sample') return Promise.resolve(sample);
    return Promise.resolve(null);
  }};
})();
`;
}

async function servePage(res) {
  const p = pagePath();
  if (!p) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('index.html 을 찾지 못했습니다. studio 폴더가 이 폴더 옆에 있어야 합니다.');
    return;
  }
  const html = await readFile(p, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>' + RESET + '</style><script>' + shim() + '</script></head><body>' +
    html + '</body></html>');
}

/* ── 라우팅 ─────────────────────────────────────────────────── */

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 4e6) { req.destroy(); fail(new Error('too large')); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { fail(e); } });
    req.on('error', fail);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  try {
    if (path === '/' || path === '/index.html') return await servePage(res);

    if (path === '/data/store.json') return json(res, 200, store);

    if (path === '/data/reference.json') {
      for (const p2 of [join(DATA, 'reference.json'), resolve(HERE, '..', 'studio', 'data', 'reference.json')]) {
        if (!existsSync(p2)) continue;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(await readFile(p2, 'utf8'));
      }
      return json(res, 404, { error: 'reference.json 을 찾지 못했습니다.' });
    }

    if (path === '/api/store' && req.method === 'POST') {
      store = await readBody(req);
      await saveStore();
      return json(res, 200, { ok: true });
    }

    if (path === '/api/keys') {
      if (req.method === 'GET') return json(res, 200, maskedKeys());
      if (req.method === 'POST') {
        const b = await readBody(req);
        for (const f of FIELDS) {
          if (typeof b[f] !== 'string') continue;
          // 가려진 값이 그대로 돌아오면 건드리지 않는다.
          if (b[f].indexOf('••') === 0) continue;
          keys[f] = b[f].trim();
        }
        await saveKeys();
        anthropic = null;
        return json(res, 200, { ok: true, ...maskedKeys(), restart: true });
      }
    }

    if (path === '/api/ask' && req.method === 'POST') {
      const { input, role } = await readBody(req);
      const who = pick(String(role || ''));
      if (!who) return json(res, 200, { error: '자료 탭에서 클로드나 ChatGPT 키를 넣어 주세요.', code: 'not_granted' });
      const ac = new AbortController();
      req.on('close', () => ac.abort());
      try {
        const text = await who.run(String(input || ''), ac.signal);
        const data = parseJson(text);
        if (!data) return json(res, 200, { error: who.who + ' 답이 형식에 맞지 않습니다.', code: 'invalid_json' });
        return json(res, 200, { data, by: who.who });
      } catch (e) {
        if (e?.name === 'AbortError') return json(res, 200, { error: '중단', code: 'cancelled' });
        console.error('AI 호출 실패:', e.message);
        return json(res, 200, { error: who.who + ': ' + e.message, code: e.code || 'upstream_error' });
      }
    }

    if (path.startsWith('/api/heygen/')) {
      if (!keys.heygen) return json(res, 200, { error: '자료 탭에서 헤이젠 키를 먼저 넣어 주세요.' });

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
          } catch (e) { rows.push({ method, path: p, status: 'ERR', body: e.message }); }
        }
        return json(res, 200, { rows,
          note: '400/422 는 주소는 맞고 본문이 다르다는 뜻, 404 는 없는 주소, 401 은 키 문제입니다.' });
      }

      if (path === '/api/heygen/quota') {
        const r = await hg(keys.heygenQuota);
        if (!r.ok) return json(res, 200, { error: 'HTTP ' + r.status + ' ' + r.text.slice(0, 200) });
        return json(res, 200, { remaining: dig(r.json, ['remaining_quota', 'remaining', 'quota', 'credits']) ?? null });
      }

      if (path === '/api/heygen/create' && req.method === 'POST') {
        const { prompt, title } = await readBody(req);
        if (!prompt) return json(res, 200, { error: '프롬프트가 비어 있습니다.' });
        const r = await hg(keys.heygenCreate, { method: 'POST', body: createBody(String(prompt), String(title || '영상')) });
        if (!r.ok) {
          return json(res, 200, {
            error: 'HTTP ' + r.status + ' — ' + r.text.slice(0, 400),
            hint: '자료 탭의 헤이젠 주소를 바꿔 보세요. /api/heygen/discover 로 확인할 수 있습니다.'
          });
        }
        const id = dig(r.json, ['video_id', 'videoId', 'id', 'task_id']);
        if (!id) return json(res, 200, { error: '영상 번호를 찾지 못했습니다. 응답: ' + r.text.slice(0, 400) });
        return json(res, 200, { id: String(id) });
      }

      if (path === '/api/heygen/status') {
        const id = url.searchParams.get('id');
        if (!id) return json(res, 200, { error: '영상 번호가 없습니다.' });
        const sep = keys.heygenStatus.includes('?') ? '&' : '?';
        const r = await hg(keys.heygenStatus + sep + 'video_id=' + encodeURIComponent(id));
        if (!r.ok) return json(res, 200, { error: 'HTTP ' + r.status + ' ' + r.text.slice(0, 300) });
        return json(res, 200, {
          status: String(dig(r.json, ['status', 'state']) || 'unknown'),
          url: dig(r.json, ['video_url', 'videoUrl', 'url', 'download_url']) || null,
          duration: Number(dig(r.json, ['duration', 'video_duration', 'seconds'])) || null,
          error: dig(r.json, ['error', 'message', 'msg']) || null
        });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('없는 주소입니다.');
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

/* ── 시작 ───────────────────────────────────────────────────── */

function openBrowser(addr) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', addr]]
    : process.platform === 'darwin' ? ['open', [addr]] : ['xdg-open', [addr]];
  const miss = () => console.log('  브라우저를 자동으로 못 열었습니다. 위 주소를 직접 여세요.');
  try {
    const c = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
    c.on('error', miss);          // spawn 실패는 비동기로 온다. 받아 두지 않으면 서버가 죽는다.
    c.unref();
  } catch { miss(); }
}

loadKeys();
await loadStore();

const PORT = Number(process.env.PORT) || 8765;
server.listen(PORT, '127.0.0.1', () => {
  const addr = 'http://localhost:' + PORT;
  const mark = (b) => (b ? '있음' : '없음');
  console.log('');
  console.log('  아파트스퀘어 영상 제작실');
  console.log('  ' + addr);
  console.log('');
  console.log('  헤이젠 키  ' + mark(keys.heygen) + '   (영상 제작)');
  console.log('  클로드 키  ' + mark(keys.claude) + '   (대본 작성 · 1차 검수)');
  console.log('  ChatGPT 키 ' + mark(keys.openai) + '   (2차 검수)');
  if (!keys.heygen && !keys.claude && !keys.openai) {
    console.log('');
    console.log('  키가 하나도 없습니다. 브라우저 화면의 [자료] 탭에서 넣으세요.');
  }
  console.log('');
  console.log('  이 창을 닫으면 제작실도 닫힙니다.');
  console.log('');
  openBrowser(addr);
});
