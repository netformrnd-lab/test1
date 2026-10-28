/* 정한 것: PM·팀장님이 정한 것을 과제에 쌓아 두고, 분석부터 결과물까지 모든 AI 작업에 넣는다.
   원고·자료·이전 결과와 다르면 정한 것을 따른다. 바뀌면 그 전에 쓴 04 원고와 03 산출물 구성은 '바뀐 칸'이 된다 */
const DEC_SRC = ['PM', '팀장님', '대표님', '현업·고객'];
const decList = run => Array.isArray(run && run.decisions) ? run.decisions.filter(d => d && d.t) : [];
const decOn = run => decList(run).filter(d => !d.off);
const decAt = run => Number(run && run.decAt) || 0;
function decisionsBlock(run){
  const L = decOn(run); if (!L.length) return '';
  return `[이 과제에서 정한 것 — PM·팀장님이 정했다. 원고·자료·이전 결과물·레퍼런스와 다르면 이것을 따르고, 어긋나는 내용은 쓰지 않는다]\n${L.map(d => `- ${d.t} (${d.src}, ${d.date})`).join('\n')}\n`;
}
function decSave(run, list, msg){
  run.decisions = list; run.decAt = Date.now();
  persistRun(run, {decisions: list, decAt: run.decAt});
  if (msg) toast(msg);
  renderAll();
}
function decAdd(run, text, src, quiet){
  if (!writable()){ toast('보기 권한이라 바꿀 수 없습니다'); return false; }
  const t = cut(str(text).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim(), 240);
  if (!t){ if (!quiet) toast('정한 내용을 적어 주세요'); return false; }
  const list = decList(run); if (list.some(d => d.t === t)){ if (!quiet) toast('이미 정한 것입니다'); return false; }
  decSave(run, [...list, {id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t, src: DEC_SRC.includes(src) ? src : 'PM', date: today(), by: meId || null}], quiet ? '' : '정한 것에 넣었습니다. 앞으로 모든 AI 작업이 지킵니다');
  return true;
}
function decAddInput(run){
  const i = document.querySelector('[data-draft="decText"]'), s = document.querySelector('[data-draft="decSrc"]');
  if (i) drafts.decText = i.value; if (s) drafts.decSrc = s.value;
  if (decAdd(run, drafts.decText, drafts.decSrc)){ drafts.decText = ''; renderAll(); }
}
function decToggle(run, id){ decSave(run, decList(run).map(d => d.id === id ? {...d, off: !d.off} : d)); }
function decDel(run, id){ decSave(run, decList(run).filter(d => d.id !== id), '삭제했습니다'); }
// 팀장님 답: 한 줄에 하나씩 정한 것으로 넣는다
function decFromReply(run){
  const t = document.querySelector('#tellDlg [data-draft="tellReply"]'); if (t) drafts.tellReply = t.value;
  const lines = str(drafts.tellReply).split(/\n+/).map(x => x.replace(/^\s*[-*·•\d.)]+\s*/, '').trim()).filter(x => x.length > 1);
  if (!lines.length){ toast('팀장님이 주신 피드백을 한 줄에 하나씩 적어 주세요'); return; }
  let n = 0; for (const l of lines) if (decAdd(run, l, '팀장님', true)) n++;
  drafts.tellReply = ''; tellRender(); toast(n ? `팀장님 피드백 ${n}개를 정한 것에 넣었습니다. 앞으로 모든 AI 작업이 지킵니다` : '이미 정한 것과 같습니다');
}
function decHTML(run){
  if (!(run.done && run.done.analysis)) return '';
  const L = decList(run), on = decOn(run).length, canW = writable();
  const ad = pReady(run) ? CSX(run) : null, stale = ad ? ad.cats.filter(c => cStale(ad, c.k)).length : 0;
  return `<details class="dec card-box" data-xsdet="dec"${xsOpenDet.dec ? ' open' : ''}><summary><b>정한 것 ${on}${L.length > on ? ` / ${L.length}` : ''}</b> <span class="hint">PM·팀장님이 정한 것은 분석부터 결과물까지 모든 AI 작업이 지킵니다${L.length ? '' : ' · 예: 홈페이지는 대상별로 나누지 않고 공통으로'}</span></summary>
    ${L.length ? `<ol class="dec-list">${L.map(d => `<li class="${d.off ? 'off' : ''}"><span class="chip">${esc(d.src)}</span><span class="dec-t">${esc(d.t)}</span><span class="hint">${esc(md(d.date))}${d.off ? ' · 꺼 둠' : ''}</span>${canW ? `<button class="link" data-act="dec-toggle" data-val="${esc(d.id)}">${d.off ? '다시 지키기' : '잠시 끄기'}</button><button class="link" data-act="dec-del" data-val="${esc(d.id)}">${armItem === 'dec:' + d.id ? '정말 삭제?' : '삭제'}</button>` : ''}</li>`).join('')}</ol>` : ''}
    ${canW ? `<div class="dec-add"><select class="chip-select" data-draft="decSrc" aria-label="누가 정했나요">${DEC_SRC.map(s => `<option${(drafts.decSrc || 'PM') === s ? ' selected' : ''}>${s}</option>`).join('')}</select><input class="bf-in" data-draft="decText" value="${esc(drafts.decText || '')}" placeholder="예: 가격은 쓰지 않는다 / 기존 사이트와 다른 디자인으로" aria-label="정한 것"><button class="btn small" data-act="dec-add">넣기</button></div>` : ''}
    ${L.length ? `<p class="hint">정한 것이 바뀌면 그 전에 쓴 04 원고와 03 산출물 구성은 '바뀐 칸'으로 표시됩니다${stale ? ` (지금 원고 ${stale}칸)` : ''}. 페이지·쪽 구성처럼 큰 결정은 <button class="link" data-act="dec-plan">03 계획 › 산출물 구성</button>부터 다시 쓰면 아래 단계까지 맞춰집니다.</p>` : ''}
  </details>`;
}
