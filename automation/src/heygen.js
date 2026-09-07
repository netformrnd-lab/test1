// 헤이젠 API 클라이언트.
// 주의: 이 환경에서는 헤이젠 문서와 API에 접근할 수 없어 엔드포인트를 실제로
// 확인하지 못했다. `discover` 명령으로 계정에서 동작하는 값을 찾아 .env 에 적을 것.
import { writeFile } from 'node:fs/promises';

const BASE = 'https://api.heygen.com';

export class HeyGen {
  constructor(apiKey, opts = {}) {
    if (!apiKey) throw new Error('HEYGEN_API_KEY 가 없습니다. .env 를 확인하세요.');
    this.key = apiKey;
    this.createPath = opts.createPath || '/v2/video/generate';
    this.statusPath = opts.statusPath || '/v1/video_status.get';
  }

  async req(path, { method = 'GET', body, base = BASE } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'X-Api-Key': this.key,
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text };
  }

  // 키가 살아 있는지, 어떤 아바타·보이스를 쓸 수 있는지
  async check() {
    const out = {};
    for (const [name, path] of [
      ['avatars', '/v2/avatars'],
      ['voices', '/v2/voices'],
      ['quota', '/v2/user/remaining_quota']
    ]) {
      const r = await this.req(path);
      out[name] = { status: r.status, ok: r.ok, sample: summarize(r.json) };
    }
    return out;
  }

  // 계정에서 실제로 열려 있는 생성 엔드포인트 찾기
  async discover() {
    const candidates = [
      ['GET',  '/v2/avatars'],
      ['GET',  '/v2/voices'],
      ['GET',  '/v2/templates'],
      ['POST', '/v2/video/generate'],
      ['POST', '/v3/video/generate'],
      ['POST', '/v2/video_agent/generate'],
      ['POST', '/v2/agent/video'],
      ['POST', '/v1/video.generate'],
      ['GET',  '/v1/video_status.get?video_id=probe'],
      ['GET',  '/v2/video/status?video_id=probe']
    ];
    const rows = [];
    for (const [method, path] of candidates) {
      try {
        const r = await this.req(path, method === 'POST'
          ? { method, body: { __probe: true } } : {});
        rows.push({ method, path, status: r.status, hint: hint(r) });
      } catch (e) {
        rows.push({ method, path, status: 'ERR', hint: e.message });
      }
    }
    return rows;
  }

  // 프롬프트를 보내 영상 생성 요청
  async create(prompt, opts = {}) {
    // Video Agent 계열은 프롬프트 한 덩어리를 받는다.
    // 아바타 영상 API(v2/video/generate)는 input 배열을 받는다.
    // 두 형태를 모두 만들어 두고 엔드포인트에 맞는 것을 보낸다.
    const agentBody = {
      prompt,
      title: opts.title || opts.keyword,
      dimension: { width: 1920, height: 1080 },
      ...(opts.callbackUrl ? { callback_url: opts.callbackUrl } : {}),
      ...(opts.avatarId ? { avatar_id: opts.avatarId } : {}),
      ...(opts.voiceId ? { voice_id: opts.voiceId } : {})
    };
    const r = await this.req(this.createPath, { method: 'POST', body: agentBody });
    if (!r.ok) {
      const err = new Error(`생성 요청 실패 ${r.status}: ${r.text.slice(0, 400)}`);
      err.status = r.status;
      err.sentBody = agentBody;
      throw err;
    }
    const id = pick(r.json, ['data.video_id', 'video_id', 'data.id', 'id', 'data.task_id']);
    if (!id) throw new Error('응답에서 video_id 를 찾지 못했습니다: ' + r.text.slice(0, 400));
    return { id, raw: r.json };
  }

  async status(videoId) {
    const sep = this.statusPath.includes('?') ? '&' : '?';
    const r = await this.req(`${this.statusPath}${sep}video_id=${encodeURIComponent(videoId)}`);
    const s = pick(r.json, ['data.status', 'status']);
    const url = pick(r.json, ['data.video_url', 'video_url', 'data.url']);
    const err = pick(r.json, ['data.error', 'error', 'message']);
    return { status: s, url, error: err, raw: r.json, httpStatus: r.status };
  }

  // 완성될 때까지 기다린다
  async wait(videoId, { intervalMs = 15000, timeoutMs = 40 * 60 * 1000, onTick } = {}) {
    const started = Date.now();
    for (;;) {
      const st = await this.status(videoId);
      onTick?.(st, Date.now() - started);
      const s = String(st.status || '').toLowerCase();
      if (s === 'completed' || s === 'success' || s === 'done') return st;
      if (s === 'failed' || s === 'error') {
        throw new Error('생성 실패: ' + JSON.stringify(st.error || st.raw).slice(0, 400));
      }
      if (Date.now() - started > timeoutMs) throw new Error('시간 초과');
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  async download(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  }
}

function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p.split('.')) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null && cur !== '') return cur;
  }
  return null;
}

function summarize(json) {
  if (!json) return null;
  const d = json.data ?? json;
  if (Array.isArray(d)) return `${d.length}건`;
  if (d && typeof d === 'object') {
    const arrKey = Object.keys(d).find(k => Array.isArray(d[k]));
    if (arrKey) {
      const first = d[arrKey][0];
      return `${arrKey} ${d[arrKey].length}건` +
        (first ? ` (예: ${JSON.stringify(first).slice(0, 120)})` : '');
    }
    return JSON.stringify(d).slice(0, 160);
  }
  return String(d).slice(0, 120);
}

function hint(r) {
  if (r.status === 404) return '없는 경로';
  if (r.status === 401 || r.status === 403) return '키 또는 권한 문제';
  if (r.status === 400 || r.status === 422) return '경로는 있음 (요청 형식만 다름) ← 후보';
  if (r.ok) return '동작함 ← 후보';
  return (r.text || '').slice(0, 90);
}
