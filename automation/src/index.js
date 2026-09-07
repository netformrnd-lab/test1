#!/usr/bin/env node
// 키워드 -> 프롬프트 -> 헤이젠 -> mp4
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildPrompt } from './prompt.js';
import { HeyGen } from './heygen.js';
import { TRADES, AUDIENCES } from './trades.js';

await loadEnv();

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
const OUT = process.env.OUT_DIR || './out';

try {
  switch (cmd) {
    case 'check':    await cmdCheck(); break;
    case 'discover': await cmdDiscover(); break;
    case 'prompt':   await cmdPrompt(); break;
    case 'make':     await cmdMake(); break;
    case 'status':   await cmdStatus(); break;
    default:         usage();
  }
} catch (e) {
  console.error('\n[실패] ' + e.message);
  if (e.sentBody) console.error('보낸 본문:', JSON.stringify(e.sentBody).slice(0, 500));
  process.exit(1);
}

function usage() {
  console.log(`
사용법
  npm run check                          API 키와 사용 가능한 아바타·보이스 확인
  npm run discover                       계정에서 열려 있는 엔드포인트 찾기
  npm run prompt -- "키워드" [옵션]        프롬프트만 만들어 출력
  npm run make   -- "키워드" [옵션]        영상까지 만들어 mp4 저장

옵션
  --trade 외벽|옥상|지하|없음             공종 (기본 없음)
  --audience 입대의|소장|입주민|시공사      대상 (기본 입대의)
  --len 60|90|120|180|300                길이 초 (기본 180)
  --dry-run                              요청만 만들고 보내지 않음

예
  npm run make -- "균열 3mm, 왜 기준이 되나" --trade 외벽 --len 180
`);
}

function opts() {
  return {
    keyword: args._[0],
    trade: args.trade || '없음',
    audience: args.audience || '입대의',
    len: Number(args.len || 180)
  };
}

function client() {
  return new HeyGen(process.env.HEYGEN_API_KEY, {
    createPath: process.env.HEYGEN_CREATE_PATH,
    statusPath: process.env.HEYGEN_STATUS_PATH
  });
}

async function cmdCheck() {
  const r = await client().check();
  console.log('\n[API 확인]');
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k.padEnd(8)} ${String(v.status).padStart(3)}  ${v.sample ?? ''}`);
  }
  console.log('\n아바타 목록에서 쓸 avatar_id 를 골라 .env 의 HEYGEN_AVATAR_ID 에 넣으세요.');
}

async function cmdDiscover() {
  console.log('\n[엔드포인트 탐색] 계정에서 열려 있는 경로를 찾습니다\n');
  const rows = await client().discover();
  for (const r of rows) {
    console.log(`  ${r.method.padEnd(4)} ${r.path.padEnd(34)} ${String(r.status).padStart(3)}  ${r.hint}`);
  }
  console.log('\n"후보"로 표시된 POST 경로를 .env 의 HEYGEN_CREATE_PATH 에 넣으세요.');
}

async function cmdPrompt() {
  const o = opts();
  if (!o.keyword) return usage();
  const r = buildPrompt(o);
  console.log(r.text);
  console.error(`\n[장면 ${r.sceneCount}개 / ${r.text.length}자]`);
}

async function cmdStatus() {
  const id = args._[0];
  if (!id) return console.log('사용법: node src/index.js status <video_id>');
  console.log(JSON.stringify(await client().status(id), null, 2));
}

async function cmdMake() {
  const o = opts();
  if (!o.keyword) return usage();

  const tr = TRADES[o.trade] ? o.trade : '없음';
  const au = AUDIENCES[o.audience] ? o.audience : '입대의';
  const built = buildPrompt({ ...o, trade: tr, audience: au });

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
  const slug = o.keyword.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 40);
  const dir = path.join(OUT, `${stamp}_${slug}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'prompt.txt'), built.text);
  await writeFile(path.join(dir, 'spec.json'), JSON.stringify({
    keyword: o.keyword, trade: tr, audience: au, len: o.len,
    sceneCount: built.sceneCount,
    scenes: built.scenes.map(s => ({ name: s.name, from: s.from, to: s.to }))
  }, null, 2));

  console.log(`\n[1/4] 프롬프트  장면 ${built.sceneCount}개 / ${built.text.length}자`);
  console.log(`      ${path.join(dir, 'prompt.txt')}`);

  if (args['dry-run']) {
    console.log('\n--dry-run 이라 여기서 멈춥니다. 위 파일을 헤이젠에 직접 붙여넣어 보세요.');
    return;
  }

  const hg = client();
  console.log('\n[2/4] 생성 요청');
  const { id } = await hg.create(built.text, {
    keyword: o.keyword,
    avatarId: process.env.HEYGEN_AVATAR_ID,
    voiceId: process.env.HEYGEN_VOICE_ID
  });
  console.log(`      video_id = ${id}`);
  await writeFile(path.join(dir, 'video_id.txt'), id);

  console.log('\n[3/4] 완성 대기 (15초마다 확인)');
  const done = await hg.wait(id, {
    onTick: (st, ms) => {
      const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
      process.stdout.write(`\r      ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}  ${st.status || '...'}   `);
    }
  });
  process.stdout.write('\n');

  if (!done.url) throw new Error('완료됐지만 영상 주소가 없습니다: ' + JSON.stringify(done.raw).slice(0, 300));

  console.log('\n[4/4] 내려받기');
  const mp4 = path.join(dir, 'video.mp4');
  await hg.download(done.url, mp4);
  console.log(`      ${mp4}`);
  console.log(`\n완료. ${dir} 안에 prompt.txt / spec.json / video.mp4 가 있습니다.`);
}

// --- 유틸 ---
function parseArgs(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = list[i + 1];
      if (next && !next.startsWith('--')) { out[k] = next; i++; }
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

async function loadEnv() {
  const f = path.resolve('.env');
  if (!existsSync(f)) return;
  const txt = await readFile(f, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
