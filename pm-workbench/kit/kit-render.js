/* 디자인 키트: AI는 페이지 나누기·구역 고르기·짧은 문구(JSON)만 쓰고, 화면은 검증한 부품으로 조립한다.
   같은 구성안이면 늘 같은 화면이 나오고, 강조색·페이지 주소·사진 주소는 AI 없이 바로 바뀐다 */
const KIT_CSS = '__KIT_CSS__';
const KIT_RUN = '__KIT_RUN__';
const KIT_THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const KIT_LINKS = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap">';
const KIT_BRAND_HEX = {aptsq: '#0A77A8'};
const KIT_DARK = new Set(['hero', 'pagehead', 'steps', 'stats', 'cta']);
// 구역마다 글자 수 상한(화면에 보이는 글 기준). 넘으면 점검에서 '글이 많음'으로 알린다
const KIT_MAX = {hero: 230, pagehead: 260, statement: 90, cards: 480, stages: 950, steps: 1400, split: 750, stats: 480, faq: 2400, feature: 430, list: 680, docs: 520, contact: 760, cta: 200, text: 900};
const KIT_TYPES = Object.keys(KIT_MAX);
const KIT_NAME = {hero: '첫 화면', pagehead: '페이지 머리', statement: '한 문장', cards: '카드', stages: '단계별 결과', steps: '절차', split: '하는 일·하지 않는 일', stats: '숫자', faq: '자주 묻는 질문', feature: '그림과 글', list: '항목 카드', docs: '문서 그림', contact: '문의', cta: '마무리', text: '글'};
// AI에게 주는 부품 목록: 칸 이름과 최대 글자 수
const KIT_CATALOG = `- hero (메인 첫 화면. 어두운 바탕에 3D 단지가 돌고, 확인 띠가 지나가며 이름표가 차례로 켜진다): tag 정체 표기 20자 · brand 브랜드 이름 · title 헤드라인 40자 · text 90자 · buttons 최대 2개 [{label 16자, to}] · note 대상·조건 한 줄 70자 · visual "city"(기본) 또는 "photo"(photo 번호 필요) · labels 이름표 4~6개 [{t 12자, n 8자}] — 원고에 나오는 기록·서비스·공정 이름만 · prefix 이름표 앞 영문 3자(예 REC)
- pagehead (하위 페이지 첫 화면. 설계도 격자 위로 띠가 지나간다): eyebrow · title 34자 · text 80자 · buttons · labels 오른쪽에 겹쳐 보일 문서 이름 0~3개 [{t 12자, n 도장 글 4자}] · photo · need
- statement (한 문장을 크게. 스크롤하면 글자가 채워진다): text 60자(강조할 말 *별표*) · by 출처나 영문 한 줄 30자
- cards (대상·경로를 고르는 세로 카드 2~4장. 마우스를 올리면 넓어진다): eyebrow · title · text 60자 · items [{label 10자, title 질문형 30자, text 50자, link 버튼 글 12자, to, icon}] · note · need
- stages (단계별 결과. 단계마다 남는 문서 그림이 일어선다. 2~5단계): eyebrow · title · text 70자 · buttons · items [{en 영어 2~3단어, title 8자, sub 20자, points 최대 2개 각 45자, doc {title 12자, stamp 4자}, need}] · note
- steps (번호 절차. 큰 숫자와 저절로 넘어가는 목록. 3~10단계): eyebrow · title · cap 영어 한 줄 · code 영어 한 단어 · items [{title 8자, sub 22자, text 60자, rec 그 단계에 남는 문서 12자, need}] · note · need
- split (하는 일과 하지 않는 일): eyebrow · title · text · do {title, items 최대 4개 — 문장 또는 {b 굵은 앞말, t}} · dont {title, items} · extra 최대 2개 [{title, text 40자}] · note
- stats (근거 숫자. 어두운 바탕에 큰 숫자가 올라간다. 2~4개): eyebrow · title · items [{label 영어 한 단어, value 원고에 있는 숫자만(없으면 ""), unit, name 20자, text 50자, icon, need}] · note · need · buttons 1개
- faq (자주 묻는 질문 펼치기. 최대 8개): eyebrow · title · text · items [{q 40자, a 160자, need}] · buttons 1개
- feature (그림 한쪽 + 글 한쪽): eyebrow · title · text 80자 · points 최대 3개 · photo 또는 art "scan"(건물 점검 선) · "drone" · "layers"(층 구조) · "docs"(문서 그림, labels 필요) · flip true면 그림이 오른쪽 · buttons · need
- list (용어·항목 카드 3~6개): eyebrow · title · text · items [{term 10자, text 60자, icon, need}] · note
- docs (문서·샘플 그림 2~3개): eyebrow · title · text · items [{title 12자, stamp 4자, text 50자, need}] · note
- contact (문의. 왼쪽 안내, 오른쪽 아임웹 폼 자리): eyebrow · title · text · check {title, text 90자} · flow 3~4개 [{title 6자, text 24자}] · info [{label, value}] · fields 폼 항목 이름 최대 8개 · submit · need
- cta (마무리 띠): eyebrow · title 34자 · text 60자 · buttons
- text (글이 꼭 필요할 때만): eyebrow · title · paras 최대 3개 각 140자 · need
icon: people user clipboard building doc drone shield chart tools chat search check layers calendar coin ruler camera phone map home 중 하나.
to(버튼·카드 연결): 다른 페이지면 그 페이지 이름, 이 페이지의 문의 구역이면 "#contact", 같은 페이지의 다른 구역이면 "#b3"(위에서 3번째 구역).
예: {"blocks":[{"type":"hero","tag":"○○ 전문기관","brand":"○○","title":"헤드라인 한 문장에 *강조할 말*","text":"…","buttons":[{"label":"설명자료 요청","to":"#contact"}],"note":"…","visual":"city","labels":[{"t":"점검표","n":"방문 시점"}],"prefix":"REC"},{"type":"statement","text":"짧은 한 문장에 *핵심*"}]}`;

