// 배포 빌드 스크립트
// 사용법:  node build-deploy.js       → dist-deploy/ 폴더 생성 → 그 안 내용을 Cloudflare Pages에 업로드
// (app/ 원본을 건드리지 않고, no-cache 메타 + 폰트 CDN + ?v= 캐시버스팅을 붙여 dist-deploy/ 에 복사)
const fs = require("fs");
const cp = require("child_process");
const path = require("path");
const APP = path.join(__dirname, "app");          // 원본
const OUT = path.join(__dirname, "dist-deploy");   // 배포 결과물
const V = String(Date.now());

// clean out
cp.execSync(`rm -rf "${OUT}" && mkdir -p "${OUT}/css" "${OUT}/js" "${OUT}/assets" "${OUT}/admin"`);

// --- css: strip @font-face, keep the rest ---
let css = fs.readFileSync(APP + "/css/app.css", "utf8");
css = css.replace(/@font-face\s*\{[^}]*\}/g, "");
fs.writeFileSync(OUT + "/css/app.css", css);

const PRETENDARD = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">';
const NOCACHE = '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">';

// --- index.html (입주민·관리소장·감리사 앱) ---
let html = fs.readFileSync(APP + "/index.html", "utf8");
html = html.replace('<link rel="stylesheet" href="css/app.css">',
  NOCACHE + "\n" + PRETENDARD + '\n<link rel="stylesheet" href="css/app.css?v=' + V + '">');
html = html.replace('js/app.js"', 'js/app.js?v=' + V + '"');
html = html.replace('js/stages.js"', 'js/stages.js?v=' + V + '"');
html = html.replace('js/supabase-app.js"', 'js/supabase-app.js?v=' + V + '"');
fs.writeFileSync(OUT + "/index.html", html);

// --- admin/index.html (관리자 대시보드) ---
let admin = fs.readFileSync(APP + "/admin/index.html", "utf8");
admin = admin.replace("</head>", PRETENDARD + "\n" + NOCACHE + "\n</head>");
admin = admin.replace('../js/stages.js"', '../js/stages.js?v=' + V + '"');
fs.writeFileSync(OUT + "/admin/index.html", admin);

// --- console/index.html (통합 관리자 대시보드) ---
cp.execSync(`mkdir -p "${OUT}/console"`);
let konsole = fs.readFileSync(APP + "/console/index.html", "utf8");
konsole = konsole.replace("</head>", NOCACHE + "\n</head>");
konsole = konsole.replace('../js/stages.js"', '../js/stages.js?v=' + V + '"');
fs.writeFileSync(OUT + "/console/index.html", konsole);

// --- 견적서·계약서 자동화 도구 (control/quote, control/contract) ---
for (const sub of ["control/quote", "control/contract"]) {
  cp.execSync(`mkdir -p "${OUT}/${sub}"`);
  let t = fs.readFileSync(APP + "/" + sub + "/index.html", "utf8");
  t = t.replace("</head>", NOCACHE + "\n</head>");
  fs.writeFileSync(OUT + "/" + sub + "/index.html", t);
}

// --- js files (copy verbatim) ---
for (const f of ["app.js", "stages.js", "supabase-app.js"]) {
  fs.copyFileSync(APP + "/js/" + f, OUT + "/js/" + f);
}

// --- 현장 점검 앱 (inspect/) ---
cp.execSync(`mkdir -p "${OUT}/inspect"`);
let insp = fs.readFileSync(APP + "/inspect/index.html", "utf8");
insp = insp.replace("</head>", NOCACHE + "\n</head>");
fs.writeFileSync(OUT + "/inspect/index.html", insp);
cp.execSync(`mkdir -p "${OUT}/inspect/guides" && cp -f "${APP}/inspect/guides/"*.jpg "${OUT}/inspect/guides/" 2>/dev/null || true`);

// --- 홈페이지 문의 폼 (inquiry/) — 아임웹 iframe 삽입용 ---
cp.execSync(`mkdir -p "${OUT}/inquiry"`);
let inq = fs.readFileSync(APP + "/inquiry/index.html", "utf8");
inq = inq.replace("</head>", NOCACHE + "\n</head>");
fs.writeFileSync(OUT + "/inquiry/index.html", inq);

// --- 소장님 작성 폼 (form/) ---
cp.execSync(`mkdir -p "${OUT}/form"`);
let mform = fs.readFileSync(APP + "/form/index.html", "utf8");
mform = mform.replace("</head>", NOCACHE + "\n</head>");
fs.writeFileSync(OUT + "/form/index.html", mform);

// --- 발표용 페이지 (present/) ---
cp.execSync(`mkdir -p "${OUT}/present"`);
let pres = fs.readFileSync(APP + "/present/index.html", "utf8");
pres = pres.replace("</head>", NOCACHE + "\n</head>");
fs.writeFileSync(OUT + "/present/index.html", pres);

// --- assets: 이미지만 (woff/woff2 폰트는 CDN 사용하므로 제외) ---
let kept = 0, dropped = 0;
for (const f of fs.readdirSync(APP + "/assets")) {
  if (/\.woff2?$/.test(f)) { dropped++; continue; }
  fs.copyFileSync(APP + "/assets/" + f, OUT + "/assets/" + f);
  kept++;
}

// --- manifest.json (PWA) · privacy.html (개인정보처리방침) ---
if (fs.existsSync(APP + "/manifest.json")) fs.copyFileSync(APP + "/manifest.json", OUT + "/manifest.json");
if (fs.existsSync(APP + "/privacy.html")) fs.copyFileSync(APP + "/privacy.html", OUT + "/privacy.html");

// --- 관리자 웹 푸시 서비스 워커 (루트 경로에 있어야 FCM이 인식) ---
if (fs.existsSync(APP + "/firebase-messaging-sw.js")) fs.copyFileSync(APP + "/firebase-messaging-sw.js", OUT + "/firebase-messaging-sw.js");

// 참고: functions/ (서버 함수)는 정적 업로더가 거부하므로 배포 번들에서 제외한다.
// 푸시 발송은 별도 Cloudflare Worker(cloudflare-push-worker/worker.js)로 배포한다.

console.log("version:", V, "· assets kept:", kept, "· fonts dropped:", dropped);
console.log("→ dist-deploy/ 안의 내용을 Cloudflare Pages에 업로드하세요.");
