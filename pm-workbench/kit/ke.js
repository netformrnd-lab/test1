/* 구역 편집: 시안을 AI에게 다시 맡기지 않고 직접 고친다. 글 고치기·순서·빼기·고정·이 구역만 다시 만들기.
   고친 것은 지금 안에 바로 저장하고(새 안을 만들지 않는다) 그 페이지만 다시 점검한다. 고정한 구역은 '요청대로 고치기'에도 그대로 남는다 */
const KE_LABEL = {tag: '정체 표기', brand: '브랜드', title: '제목', text: '설명', note: '아래 작은 글', eyebrow: '작은 머리말', by: '출처 한 줄', label: '라벨', link: '버튼 글', to: '연결 (페이지 이름·#contact·#b3)', sub: '부제', en: '영문 이름', points: '요점 (한 줄에 하나)', need: '확인 필요', q: '질문', a: '답', term: '용어', value: '숫자', unit: '단위', name: '이름', rec: '남는 기록', cap: '큰 숫자 아래 글', paras: '문단 (한 줄에 하나)', submit: '제출 버튼 글', formTitle: '폼 제목', fields: '폼 항목 (한 줄에 하나)', t: '이름표', n: '이름표 설명', stamp: '도장 글', buttons: '버튼', items: '항목', labels: '이름표', doc: '문서 그림', do: '하는 일', dont: '하지 않는 일', extra: '추가 상자', check: '확인 상자', flow: '진행 순서', info: '연락 정보', b: '굵은 앞말'};
const KE_SKIP = new Set(['type', 'icon', 'photo', 'visual', 'art', 'flip', 'code', 'prefix', 'lock', 'alt', 'sample']);
let keBusy = '';
const keTitle = b => kitPlain(b.title || b.text || b.tag || '') || KIT_NAME[b.type] || b.type;
// 구역의 글 칸을 폼으로 (문자열·문자열 목록·객체·객체 목록)
function keFields(v, path, label){
  const lab = `<span class="ke-l">${esc(label)}</span>`;
  if (typeof v === 'string' || typeof v === 'number') return `<label class="ke-f">${lab}${str(v).length > 40 || /\n/.test(str(v)) ? `<textarea class="bf-in" rows="${Math.min(6, Math.max(2, Math.ceil(str(v).length / 40)))}" data-kf="${esc(path)}">${esc(v)}</textarea>` : `<input class="bf-in" data-kf="${esc(path)}" value="${esc(v)}">`}</label>`;
  if (Array.isArray(v)){
    if (v.every(x => typeof x === 'string')) return `<label class="ke-f">${lab}<textarea class="bf-in" rows="${Math.max(2, v.length + 1)}" data-kf="${esc(path)}" data-kl="1">${esc(v.join('\n'))}</textarea></label>`;
    return `<fieldset class="ke-g"><legend>${esc(label)}</legend>${v.map((x, i) => typeof x === 'object' && x ? `<fieldset class="ke-g ke-i"><legend>${i + 1}</legend>${Object.entries(x).filter(([k]) => !KE_SKIP.has(k)).map(([k, y]) => keFields(y, `${path}.${i}.${k}`, KE_LABEL[k] || k)).join('')}</fieldset>` : keFields(x, `${path}.${i}`, `${i + 1}`)).join('')}</fieldset>`;
  }
  if (v && typeof v === 'object') return `<fieldset class="ke-g"><legend>${esc(label)}</legend>${Object.entries(v).filter(([k]) => !KE_SKIP.has(k)).map(([k, y]) => keFields(y, `${path}.${k}`, KE_LABEL[k] || k)).join('')}</fieldset>`;
  return '';
}
function keRead(block, root){
  const b = JSON.parse(JSON.stringify(block));
  root.querySelectorAll('[data-kf]').forEach(el => {
    const ks = el.dataset.kf.split('.'); let o = b;
    for (let i = 0; i < ks.length - 1; i++){ o = o[/^\d+$/.test(ks[i]) ? +ks[i] : ks[i]]; if (o == null) return; }
    const last = ks[ks.length - 1], val = el.dataset.kl ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value;
    o[/^\d+$/.test(last) ? +last : last] = val;
  });
  return b;
}
async function keSpec(){ const v = xsList(xsView.run)[xsView.i]; return v && v.kind === 'kit' ? kitNorm(await xsSpec(v)) : null; }
// 지금 안에 바로 저장하고, 그 페이지만 다시 점검한다
async function keSave(spec, msg){
  const run = xsView.run, i = xsView.i, pi = xsView.p || 0, vers = [...xsList(run)], v = vers[i]; if (!v) return;
  if (!assetsCap || !writable()){ toast('편집 권한이 없어 저장할 수 없습니다'); return; }
  const text = JSON.stringify(spec), res = await assetsCap.upload(new Blob([text], {type: 'text/plain'}), {type: 'text/plain'});
  xsCache[res.id] = text;
  const nv = {...v, id: res.id, editedAt: Date.now(), edits: (v.edits || 0) + 1, bytes: text.length, pages: spec.pages.map(p => p.name)};
  vers[i] = nv; xPut(run, {site: {...(xOf(run).site || {}), vers}}); assetsCap.delete(v.id).catch(() => {});
  if (msg) toast(msg);
  await xsOpen(run, i, true);
  try {
    const c = await kitCheck(run, spec, v.imgs || [], null, pi), old = (v.check && v.check.items) || [];
    const vs = [...xsList(run)], j = vs.findIndex(x => x.id === res.id); if (j < 0) return;
    vs[j] = {...vs[j], check: {at: Date.now(), three: c.three ?? (v.check && v.check.three), items: [...old.filter(x => x.pi !== pi), ...c.items.filter(x => x.pi === pi)]}};
    xPut(run, {site: {...(xOf(run).site || {}), vers: vs}});
    const dlg = document.getElementById('xsDlg'); if (dlg && dlg.open && xsView.i === j){ const ch = dlg.querySelector('.xs-chk'); if (ch) ch.innerHTML = kitCheckHTML(vs[j], pi); }
    renderView();
  } catch (e) {}
}
async function keAct(act, val){
  const spec = await keSpec(); if (!spec) return;
  const pi = xsView.p || 0, B = spec.pages[pi].blocks, bi = xsView.sel ?? -1;
  if (act === 'sel'){ xsView.sel = +val; xsView.form = false; keRender(spec); const f = document.querySelector('#xsDlg .xs-stage iframe'); if (f && f.contentWindow) f.contentWindow.postMessage({pkScroll: +val}, '*'); return; }
  if (bi < 0 || !B[bi]) return;
  if (act === 'edit'){ xsView.form = true; keRender(spec); return; }
  if (act === 'cancel'){ xsView.form = false; keRender(spec); return; }
  if (act === 'save'){ const root = document.querySelector('#xsDlg .ke-form'); if (!root) return; B[bi] = keRead(B[bi], root); xsView.form = false; await keSave(spec, '구역 글을 고쳤습니다'); return; }
  if (act === 'up' || act === 'down'){ const j = bi + (act === 'up' ? -1 : 1); if (j < 0 || j >= B.length) return; [B[bi], B[j]] = [B[j], B[bi]]; xsView.sel = j; await keSave(spec); return; }
  if (act === 'del'){ if (B.length <= 1){ toast('구역이 하나뿐이라 뺄 수 없습니다'); return; } if (armItem !== 'ke-del:' + bi){ armItem = 'ke-del:' + bi; keRender(spec); return; } armItem = null; B.splice(bi, 1); xsView.sel = Math.min(bi, B.length - 1); await keSave(spec, '구역을 뺐습니다'); return; }
  if (act === 'lock'){ B[bi] = {...B[bi], lock: !B[bi].lock}; await keSave(spec, B[bi].lock ? '고정했습니다. 요청대로 고칠 때도 이 구역은 그대로 둡니다' : '고정을 풀었습니다'); return; }
  if (act === 'regen') return keRegen(spec, pi, bi);
}
// 이 구역만 다시 만들기: 같은 페이지 맥락에서 구역 하나만 AI가 다시 쓴다
async function keRegen(spec, pi, bi){
  const run = xsView.run; if (keBusy) return;
  if (!sample || aiOff){ toast(aiOffMsg || 'AI를 쓸 수 없는 환경입니다'); return; }
  const t = document.querySelector('#xsDlg [data-draft="keAsk"]'); if (t) drafts.keAsk = t.value;
  const ask = str(drafts.keAsk).trim(), photos = attFiles(run, 'assets').filter(attIsImg).slice(0, 12), links = xsLinks(run).filter(l => !l.err && l.extract), B = spec.pages[pi].blocks;
  keBusy = `${bi + 1}번째 구역을 다시 쓰는 중입니다`; keRender(spec);
  try {
    const base = kitPagePrompt(run, spec.pages, pi, photos, ask, {blocks: B}, links).replace(/JSON 객체 하나로만 답하라\. \{"blocks":\[\{"type":"…"\}\]\}$/, '');
    const v = await sample.json(`${base}[이번에는 위 [지금 구성]의 ${bi + 1}번째 구역(${KIT_NAME[B[bi].type] || B[bi].type}) 하나만 다시 쓴다. 다른 구역과 같은 말을 되풀이하지 않는다. 더 맞는 종류가 있으면 종류를 바꿔도 된다]
JSON 객체 하나로만 답하라. {"block":{"type":"…"}}`, {cache: false});
    const nb = v && v.block && KIT_TYPES.includes(str(v.block.type)) ? v.block : null;
    if (!nb) throw {msg: '구역을 받지 못했습니다. 다시 눌러 주세요'};
    B[bi] = nb; drafts.keAsk = ''; keBusy = '';
    await keSave(spec, `${bi + 1}번째 구역을 다시 만들었습니다`);
  } catch (e){ keBusy = ''; toast((e && e.msg) || aiErrText(e && e.code)); keRender(spec); }
}
function keRender(spec){
  const box = document.querySelector('#xsDlg .xs-edit'); if (!box || !spec) return;
  const pi = xsView.p || 0, B = (spec.pages[pi] || {}).blocks || [], bi = xsView.sel ?? -1, b = B[bi], canW = writable(), noAI = !sample || aiOff;
  box.innerHTML = `<div class="ke-head"><b>구역 편집</b><span class="hint">${esc(spec.pages[pi] ? spec.pages[pi].name : '')} · ${B.length}구역 · 고치면 이 안에 바로 저장됩니다</span></div>
    <ol class="ke-list">${B.map((x, i) => `<li class="${i === bi ? 'on' : ''}"><button class="ke-row" data-act="ke" data-ke="sel" data-val="${i}"><span class="mono">${String(i + 1).padStart(2, '0')}</span><span class="chip">${esc(KIT_NAME[x.type] || x.type)}</span><span class="ke-t">${esc(cut(keTitle(x), 40))}</span>${x.lock ? '<span class="ke-lock" title="고정">고정</span>' : ''}</button>
      ${i === bi && canW ? (xsView.form ? `<div class="ke-form">${Object.entries(x).filter(([k]) => !KE_SKIP.has(k)).map(([k, y]) => keFields(y, k, KE_LABEL[k] || k)).join('')}<p class="hint">강조할 말은 *별표*로 감쌉니다. 줄을 나누려면 줄바꿈을 넣습니다.</p><div class="row-actions"><button class="btn primary small" data-act="ke" data-ke="save">저장</button><button class="btn ghost small" data-act="ke" data-ke="cancel">취소</button></div></div>`
        : `<div class="ke-acts">${keBusy ? `<p class="thinking">${esc(keBusy)}</p>` : `<button class="btn small" data-act="ke" data-ke="edit">글 고치기</button><button class="btn ghost small" data-act="ke" data-ke="up" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button class="btn ghost small" data-act="ke" data-ke="down" ${i < B.length - 1 ? '' : 'disabled'} aria-label="아래로">↓</button><button class="btn ghost small" data-act="ke" data-ke="lock">${x.lock ? '고정 풀기' : '고정'}</button><button class="btn ghost small" data-act="ke" data-ke="del">${armItem === 'ke-del:' + i ? '정말 뺄까요?' : '빼기'}</button>
          <div class="ke-regen"><input class="bf-in" data-draft="keAsk" value="${esc(drafts.keAsk || '')}" placeholder="이 구역만 다시 만들 때 요청 (선택)" aria-label="이 구역 요청"><button class="btn ai small" data-act="ke" data-ke="regen" ${noAI ? 'disabled' : ''}>이 구역만 다시 만들기</button></div>`}</div>`) : ''}</li>`).join('')}</ol>`;
}