const kitArr = v => Array.isArray(v) ? v.filter(x => x != null) : [];
const kitObjs = (v, key, n) => kitArr(v).map(x => typeof x === 'string' || typeof x === 'number' ? {[key]: str(x)} : x).filter(x => x && typeof x === 'object').slice(0, n);
const kitPlain = s => str(s).replace(/<br\s*\/?>/gi, ' ').replace(/\*\*?/g, '').replace(/\[확인 ?필요[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const kitNeedOf = s => [...str(s).matchAll(/\[확인 ?필요\s*[:：—-]?\s*([^\]]*)\]/g)].map(m => m[1].trim());
// 글: 이스케이프한 뒤 *강조*는 em, [확인 필요: …]는 노란 표시로
function kitInl(s){
  return esc(str(s).replace(/\*\*/g, '').replace(/<br\s*\/?>/gi, '\n').trim()).replace(/\n+/g, '<br>')
    .replace(/\[확인 ?필요\s*[:：—-]?\s*([^\]]*)\]/g, (m, x) => `<span class="pk-need">${x.trim()}</span>`)
    .replace(/\*([^*\n]{1,80})\*/g, '<em>$1</em>').replace(/\*/g, '');
}
const kitNeeds = v => { const a = (Array.isArray(v) ? v : v ? [v] : []).map(x => kitPlain(x) || str(x).replace(/[[\]]/g, '').replace(/^확인 ?필요\s*[:：—-]?\s*/, '').trim()).filter(Boolean).slice(0, 4); return a.length ? `<div class="pk-needs">${a.map(x => `<span class="pk-need">${esc(cut(x, 120))}</span>`).join('')}</div>` : ''; };

/* 강조색 하나로 어두운 바탕용(밝게)·밝은 바탕용(진하게) 두 가지를 만든다. 대비는 WCAG 기준으로 맞춘다 */
const kitHex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(str(h).trim()); return m ? '#' + m[1].toUpperCase() : ''; };
function kitTheme(hex){
  const h0 = kitHex(hex) || '#0A77A8', rgb = [1, 3, 5].map(i => parseInt(h0.slice(i, i + 2), 16));
  const lum = c => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const con = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const r = rgb.map(v => v / 255), mx = Math.max(...r), mn = Math.min(...r), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0, hue = !d ? 0 : mx === r[0] ? ((r[1] - r[2]) / d + 6) % 6 : mx === r[1] ? (r[2] - r[0]) / d + 2 : (r[0] - r[1]) / d + 4;
  const hsl = (H, S, L) => { const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(H % 2 - 1)), m = L - c / 2, p = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(H) % 6]; return p.map(v => Math.round((v + m) * 255)); };
  const W = [255, 255, 255], INK = [12, 21, 34];
  let ink = rgb; for (let L = l; con(ink, W) < 4.6 && L > 0; L -= .02) ink = hsl(hue, s, Math.max(0, L));
  let lit = rgb; for (let L = l; con(lit, INK) < 9 && L < 1; L += .02) lit = hsl(hue, Math.max(s, .72), Math.min(1, L));
  const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  return {base: h0, scan: hx(lit), scanRgb: lit.join(','), ink: hx(ink), inkRgb: ink.join(',')};
}

const KIT_ICON = {
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M15.5 14.2c2.6-.3 4.8 1.2 5.5 4"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.8-3.8 3.6-5.8 7-5.8s6.2 2 7 5.8"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="3" rx="1"/><path d="M8.5 11l1.6 1.6 3-3M8.5 16h7"/>',
  building: '<path d="M4 20V8l8-4 8 4v12M2.5 20h19"/><path d="M8 10h2M14 10h2M8 13.5h2M14 13.5h2M10.5 20v-3h3v3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2.5"/>',
  drone: '<rect x="9.5" y="10" width="5" height="3.4" rx="1"/><path d="M9.5 11L5 8M14.5 11L19 8M9.5 12.6L5 15.5M14.5 12.6L19 15.5M2.5 7.5h5M16.5 7.5h5M2.5 16h5M16.5 16h5"/>',
  shield: '<path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
  tools: '<path d="M15 4a4 4 0 0 0-3.8 5.2L4 16.4 7.6 20l7.2-7.2A4 4 0 0 0 20 9l-2.6 2.6-2.8-.4-.4-2.8L17 5.8A4 4 0 0 0 15 4z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.5 2.5 5-5.2"/>',
  layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5L12 17l9-4.5M3 16.5L12 21l9-4.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.8 1.6 5.8 4.4 0 1.3-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.7M12 6v1.6M12 16.4V18"/>',
  ruler: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  camera: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  phone: '<path d="M6 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.7 6.7l1.3-2 4 1.5v3c0 1-.8 1.8-1.8 1.8A15.7 15.7 0 0 1 4.2 5.3c0-1 .8-1.8 1.8-1.8z"/>',
  map: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  home: '<path d="M4 11l8-6.5 8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>'
};
const kitIcon = (k, cls = '', sw = 1.6) => KIT_ICON[k] ? `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KIT_ICON[k]}</svg>` : '';

// 기록 문서 그림 (실제 문서가 아니라 종류를 보여 주는 그림)
const KIT_DOCV = ['<i class="pk-doc-l"></i><i class="pk-doc-l m"></i><i class="pk-doc-l s"></i><span class="pk-doc-row"><i></i><i></i><i></i></span><span class="pk-doc-row"><i></i><i></i><i></i></span>',
  '<span class="pk-doc-row"><i></i><i></i><i></i></span><span class="pk-doc-row"><i></i><i></i><i></i></span><span class="pk-doc-row"><i></i><i></i><i></i></span><i class="pk-doc-l m"></i><i class="pk-doc-l s"></i>',
  '<i class="pk-doc-l"></i><i class="pk-doc-l m"></i><i class="pk-doc-l"></i><i class="pk-doc-l s"></i><span class="pk-doc-row"><i></i><i></i><i></i></span>',
  '<i class="pk-doc-l m"></i><i class="pk-doc-l"></i><i class="pk-doc-l s"></i><span class="pk-doc-row"><i></i><i></i><i></i></span><i class="pk-doc-l m"></i>'];
