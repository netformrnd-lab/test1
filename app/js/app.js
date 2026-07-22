// 아파트스퀘어 앱 — 화면 전환 (기초 버전)
(function () {
  var stage = document.getElementById('stage');
  var frame = document.getElementById('frame');

  // 폰 디자인(가로 320px)을 실제 화면 폭에 맞춰 확대/축소
  function fit() {
    var w = frame.clientWidth, h = frame.clientHeight;
    var scale = w / 320;
    stage.style.zoom = scale;
    stage.style.width = '320px';
    stage.style.height = (h / scale) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // 화면 전환
  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
  function show(id) {
    if (!document.getElementById(id)) return;
    screens.forEach(function (s) { s.classList.toggle('active', s.id === id); });
    var bd = document.querySelector('#' + id + ' .bd');
    if (bd) bd.scrollTop = 0;
    if (('#' + id) !== location.hash) history.replaceState(null, '', '#' + id);
  }
  window.showScreen = show;

  // 주소창 해시로 특정 화면 열기 (#s07 등) — 딥링크
  function fromHash() { var id = location.hash.replace('#', ''); if (id) show(id); }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
