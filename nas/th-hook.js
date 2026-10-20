/* 🔀 팀허브 「할 일」 = 우리 프로그램 (넘어가지 않고 그 자리에) ──────
   mediam.php 로 열면 저절로 끼워집니다 (파일 편집 필요 없음).

   왼쪽 메뉴 「할 일」 을 누르면 — 다른 데로 <<넘어가지 않고>> 팀허브
   화면 위(사이드바는 그대로)에 우리 브랜드허브 할 일이 떠서, 거기서
   바로 고칩니다. ✕ 를 누르면 팀허브 그대로 (새로고침·재로그인 없음).
   캘린더·콘텐츠·TODAY 같은 다른 버튼은 건드리지 않습니다. */
(function () {
  'use strict';

  /* 같은 폴더의 brand.html 로 — <<주소 끝의 #해시·?꼬리를 먼저 떼고>> 폴더만.
     팀허브가 #/home 처럼 해시를 달고 있으면 location.href 끝이 / 라,
     그냥 자르면 폴더가 안 잡혀 팀허브가 또 열립니다. */
  var DIR = (location.origin + location.pathname).replace(/[^/]*$/, '');
  var TASKS = DIR + 'brand.html#할일';
  var TASK_WORD = /^(할일|todo|tasks?)$/i;
  var AVOID = /(저장|주고받|캘린더|동기화|마인드맵|목록|링크|보기|고치|끝난|대시보드)/;
  var OV = 'bh-task-ov';

  function norm(s){ return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim(); }

  function isTasksText(txt){
    var core = norm(txt).replace(/[^0-9A-Za-z가-힣 ]/g, '').trim();
    if (!core || core.length > 8) return false;
    if (AVOID.test(core)) return false;
    return TASK_WORD.test(core.replace(/\s/g, ''));
  }

  /* 눌린 자리에서 위로 올라가며 「할 일」 메뉴 칸을 찾습니다 */
  function tasksItem(start){
    var el = start;
    for (var i = 0; i < 6 && el && el.nodeType === 1; i++, el = el.parentElement) {
      var clickable = el.matches && el.matches(
        'a,button,li,[role=menuitem],[role=button],[role=link],[role=tab]');
      if (clickable && isTasksText(el.textContent)) return el;
    }
    return null;
  }

  /* 화면 어딘가에서 「할 일」 메뉴를 찾습니다 (손으로 부를 때) */
  function findTasksItem(){
    var list = document.querySelectorAll(
      'a,button,li,[role=menuitem],[role=button],[role=link],[role=tab]');
    for (var i = 0; i < list.length; i++) if (isTasksText(list[i].textContent)) return list[i];
    return null;
  }

  /* 왼쪽 사이드바 폭을 잽니다 — 그만큼 비우고 그 오른쪽에 띄웁니다.
     못 찾으면 화면 전체로 (그래도 ✕ 로 닫으면 그대로 돌아옵니다). */
  function sidebarWidth(item){
    var el = item || findTasksItem();
    var vw = window.innerWidth, vh = window.innerHeight, best = 0;
    for (var i = 0; el && i < 10; i++, el = el.parentElement) {
      if (el.nodeType !== 1 || !el.getBoundingClientRect) continue;
      var r = el.getBoundingClientRect();
      if (r.left <= 8 && r.height >= vh * 0.5 && r.width > 80 && r.width <= vw * 0.42)
        best = Math.round(r.right);
    }
    return best;
  }

  function closeTasks(){
    var o = document.getElementById(OV);
    if (o && o.parentNode) o.parentNode.removeChild(o);
    document.removeEventListener('keydown', onEsc, true);
  }
  function onEsc(e){ if (e.key === 'Escape' || e.keyCode === 27) closeTasks(); }

  function openTasks(item){
    var old = document.getElementById(OV);
    if (old) { old.style.display = 'flex'; return; }
    var left = sidebarWidth(item);

    var ov = document.createElement('div');
    ov.id = OV;
    ov.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:' + left + 'px;'
      + 'z-index:2147483647;background:#fff;display:flex;flex-direction:column;'
      + 'box-shadow:-2px 0 16px rgba(0,0,0,.12)';

    var bar = document.createElement('div');
    bar.style.cssText = 'flex:none;display:flex;align-items:center;gap:10px;'
      + 'padding:8px 14px;background:#2563eb;color:#fff;font:600 14px/1.4 '
      + '-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    bar.innerHTML = '<span>✅ 할 일 — 브랜드 허브</span>'
      + '<span style="flex:1"></span>';
    var x = document.createElement('button');
    x.textContent = '✕ 닫기';
    x.style.cssText = 'background:rgba(255,255,255,.18);color:#fff;border:0;'
      + 'border-radius:7px;padding:6px 12px;font:inherit;cursor:pointer';
    x.onclick = closeTasks;
    bar.appendChild(x);

    var fr = document.createElement('iframe');
    fr.src = TASKS;
    fr.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
    fr.setAttribute('title', '브랜드 허브 할 일');

    ov.appendChild(bar);
    ov.appendChild(fr);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onEsc, true);
  }

  /* 버튼 눌리는 그 순간 가로채 — <<넘어가지 않고>> 띄웁니다 */
  document.addEventListener('click', function (e) {
    var it = tasksItem(e.target);
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openTasks(it);
  }, true);

  try {
    window.__goBrandTasks = function(){ openTasks(null); };
    window.__closeBrandTasks = closeTasks;
  } catch (e) {}

  /* 🔗 <<#할일 로 열면 바로 띄웁니다>> — 브랜드허브에서 미디어마케팅팀을
     누르면 mediam.php#할일 로 들어오니, 그때 열자마자 우리 할 일이 뜹니다.
     (#/board 같은 팀허브 자기 꼬리표에는 안 반응합니다 — 그건 팀허브 화면) */
  function wantTasksHash(){
    var h = '';
    try { h = decodeURIComponent(location.hash || ''); } catch (e) { h = location.hash || ''; }
    return /^#(할일|할-일|tasks?|todo)$/i.test(h);
  }
  function maybeAuto(){ if (wantTasksHash()) openTasks(null); }
  if (document.readyState === 'complete' || document.readyState === 'interactive')
    setTimeout(maybeAuto, 300);
  else document.addEventListener('DOMContentLoaded', function(){ setTimeout(maybeAuto, 300); });
  window.addEventListener('hashchange', maybeAuto);
})();