function kitDoc(title, stamp, i, code){
  const st = cut(kitPlain(stamp), 6), sp = st.indexOf(' '), a = sp > 0 ? st.slice(0, sp) : st.slice(0, Math.ceil(st.length / 2)), b = sp > 0 ? st.slice(sp + 1) : st.slice(Math.ceil(st.length / 2));
  return `<div class="pk-doc-p" aria-hidden="true"><span class="pk-doc-c">${esc(code || 'RECORD')} · ${String(i + 1).padStart(2, '0')}</span><span class="pk-doc-t">${esc(cut(kitPlain(title), 24))}</span>${KIT_DOCV[i % 4]}${st ? `<span class="pk-doc-st">${esc(a)}${b ? `<br>${esc(b)}` : ''}</span>` : ''}</div>`;
}
// 사진이 없을 때 그림+글 구역의 그림 (강조색 선으로)
const KIT_ART = {
  scan: '<svg viewBox="0 0 500 400" fill="none" stroke="currentColor" aria-hidden="true"><g stroke-opacity=".55" stroke-width="1.2"><path d="M140 360V90l110-40 110 40v270"/>' + Array.from({length: 9}, (_, r) => Array.from({length: 5}, (_, c) => `<rect x="${160 + c * 38}" y="${110 + r * 27}" width="22" height="13" rx="2"/>`).join('')).join('') + '<path d="M60 360h380"/></g><g class="pk-scanline"><rect x="120" y="330" width="260" height="34" fill="currentColor" fill-opacity=".14" stroke="none"/><path d="M120 330h260" stroke-width="2"/></g></svg>',
  drone: '<svg viewBox="0 0 500 400" fill="none" stroke="currentColor" aria-hidden="true"><g stroke-opacity=".5" stroke-width="1.2"><path d="M300 380V60h150v320"/>' + Array.from({length: 10}, (_, r) => Array.from({length: 3}, (_, c) => `<rect x="${318 + c * 44}" y="${78 + r * 29}" width="26" height="14" rx="2"/>`).join('')).join('') + '</g><path d="M150 150L300 110M150 150L300 250" stroke-dasharray="4 6" stroke-opacity=".7"/><path d="M300 110v140" stroke-width="2.4"/><g stroke-width="1.8"><rect x="128" y="140" width="44" height="22" rx="6"/><path d="M128 146l-30-16M172 146l30-16M128 156l-30 14M172 156l30 14M80 128h36M184 128h36M80 172h36M184 172h36"/><circle cx="150" cy="168" r="4"/></g></svg>',
  layers: '<svg viewBox="0 0 500 400" fill="none" stroke="currentColor" aria-hidden="true">' + [0, 1, 2, 3].map(i => `<g transform="translate(0 ${70 + i * 66})" stroke-width="1.4"><path d="M90 40l160-36 160 36-160 36z" fill="currentColor" fill-opacity="${.05 + i * .05}"/><path d="M90 40v14l160 36 160-36V40" stroke-opacity=".6"/></g>`).join('') + '</svg>'
};

/* 구성안 다듬기: 모르는 종류는 빼고, 목록 길이를 제한한다 (글자 수는 점검에서 알린다) */
function kitNorm(spec){
  const pages = kitArr(spec && spec.pages).slice(0, 12).map((p, i) => ({
    name: cut(kitPlain(p.name), 16) || (i ? `페이지 ${i + 1}` : '메인'),
    secs: kitArr(p.secs).map(str),
    blocks: kitArr(p.blocks).filter(b => b && KIT_TYPES.includes(str(b.type))).slice(0, 14)
  })).filter(p => p.blocks.length || p.secs.length);
  return {v: 1, pages, fab: spec && spec.fab === false ? false : true};
}

