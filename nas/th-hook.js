/* 🔀 팀허브 「할 일」 = 우리 프로그램 (그 자리에 박아 넣기 · 연동) ──────
   mediam.php 로 열면 저절로 끼워집니다 (파일 편집 필요 없음).

   왼쪽 메뉴 「할 일」 을 누르면 — 다른 데로 넘어가지 않고, 팀허브
   <<내용 자리(사이드바 오른쪽)에 우리 브랜드허브 할 일이 그대로 박혀>>
   거기서 바로 고칩니다. 팝업 창이 아니라 그 화면의 할 일 자리가 우리
   프로그램으로 바뀌는 것입니다. HOME·캘린더 등 다른 메뉴를 누르면
   저절로 사라지고 팀허브 화면으로 돌아옵니다. */
(function () {
  'use strict';

  /* 같은 폴더의 brand.html 로 — <<주소 끝의 #해시·?꼬리를 먼저 떼고>> 폴더만. */
  var DIR = (location.origin + location.pathname).replace(/[^/]*$/, '');
  var TASKS = DIR + 'brand.html#할일';
  var TASK_WORD = /^(할일|todo|tasks?)$/i;
  var AVOID = /(저장|주고받|캘린더|동기화|마인드맵|목록|링크|보기|고치|끝난|대시보드)/;
  var OV = 'bh-task-ov';
  var curLeft = 0, curTop = 0;

  function norm(s){ return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim(); }

  function isTasksText(txt){
    var core = norm(txt).replace(/[^0-9A-Za-z가-힣 ]/g, '').trim();
    if (!core || core.length > 8) return false;
    if (AVOID.test(core)) return false;
    return TASK_WORD.test(core.replace(/\s/g, ''));
  }

  function tasksItem(start){
    var el = start;
    for (var i = 0; i < 6 && el && el.nodeType === 1; i++, el = el.parentElement) {
      var clickable = el.matches && el.matches(
        'a,button,li,[role=menuitem],[role=button],[role=link],[role=tab]');
      if (clickable && isTasksText(el.textContent)) return el;
    }
    return null;
  }

  function findTasksItem(){
    var list = document.querySelectorAll(
      'a,button,li,[role=menuitem],[role=button],[role=link],[role=tab]');
    for (var i = 0; i < list.length; i++) if (isTasksText(list[i].textContent)) return list[i];
    return null;
  }

  /* 왼쪽 사이드바 폭을 잽니다 — 그 오른쪽(내용 자리)만 우리 할 일로 덮습니다.
     못 재면 화면 전체. 사이드바는 그대로 보이고 눌러집니다. */
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
  }

  /* 내용 자리에 우리 할 일을 <<박아 넣습니다>> — 팝업 바 없이, 그대로 */
  function openTasks(item){
    var old = document.getElementById(OV);
    curLeft = sidebarWidth(item);
    if (old) {
      old.style.left = curLeft + 'px';
      old.style.display = 'block';
      return;
    }
    var ov = document.createElement('div');
    ov.id = OV;
    ov.style.cssText = 'position:fixed;top:' + curTop + 'px;right:0;bottom:0;'
      + 'left:' + curLeft + 'px;z-index:2147483646;background:#fff;'
      + 'border-left:1px solid #e5e7eb';

    var fr = document.createElement('iframe');
    fr.src = TASKS;
    fr.style.cssText = 'width:100%;height:100%;border:0;background:#fff;display:block';
    fr.setAttribute('title', '브랜드 허브 할 일');

    ov.appendChild(fr);
    document.body.appendChild(ov);
  }

  /* 클릭 가로채기 (캡처 단계) */
  document.addEventListener('click', function (e) {
    var it = tasksItem(e.target);
    if (it) {
      /* 「할 일」 — 넘어가지 않고 그 자리에 박아 넣습니다 */
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openTasks(it);
      return;
    }
    /* 할 일이 박혀 있는 동안, 왼쪽 사이드바의 <<다른 메뉴>> 를 누르면
       우리 할 일을 걷어내고 팀허브 화면으로 돌아갑니다 (팀허브가 그 메뉴로
       움직이게 그대로 둡니다 — preventDefault 안 합니다) */
    if (document.getElementById(OV) && curLeft && e.clientX && e.clientX < curLeft) {
      closeTasks();
    }
  }, true);

  try {
    window.__goBrandTasks = function(){ openTasks(null); };
    window.__closeBrandTasks = closeTasks;
  } catch (e) {}

  /* 🔗 #할일 로 열면 바로 박아 넣습니다 (브랜드허브 → 미디어마케팅팀 자리를
     mediam.php#할일 로 둘 때). #/board 같은 팀허브 자기 꼬리표엔 안 반응. */
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
