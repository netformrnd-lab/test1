// 화면(index.html·studio.css·studio.js·config.js·extract.js)을 worker/worker.js 에 합쳐
// Cloudflare Worker 에 그대로 붙여넣을 수 있는 deploy/worker.js 한 파일을 만든다.
//   사용법:  node build.mjs
import fs from 'fs'
const here = new URL('.', import.meta.url).pathname
const files = {}
for (const f of ['index.html', 'studio.css', 'studio.js', 'config.js', 'extract.js']) files[f] = fs.readFileSync(here + f, 'utf8')
const worker = fs.readFileSync(here + 'worker/worker.js', 'utf8')
const terms = JSON.parse(fs.readFileSync(here + 'terms.json', 'utf8'))
const knowledge = JSON.parse(fs.readFileSync(here + 'knowledge.json', 'utf8'))
const out = `// ⚠️ 자동 생성 파일 — 직접 고치지 말고 video-studio/ 원본을 고친 뒤 \`node build.mjs\` 를 다시 실행하세요.\n` +
  `// 이 파일 전체를 Cloudflare Worker 편집기에 붙여넣으면 화면 + API 가 함께 동작합니다.\n` +
  `const STATIC_FILES = ${JSON.stringify(files)}\n` +
  `const TERMS = ${JSON.stringify(terms)}\n` +
  `const KNOWLEDGE = ${JSON.stringify(knowledge)}\n\n` + worker
fs.mkdirSync(here + 'deploy', { recursive: true })
fs.writeFileSync(here + 'deploy/worker.js', out)
console.log('deploy/worker.js 생성 완료 (' + Math.round(out.length / 1024) + 'KB)')
