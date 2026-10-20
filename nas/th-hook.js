/* 🔀 팀허브 「할 일」 버튼만 우리 프로그램으로 ───────────────────────
   미디어마케팅팀 팀허브(mediam_TeamHub.html)에 이 한 줄만 붙이면 됩니다 —
     <script src="th-hook.js"></script>
   그러면 왼쪽 메뉴에서 <<할 일>> 을 누를 때만 우리 브랜드허브 할 일
   화면으로 갑니다. 캘린더·콘텐츠·TODAY 같은 다른 버튼은 그대로입니다.
   팀허브 속을 건드리지 않습니다 — 버튼 눌리는 그 순간만 가로챕니다. */
(function () {
  'use strict';

  /* 우리 할 일 화면 — 같은 폴더의 brand.html#할일 */
  var TASKS = location.href.replace(/[^/]*$/, '') + 'brand.html#할일';

  /* 「할 일」 이라는 <<메뉴 한 칸>> 만 고릅니다.
     「할 일 저장·주고받기」 · 「팀 캘린더」 같은 것은 건드리지 않습니다. */
  var TASK_WORD = /^(할일|todo|tasks?)$/i;
  var AVOID = /(저장|주고받|캘린더|동기화|마인드맵|목록|링크|보기|고치|끝난|대시보드)/;

  function norm(s) { return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim(); }

  /* 글자에서 아이콘·이모지를 떼고, 「할 일」 뿐인지 봅니다 */
  function isTasksText(txt) {
    var core = norm(txt).replace(/[^0-9A-Za-z가-힣 ]/g, '').trim();
    if (!core || core.length > 8) return false;       /* 긴 글은 메뉴 한 칸이 아닙니다 */
    if (AVOID.test(core)) return false;
    return TASK_WORD.test(core.replace(/\s/g, ''));
  }

  /* 눌린 자리에서 위로 올라가며 <<누를 수 있는 메뉴 칸>> 을 찾습니다 */
  function tasksItem(start) {
    var el = start;
    for (var i = 0; i < 6 && el && el.nodeType === 1; i++, el = el.parentElement) {
      var clickable = el.matches && el.matches(
        'a,button,li,[role=menuitem],[role=button],[role=link],[role=tab]');
      if (clickable && isTasksText(el.textContent)) return el;
    }
    return null;
  }

  function go() {
    try { location.assign(TASKS); } catch (e) { location.href = TASKS; }
  }

  /* 버튼 눌리는 그 순간 가로챕니다 — 팀허브가 제 일을 하기 전에.
     캡처 단계라 팀허브가 화면을 다시 그려도 계속 먹힙니다. */
  document.addEventListener('click', function (e) {
    var it = tasksItem(e.target);
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    go();
  }, true);

  /* 손으로 부를 창구 하나 (안 될 때 콘솔에서 __goBrandTasks()) */
  try { window.__goBrandTasks = go; } catch (e) { }
})();