/* 링크: 다른 페이지는 {{page:번호}} 자리표시(복사할 때 아임웹 페이지 주소로), 같은 페이지 문의는 #pk-contact */
function kitLink(to, ctx){
  const t = kitPlain(to).replace(/^#/, ''), n = s => str(s).replace(/\s|페이지|안내/g, '').toLowerCase(), nt = n(t);
  const bm = /^b(\d{1,2})$/i.exec(t), bt = bm && (ctx.types || [])[+bm[1] - 1];
  if (bt) return `href="#${bt === 'contact' ? 'pk-contact' : /hero|pagehead/.test(bt) ? 'pk-top' : `pk-b${+bm[1]}`}" data-link="${esc(`${+bm[1]}번째 구역`)}"`;
  let pi = ctx.pages.findIndex(p => n(p) === nt);
  if (pi < 0 && nt) pi = ctx.pages.findIndex(p => n(p) && (n(p).includes(nt) || nt.includes(n(p))));
  const contact = /contact|문의|상담|요청/i.test(t);
  if (ctx.hasContact && (contact && (pi < 0 || pi === ctx.pi))) return `href="#pk-contact" data-link="${esc(t || '문의')}"`;
  if (pi < 0 && contact){ pi = ctx.pages.findIndex(p => /문의|contact/i.test(p)); }
  if (pi >= 0 && pi !== ctx.pi) return `href="{{page:${pi + 1}}}" data-go="${pi}" data-link="${esc(ctx.pages[pi])}"`;
  if (pi === ctx.pi) return `href="#pk-top" data-link="${esc(ctx.pages[pi])}"`;
  return `href="#" data-link="${esc(t || '연결할 곳')}"`;
}
function kitBtns(list, ctx, max = 2){
  const bs = kitArr(list).filter(b => kitPlain(b.label)).slice(0, max);
  return bs.length ? `<div class="pk-btns">${bs.map((b, i) => `<a class="pk-btn${i ? ' ghost' : ''}" ${kitLink(b.to, ctx)}>${kitInl(cut(b.label, 30))}${i ? '' : ' <span class="pk-ar" aria-hidden="true">→</span>'}</a>`).join('')}</div>` : '';
}
const kitHead = (b, o = {}) => `<header class="pk-head${o.c ? ' c' : ''} pk-rv">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}${b.title ? `<h2 class="pk-h2">${kitInl(b.title)}</h2>` : ''}${b.text ? `<p class="pk-lead">${kitInl(b.text)}</p>` : ''}${o.btns || ''}</header>`;
const kitNote = (b, extra = '') => (b.note || b.need || extra) ? `<div class="pk-foot pk-rv">${b.note ? `<p class="pk-note">${kitInl(b.note)}</p>` : ''}${kitNeeds(b.need)}${extra}</div>` : '';
const kitPhoto = (n, ctx) => { const k = Math.round(+n); return k >= 1 && k <= ctx.photos ? `{{img:${k}}}` : ''; };

const KIT_BLOCK = {
  hero(b, ctx){
    const ph = kitPhoto(b.photo, ctx), vis = ph && b.visual !== 'city' ? 'photo' : b.visual === 'grid' ? 'grid' : 'city';
    const labels = kitArr(b.labels).map(l => typeof l === 'string' ? {t: l} : l).map(l => ({t: cut(kitPlain(l.t || l.name), 18), n: cut(kitPlain(l.n || l.note), 14)})).filter(l => l.t).slice(0, 6);
    if (vis === 'city') ctx.three = true;
    return `<section class="pk-hero pk-d${vis === 'photo' ? ' photo' : vis === 'grid' ? ' no3d' : ''}" id="pk-top"${vis === 'city' ? ` data-pk-labels="${esc(JSON.stringify(labels))}" data-pk-prefix="${esc(cut(str(b.prefix).replace(/[^A-Za-z]/g, '').toUpperCase(), 6))}"` : ''}>
  ${vis === 'city' ? '<canvas class="pk-hero-3d" aria-hidden="true"></canvas><div class="pk-tags" aria-hidden="true"></div>' : vis === 'photo' ? `<img class="pk-hero-img" src="${ph}" alt="">` : ''}
  <div class="pk-wrap pk-hero-in">
    ${b.tag || b.brand ? `<p class="pk-hero-id">${b.tag ? `<b>${kitInl(cut(b.tag, 40))}</b>` : ''}${kitInl(cut(b.brand, 30))}</p>` : ''}
    <h1 class="pk-hero-h">${kitInl(b.title)}</h1>
    ${b.text ? `<p class="pk-hero-p">${kitInl(b.text)}</p>` : ''}
    ${kitBtns(b.buttons, ctx)}
  </div>
  <div class="pk-hero-foot"><div class="pk-wrap">${b.note ? `<p class="pk-scope">${kitInl(b.note)}</p>` : ''}<span class="pk-scroll" aria-hidden="true">SCROLL<i></i></span></div></div>
</section>`;
  },
  pagehead(b, ctx){
    const ph = kitPhoto(b.photo, ctx), docs = kitArr(b.labels).map(l => typeof l === 'string' ? {t: l} : l).filter(l => kitPlain(l.t || l.name)).slice(0, 3);
    return `<section class="pk-ph pk-d" id="pk-top">${ph ? `<img class="pk-ph-img" src="${ph}" alt="">` : ''}<div class="pk-ph-bg" aria-hidden="true"></div>
  <div class="pk-wrap pk-ph-in${docs.length ? '' : ' solo'}">
    <div class="pk-ph-txt">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h1 class="pk-ph-h">${kitInl(b.title)}</h1>${b.text ? `<p class="pk-ph-p">${kitInl(b.text)}</p>` : ''}${kitBtns(b.buttons, ctx)}${kitNeeds(b.need)}</div>
    ${docs.length ? `<div class="pk-ph-docs" aria-hidden="true">${docs.map((d, i) => kitDoc(d.t || d.name, d.n || d.stamp, i, b.code)).join('')}</div>` : ''}
  </div>
</section>`;
  },
  statement(b){
    const raw = str(b.text).replace(/\[확인 ?필요[^\]]*\]/g, ''), hl = [...raw.matchAll(/\*([^*]+)\*/g)].flatMap(m => m[1].split(/\s+/)).map(w => w.replace(/[,.!?]$/, '')).filter(Boolean);
    return `<section class="pk-say" aria-label="${esc(cut(kitPlain(b.text), 60))}"><div class="pk-wrap"><p class="pk-say-p" data-fill data-hl="${esc(hl.join('|'))}">${esc(kitPlain(raw))}</p>${b.by ? `<p class="pk-say-by">${esc(cut(kitPlain(b.by), 60))}</p>` : ''}</div></section>`;
  },
  cards(b, ctx){
    const items = kitObjs(b.items, 'title', 4);
    return `<section class="pk-sec"><div class="pk-wrap">${kitHead(b)}
    <div class="pk-cards pk-rv">${items.map((it, i) => { const ph = kitPhoto(it.photo, ctx), go = kitPlain(it.link || it.go), tag = go ? 'a' : 'div';
      return `<${tag} class="pk-card${i ? '' : ' is-open'}" ${go ? kitLink(it.to || go, ctx) : 'tabindex="0"'}>${ph ? `<img class="pk-card-img" src="${ph}" alt="">` : ''}${kitIcon(it.icon || ['people', 'clipboard', 'building', 'doc'][i], 'pk-card-art', 1)}${it.label ? `<span class="pk-card-k">${kitInl(cut(it.label, 30))}</span>` : ''}<strong class="pk-card-q">${kitInl(it.title)}</strong>${it.text ? `<span class="pk-card-d"><span>${kitInl(it.text)}</span></span>` : ''}${go ? `<span class="pk-card-go">${kitInl(cut(go, 30))}<i aria-hidden="true">→</i></span>` : ''}</${tag}>`; }).join('')}</div>
    ${kitNote(b)}</div></section>`;
  },
  stages(b, ctx){
    const items = kitObjs(b.items, 'title', 6);
    return `<section class="pk-sec"><div class="pk-wrap pk-side-grid">
    <div class="pk-side pk-rv">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2">${kitInl(b.title)}</h2>${b.text ? `<p class="pk-lead">${kitInl(b.text)}</p>` : ''}${kitBtns(b.buttons, ctx)}</div>
    <ol class="pk-stages">${items.map((it, i) => `<li class="pk-stage pk-rv${it.doc ? '' : ' nodoc'}"><div><p class="pk-stage-top"><span class="pk-stage-no">${String(i + 1).padStart(2, '0')}</span>${it.en ? `<span class="pk-stage-en">${esc(cut(kitPlain(it.en), 30))}</span>` : ''}</p><h3>${kitInl(it.title)}</h3>${it.sub ? `<p class="pk-stage-t">${kitInl(it.sub)}</p>` : ''}${kitArr(it.points).length ? `<ul class="pk-pts">${kitArr(it.points).slice(0, 4).map(p => `<li>${kitInl(p)}</li>`).join('')}</ul>` : ''}${kitNeeds(it.need)}</div>${it.doc ? `<figure class="pk-doc">${kitDoc(it.doc.title || it.doc, it.doc.stamp, i, b.code)}<figcaption class="pk-doc-cap">${esc(cut(kitPlain(b.docCap || '남는 기록'), 12))} · ${esc(cut(kitPlain(it.doc.title || it.doc), 24))}</figcaption></figure>` : ''}</li>`).join('')}</ol>
  </div>${b.note || b.need ? `<div class="pk-wrap">${kitNote(b)}</div>` : ''}</section>`;
  },
  steps(b){
    const items = kitObjs(b.items, 'title', 12), n = items.length;
    return `<section class="pk-sec"><div class="pk-wrap pk-side-grid">
    <div class="pk-rv">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2" style="margin-top:20px">${kitInl(b.title)}</h2><span class="pk-big${n > 9 ? ' w2' : ''}" aria-hidden="true">${n}</span><p class="pk-big-cap">${esc(cut(kitPlain(b.cap) || `${n} steps`, 40))}</p></div>
    <div class="pk-rv d1"><ol class="pk-steps">${items.map((it, i) => `<li class="pk-step${i ? '' : ' on'}"><button class="pk-step-b" type="button" aria-expanded="${i ? 'false' : 'true'}"><span class="pk-step-n">${String(i + 1).padStart(2, '0')}</span><span class="pk-step-name">${kitInl(it.title)}${it.sub ? `<small>${kitInl(it.sub)}</small>` : ''}</span><span class="pk-step-i" aria-hidden="true"></span></button><div class="pk-step-d"><div>${it.text ? `<p>${kitInl(it.text)}</p>` : ''}${it.rec ? `<span class="pk-step-rec"><b>${esc(cut(str(b.code || 'RECORD').toUpperCase(), 10))}</b>${kitInl(cut(it.rec, 30))}</span>` : ''}${kitNeeds(it.need)}</div></div><div class="pk-step-bar"><i></i></div></li>`).join('')}</ol>
    ${b.note || b.need ? `<div class="pk-steps-note">${b.note ? `<p class="pk-note">${kitInl(b.note)}</p>` : ''}${kitNeeds(b.need)}</div>` : ''}</div>
  </div></section>`;
  },
  split(b){
    const li = (x, no) => { const o = typeof x === 'string' ? {t: x} : x || {}; return `<li>${no ? '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>' : '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9.5l4 4 8-9"/></svg>'}<span>${o.b ? `<b>${kitInl(o.b)}</b> ` : ''}${kitInl(o.t)}</span></li>`; };
    const col = (c, no) => c && kitArr(c.items).length ? `<div class="pk-do${no ? ' no' : ''} pk-rv${no ? ' d1' : ''}"><p class="pk-do-h"><i aria-hidden="true">${no ? '／' : '✓'}</i>${kitInl(c.title || (no ? '하지 않는 일' : '하는 일'))}</p><ul>${kitArr(c.items).slice(0, 6).map(x => li(x, no)).join('')}</ul></div>` : '';
    const ex = kitObjs(b.extra, 'title', 3);
    return `<section class="pk-sec"><div class="pk-wrap">${kitHead(b)}
    <div class="pk-do-grid">${col(b.do, false)}${col(b.dont, true)}</div>
    ${ex.length ? `<div class="pk-cant">${ex.map((x, i) => `<div class="pk-cant-i pk-rv${i ? ' d1' : ''}"><i aria-hidden="true">${String(i + 1).padStart(2, '0')}</i><div><b>${kitInl(x.title)}</b>${x.text ? `<p>${kitInl(x.text)}</p>` : ''}</div></div>`).join('')}</div>` : ''}
    ${kitNote(b)}</div></section>`;
  },
  stats(b, ctx){
    const items = kitObjs(b.items, 'name', 4);
    const val = it => { const v = kitPlain(it.value).replace(/\s/g, ''), m = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(v);
      if (m && !m[2]) { const num = +v.replace(/,/g, ''); return `<span class="pk-stat-v"><span data-count="${num}">${num.toLocaleString('ko-KR')}</span>${it.unit ? `<small>${esc(cut(kitPlain(it.unit), 8))}</small>` : ''}</span>`; }
      if (v) return `<span class="pk-stat-v txt">${esc(cut(kitPlain(it.value), 14))}${it.unit ? `<small>${esc(cut(kitPlain(it.unit), 8))}</small>` : ''}</span>`;
      return kitIcon(it.icon || 'check', '', 1.2); };
    return `<section class="pk-sec pk-stats-sec"><canvas class="pk-dots" aria-hidden="true"></canvas><div class="pk-wrap">${kitHead(b)}
    <div class="pk-stats" style="--n:${Math.max(1, items.length)}">${items.map((it, i) => `<div class="pk-stat pk-rv${i ? ` d${i}` : ''}">${it.label ? `<span class="pk-stat-k">${esc(cut(kitPlain(it.label), 24))}</span>` : ''}${val(it)}${it.name ? `<span class="pk-stat-n">${kitInl(it.name)}</span>` : ''}${it.text ? `<p class="pk-stat-d">${kitInl(it.text)}</p>` : ''}${kitNeeds([...kitNeedOf(it.value).map(x => x || '수치'), ...[].concat(it.need || [])])}</div>`).join('')}</div>
    ${b.note || b.need || kitArr(b.buttons).length ? `<div class="pk-stats-foot pk-rv"><div>${b.note ? `<p class="pk-note">${kitInl(b.note)}</p>` : ''}${kitNeeds(b.need)}</div>${kitBtns(b.buttons, ctx, 1).replace('class="pk-btn"', 'class="pk-btn ghost"')}</div>` : ''}
  </div></section>`;
  },
  faq(b, ctx){
    const items = kitObjs(b.items, 'q', 12);
    return `<section class="pk-sec"><div class="pk-wrap pk-faq-grid">${kitHead(b, {btns: kitBtns(b.buttons, ctx, 1)})}
    <div class="pk-qs pk-rv">${items.map((it, i) => `<div class="pk-q${i ? '' : ' on'}"><button class="pk-q-b" type="button" aria-expanded="${i ? 'false' : 'true'}"><span>Q${i + 1}</span><span>${kitInl(it.q)}</span><i aria-hidden="true"></i></button><div class="pk-q-a"><div>${kitArr(Array.isArray(it.a) ? it.a : [it.a]).map(a => `<p>${kitInl(a)}</p>`).join('')}${kitNeeds(it.need)}</div></div></div>`).join('')}</div>
  </div></section>`;
  },
  feature(b, ctx){
    const ph = kitPhoto(b.photo, ctx), art = str(b.art), docs = kitArr(b.labels).slice(0, 3);
    const media = ph ? `<div class="pk-feat-m photo pk-rv"><img src="${ph}" alt="${esc(cut(kitPlain(b.alt || b.title), 80))}"></div>`
      : art === 'docs' && docs.length ? `<div class="pk-feat-m pk-rv"><div class="pk-ph-docs" style="position:absolute;inset:8% 6%;height:auto" aria-hidden="true">${docs.map((d, i) => kitDoc(d.t || d.name || d, d.n || d.stamp, i, b.code)).join('')}</div></div>`
      : `<div class="pk-feat-m pk-rv">${KIT_ART[art] || KIT_ART.scan}</div>`;
    return `<section class="pk-sec"><div class="pk-wrap pk-feat${b.flip ? ' flip' : ''}">${media}
    <div class="pk-feat-t pk-rv d1">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2">${kitInl(b.title)}</h2>${b.text ? `<p class="pk-lead">${kitInl(b.text)}</p>` : ''}${kitArr(b.points).length ? `<ul class="pk-pts">${kitArr(b.points).slice(0, 5).map(p => `<li>${kitInl(p)}</li>`).join('')}</ul>` : ''}${kitNeeds(b.need)}${kitBtns(b.buttons, ctx)}</div>
  </div></section>`;
  },
  list(b){
    const items = kitObjs(b.items, 'term', 8);
    return `<section class="pk-sec"><div class="pk-wrap">${kitHead(b)}
    <div class="pk-terms">${items.map((it, i) => `<div class="pk-term pk-rv${i % 3 ? ` d${i % 3}` : ''}">${it.icon && KIT_ICON[it.icon] ? kitIcon(it.icon) : `<span class="pk-term-n">${String(i + 1).padStart(2, '0')}</span>`}<b>${kitInl(it.term || it.title)}</b>${it.text ? `<p>${kitInl(it.text)}</p>` : ''}${kitNeeds(it.need)}</div>`).join('')}</div>
    ${kitNote(b)}</div></section>`;
  },
  docs(b){
    const items = kitObjs(b.items, 'title', 4);
    return `<section class="pk-sec"><div class="pk-wrap">${kitHead(b)}
    <div class="pk-docs">${items.map((it, i) => `<div class="pk-docs-i pk-rv${i ? ` d${i % 3}` : ''}"><figure class="pk-doc" style="position:relative">${kitDoc(it.title, it.stamp, i, b.code)}${it.need || it.sample === false ? '<span class="pk-docs-wm" aria-hidden="true">SAMPLE · 준비 중</span>' : ''}</figure><b>${kitInl(it.title)}</b>${it.text ? `<p>${kitInl(it.text)}</p>` : ''}${kitNeeds(it.need)}</div>`).join('')}</div>
    ${kitNote(b)}</div></section>`;
  },
  contact(b, ctx){
    const flow = kitObjs(b.flow, 'title', 4), info = kitObjs(b.info, 'label', 4), fields = kitArr(b.fields).map(kitPlain).filter(Boolean).slice(0, 8);
    return `<section class="pk-sec" id="pk-contact"><div class="pk-wrap pk-contact-grid">
    <div class="pk-rv">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2" style="margin-top:20px">${kitInl(b.title)}</h2>${b.text ? `<p class="pk-lead" style="margin-top:18px">${kitInl(b.text)}</p>` : ''}
      ${b.check ? `<div class="pk-check">${b.check.title ? `<b>${kitInl(b.check.title)}</b>` : ''}${kitInl(b.check.text || b.check)}</div>` : ''}
      ${flow.length ? `<ol class="pk-flow" style="--n:${flow.length}">${flow.map((f, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><b>${kitInl(f.title)}</b>${f.text ? `<p>${kitInl(f.text)}</p>` : ''}</li>`).join('')}</ol>` : ''}
      ${info.length ? `<ul class="pk-call">${info.map(x => `<li><b>${kitInl(cut(x.label, 20))}</b>${kitPlain(x.value) ? `<span>${kitInl(x.value)}</span>` : ''}${kitNeeds(x.need || (!kitPlain(x.value) ? x.value || '내용' : ''))}</li>`).join('')}</ul>` : ''}
      ${kitNeeds(b.need)}${kitBtns(b.buttons, ctx).replace('class="pk-btns"', 'class="pk-btns" style="margin-top:30px"')}
    </div>
    <div class="pk-form pk-rv d1" role="group" aria-label="문의 양식 자리"><p class="pk-form-h">${kitInl(b.formTitle || '문의 남기기')}<small>아임웹 폼 위젯 자리</small></p>
      ${(fields.length ? fields : ['성함', '연락처', '문의 내용']).map(f => `<div class="pk-f"><span>${esc(cut(f, 40))}</span><i></i></div>`).join('')}
      <span class="pk-btn">${kitInl(cut(b.submit || '문의 남기기', 20))} <span class="pk-ar" aria-hidden="true">→</span></span>
    </div>
  </div></section>`;
  },
  cta(b, ctx){
    return `<section class="pk-sec pk-cta"><div class="pk-wrap pk-rv">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2">${kitInl(b.title)}</h2>${b.text ? `<p class="pk-lead">${kitInl(b.text)}</p>` : ''}${kitBtns(b.buttons, ctx)}${kitNeeds(b.need)}</div></section>`;
  },
  text(b){
    const ps = kitArr(Array.isArray(b.paras) ? b.paras : [b.paras || b.body]).slice(0, 6);
    return `<section class="pk-sec"><div class="pk-wrap pk-text"><header class="pk-head pk-rv" style="margin:0">${b.eyebrow ? `<p class="pk-eyebrow">${esc(cut(kitPlain(b.eyebrow), 40))}</p>` : ''}<h2 class="pk-h2">${kitInl(b.title)}</h2></header><div class="pk-text-b pk-rv d1">${ps.map(p => `<p>${kitInl(p)}</p>`).join('')}${kitNeeds(b.need)}</div></div></section>`;
  }
};

// 한 페이지의 본문(.pk) — 구역마다 바탕(흰색·회색·어두운색)을 번갈아 정한다
function kitBody(spec, pi, o = {}){
  const S = kitNorm(spec), page = S.pages[pi]; if (!page) return {html: '', three: false};
  const th = kitTheme(o.accent);
  const ctx = {pages: S.pages.map(p => p.name), pi, photos: o.photos || 0, three: false, hasContact: page.blocks.some(b => b.type === 'contact'), types: page.blocks.map(b => str(b.type))};
  let lastLight = '', lastDark = false;
  const parts = page.blocks.map((b, i) => {
    const t = str(b.type), dark = KIT_DARK.has(t);
    let html = KIT_BLOCK[t](b, ctx);
    const tone = dark ? (lastDark && t !== 'hero' && t !== 'pagehead' ? 'dark2' : 'dark') : t === 'statement' ? 'white' : (lastLight === 'white' ? 'paper' : 'white');
    if (!dark) lastLight = tone; lastDark = dark;
    html = html.replace(/^<section class="/, `<section data-pk-b="${i}" class="pk-t-${tone}${dark ? ' pk-d' : ''} pk-k-${t} `);
    if (!/^<section[^>]*\sid="/.test(html)) html = html.replace(/^<section /, `<section id="pk-b${i + 1}" `);
    return html;
  });
  const ci = ctx.hasContact ? -1 : S.pages.findIndex(p => /문의|contact/i.test(p.name));
  const fab = S.fab && page.blocks[0] && /hero|pagehead/.test(page.blocks[0].type) && (ctx.hasContact || ci >= 0) ? `<a class="pk-fab" ${ctx.hasContact ? 'href="#pk-contact" data-link="문의"' : `href="{{page:${ci + 1}}}" data-go="${ci}" data-link="${esc(S.pages[ci].name)}"`}><i aria-hidden="true"></i>문의하기</a>` : '';
  return {html: `<div class="pk" style="--scan:${th.scan};--scan-rgb:${th.scanRgb};--scan-ink:${th.ink};--scan-ink-rgb:${th.inkRgb}">\n${parts.join('\n')}\n${fab}\n</div>`, three: ctx.three, top: page.blocks[0] && /hero|pagehead/.test(page.blocks[0].type)};
}
// 아임웹 코드 위젯에 붙일 코드 (머리글·바닥글은 아임웹 것)
function kitCode(spec, pi, o = {}){
  const S = kitNorm(spec), b = kitBody(spec, pi, o);
  return `<\!-- ${esc(o.title || '')} · ${esc((S.pages[pi] || {}).name || '')} — PM 워크벤치 디자인 키트. 아임웹 코드 위젯(전체 폭)에 그대로 붙여 넣습니다 -->
${KIT_LINKS}
<style>
${KIT_CSS}
</style>
${b.html}
${b.three ? `<script src="${KIT_THREE}"><\/script>\n` : ''}<script>
${KIT_RUN}
<\/script>`;
}

/* 글 양·숫자 점검 (AI 없이): 구역마다 보이는 글자 수, 원고에 없는 숫자 */
function kitAudit(spec, srcText){
  const S = kitNorm(spec), out = [], src = str(srcText).replace(/,/g, '');
  const texts = v => v == null ? [] : typeof v === 'string' || typeof v === 'number' ? [str(v)] : Array.isArray(v) ? v.flatMap(texts) : typeof v === 'object' ? Object.entries(v).filter(([k]) => !/^(type|to|icon|photo|visual|art|flip|code|prefix|en|eyebrow|label|cap|by)$/.test(k)).flatMap(([, x]) => texts(x)) : [];
  S.pages.forEach((p, pi) => p.blocks.forEach((b, bi) => {
    const t = texts(b).map(kitPlain).join(' '), n = t.replace(/\s/g, '').length, max = KIT_MAX[b.type] || 600;
    if (n > max) out.push({pi, bi, kind: 'long', msg: `${p.name}: ${bi + 1}번째 구역(${KIT_NAME[b.type]})의 글이 많습니다 · ${n}자 / 권장 ${max}자`});
    if (src) for (const m of t.matchAll(/\d[\d,.]*/g)){ const num = m[0].replace(/,/g, '').replace(/\.$/, ''); if (num.length >= 2 && !src.includes(num)) { out.push({pi, bi, kind: 'num', msg: `${p.name}: ${bi + 1}번째 구역(${KIT_NAME[b.type]})에 원고에 없는 숫자 '${m[0]}'가 있습니다`}); break; } }
  }));
  return out;
}

/* 미리보기 문서: 아임웹 머리글·바닥글을 흉내 내고, 메뉴를 누르면 워크벤치가 그 페이지로 바꿔 그린다.
   미리보기 안의 #… 링크는 워크벤치 주소로 풀리므로 직접 그 구역으로 스크롤한다.
   probe가 켜지면 화면을 다 그린 뒤 넘침·글자 대비·잘린 글·3D를 재서 워크벤치로 알린다 */
const KIT_SHELL_CSS = `:root{color-scheme:light}html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:#fff;font-family:'Pretendard','Noto Sans KR',sans-serif}
.ph-h{position:fixed;z-index:80;left:0;right:0;top:0;color:#fff;transition:background .4s,color .4s,box-shadow .4s}
.ph-h.glass{background:rgba(8,14,24,.66);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.ph-h.solid{background:rgba(255,255,255,.95);color:#111A27;box-shadow:0 1px 0 #DCE2EA;backdrop-filter:blur(10px)}
.ph-in{max-width:1320px;margin:0 auto;height:76px;display:flex;align-items:center;gap:26px;padding:0 20px}
.ph-logo{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;letter-spacing:-.04em;color:inherit;text-decoration:none;flex:none}
.ph-logo i{width:26px;height:26px;border-radius:7px;border:2px solid currentColor;display:grid;place-items:center}.ph-logo i::after{content:"";width:10px;height:10px;border-radius:2px;background:var(--a)}
.ph-nav{display:flex;gap:24px;margin-left:auto;overflow:hidden}.ph-nav a{color:inherit;text-decoration:none;font-size:15px;font-weight:600;opacity:.86;white-space:nowrap}.ph-nav a.on,.ph-nav a:hover{opacity:1;color:var(--a)}
.ph-h.solid .ph-nav a.on,.ph-h.solid .ph-nav a:hover{color:var(--ai)}
.ph-cta{flex:none;display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:999px;background:var(--a);color:#0C1522;font-size:14px;font-weight:700;text-decoration:none}.ph-h.solid .ph-cta{background:var(--ai);color:#fff}
.ph-menu{display:none;margin-left:auto;width:42px;height:42px;border-radius:12px;border:1px solid currentColor;background:none;color:inherit}.ph-menu i,.ph-menu i::before,.ph-menu i::after{display:block;width:18px;height:1.5px;margin:0 auto;background:currentColor;position:relative}.ph-menu i::before,.ph-menu i::after{content:"";position:absolute;left:0}.ph-menu i::before{top:-6px}.ph-menu i::after{top:6px}
.ph-dr{display:none;position:fixed;z-index:79;left:0;right:0;top:76px;background:#fff;color:#111A27;padding:8px 20px 20px;box-shadow:0 20px 40px -20px rgba(12,21,34,.4)}.ph-dr.open{display:grid}.ph-dr a{padding:14px 4px;border-bottom:1px solid #DCE2EA;color:inherit;text-decoration:none;font-weight:700}
.ph-f{background:#080E18;color:#7F93AD;font-size:13px;padding:40px 20px 56px}.ph-f div{max-width:1320px;margin:0 auto;display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px}.ph-f b{color:#fff;font-size:16px}
@media (max-width:1080px){.ph-nav,.ph-cta{display:none}.ph-menu{display:block}}`;
function kitPreview(spec, pi, o = {}){
  const S = kitNorm(spec), b = kitBody(spec, pi, o), th = kitTheme(o.accent), names = S.pages.map(p => p.name);
  const ci = names.findIndex(n => /문의|contact/i.test(n));
  const nav = names.map((n, i) => i ? `<a href="#" data-go="${i}"${i === pi ? ' class="on"' : ''}>${esc(n)}</a>` : '').join('');
  const html = b.html.replace(/\{\{page:\d+\}\}/g, '#');
  const probe = `function pkProbe(){var W=innerWidth,root=document.querySelector('.pk'),out={w:W,wide:[],clip:[],low:[],imgs:0,three:null};if(!root)return out;
var lum=function(c){var f=function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
var rgb=function(s){s=String(s);var m=s.match(/[\\d.]+/g)||[0,0,0,0],k=/^color\\(/.test(s)?255:1;return [m[0]*k,m[1]*k,m[2]*k,m.length>3?+m[3]:1]};
var INK=[12,21,34],WH=[255,255,255];
function bgOf(el){for(var e=el;e&&e!==document.documentElement;e=e.parentElement){var c=rgb(getComputedStyle(e).backgroundColor);if(c[3]>.5)return c;if(e.classList&&(e.classList.contains('pk-d')||e.classList.contains('pk-card')||e.classList.contains('no')&&e.classList.contains('pk-do')))return INK;}return WH}
var BOX='.pk-card,.pk-doc-p,.pk-term,.pk-stat,.pk-do,.pk-cant-i,.pk-flow li,.pk-btn,.pk-check,.pk-form,.pk-q-b';
var name=function(el){var s=(el.textContent||'').replace(/\\s+/g,' ').trim();return s.slice(0,28)};
var blk=function(el){var s=el.closest('[data-pk-b]');return s?+s.getAttribute('data-pk-b'):-1};
var all=root.querySelectorAll('*');for(var i=0;i<all.length;i++){var el=all[i];if(el.closest('[aria-hidden="true"]')||el.closest('.pk-tags')||el.closest('.pk-fab'))continue;
var own=false;for(var k=0;k<el.childNodes.length;k++){var n=el.childNodes[k];if(n.nodeType===3&&n.nodeValue.trim()){own=true;break}}if(!own)continue;
var r=el.getBoundingClientRect();if(!r.width||!r.height)continue;var cs=getComputedStyle(el);if(cs.visibility==='hidden')continue;
if(el.closest('.pk-card-d,.pk-step-d,.pk-q-a')){var cl=el.closest('.pk-card-d,.pk-step-d,.pk-q-a');if(cl.getBoundingClientRect().height<4)continue}
if(r.right>W+2||r.left<-2)out.wide.push({b:blk(el),t:name(el)});
var bx=el.parentElement&&el.parentElement.closest(BOX);if(bx){var R=bx.getBoundingClientRect();if(r.bottom>R.bottom+2||r.right>R.right+2)out.clip.push({b:blk(el),t:name(el)})}
if(!el.closest('.pk-say-p')){var fg=rgb(cs.color),bg=bgOf(el),a=fg[3];var f=[0,1,2].map(function(j){return fg[j]*a+bg[j]*(1-a)});var x=lum(f),y=lum(bg),cr=(Math.max(x,y)+.05)/(Math.min(x,y)+.05);var big=parseFloat(cs.fontSize)>=24||parseFloat(cs.fontSize)>=18.6&&+cs.fontWeight>=700;if(cr<(big?3:4.5))out.low.push({b:blk(el),t:name(el),r:Math.round(cr*10)/10})}}
var im=root.querySelectorAll('img');for(var j=0;j<im.length;j++)if(im[j].complete&&!im[j].naturalWidth)out.imgs++;
var h=root.querySelector('.pk-hero');if(h&&h.querySelector('.pk-hero-3d'))out.three=!h.classList.contains('no3d');
['wide','clip','low'].forEach(function(k){out[k]=out[k].slice(0,8)});return out}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(names[pi] || '')}</title>
${o.fontFace ? `<style>@font-face{font-family:'Pretendard';src:url(${o.fontFace}) format('woff2');font-weight:45 920;font-display:swap}</style>` : ''}${XS_FONT}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>${KIT_SHELL_CSS}</style><style>${KIT_CSS}</style></head><body style="--a:${th.scan};--ai:${th.ink}">
<header class="ph-h${b.top ? '' : ' solid'}" id="ph-h"><div class="ph-in"><a class="ph-logo" href="#" data-go="0"><i></i>${esc(o.brand || '')}</a><nav class="ph-nav">${nav}</nav>${ci > 0 && ci !== pi ? `<a class="ph-cta" href="#" data-go="${ci}">${esc(names[ci])}</a>` : ''}<button class="ph-menu" type="button" id="ph-menu" aria-label="메뉴"><i></i></button></div></header>
<nav class="ph-dr" id="ph-dr"><a href="#" data-go="0">${esc(names[0] || '메인')}</a>${nav}</nav>
${html}
<footer class="ph-f"><div><b>${esc(o.brand || '')}</b><span>아임웹 바닥글이 들어가는 자리입니다 (회사 정보·약관)</span></div></footer>
${b.three ? `<script src="${KIT_THREE}"><\/script>` : ''}<script>${KIT_RUN}<\/script>
<script>(function(){var h=document.getElementById('ph-h'),top=${b.top ? 'true' : 'false'},dr=document.getElementById('ph-dr'),hero=document.querySelector('.pk-hero,.pk-ph');
function on(){var lim=hero?hero.offsetHeight-80:0,solid=!top||scrollY>lim||dr.classList.contains('open');h.classList.toggle('solid',solid);h.classList.toggle('glass',!solid&&scrollY>30)}
addEventListener('scroll',on,{passive:true});on();addEventListener('message',function(e){if(e.source!==parent||!e.data||typeof e.data.pkScroll!=='number')return;var el=document.querySelector('[data-pk-b="'+e.data.pkScroll+'"]');if(el)el.scrollIntoView({block:'start'})});document.getElementById('ph-menu').addEventListener('click',function(){dr.classList.toggle('open');on()});
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var g=a.getAttribute('data-go'),h=a.getAttribute('href')||'';if(g!=null){e.preventDefault();parent.postMessage({pkGo:+g},'*')}else if(h.charAt(0)==='#'){e.preventDefault();var t=h.length>1&&document.getElementById(h.slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}});
${o.probe ? `${probe}\nfunction send(){parent.postMessage({pkCheck:pkProbe(),pkTok:${JSON.stringify(str(o.probe))}},'*')}(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(send,1400)});` : ''}})();<\/script>
</body></html>`;
}
