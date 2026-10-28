(function(){
  var roots = document.querySelectorAll('.pk:not([data-pk-on])');
  Array.prototype.forEach.call(roots, function(root){
  root.setAttribute('data-pk-on', '1');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('pk-js');
  var $ = function(s, r){ return (r || root).querySelector(s); }, $$ = function(s, r){ return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var hasIO = 'IntersectionObserver' in window;
  function watch(el, on, opt){ if (!el) return; if (!hasIO){ on(true); return; } new IntersectionObserver(function(es){ es.forEach(function(e){ on(e.isIntersecting, e); }); }, opt || {threshold: 0}).observe(el); }
  var css = getComputedStyle(root), scanHex = (css.getPropertyValue('--scan') || '#5CCBF5').trim(), scanRgb = (css.getPropertyValue('--scan-rgb') || '92,203,245').trim();

  /* 스크롤하면 떠오르기: 처음 화면에 보이는 것은 손대지 않는다 */
  var rv = $$('.pk-rv');
  if (hasIO && !reduce){
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, {threshold: .12, rootMargin: '0px 0px -6% 0px'});
    rv.forEach(function(el){ if (el.getBoundingClientRect().top < innerHeight * .9) el.classList.add('in'); else { el.classList.add('pre'); io.observe(el); } });
  } else rv.forEach(function(el){ el.classList.add('in'); });

  /* 한 문장을 스크롤에 따라 채운다 */
  var fills = $$('[data-fill]').map(function(say){
    var hl = (say.getAttribute('data-hl') || '').split('|'), words = [], txt = say.textContent.trim().split(/\s+/);
    say.textContent = '';
    txt.forEach(function(w, i){ var s = document.createElement('span'); s.textContent = w; if (hl.some(function(h){ return h && (w.indexOf(h) === 0 || h.indexOf(w.replace(/[,.!?]$/, '')) === 0); })) s.className = 'hl'; say.appendChild(s); if (i < txt.length - 1) say.appendChild(document.createTextNode(' ')); words.push(s); });
    return {el: say, words: words};
  });
  function fill(){
    fills.forEach(function(f){
      if (reduce){ f.words.forEach(function(s){ s.classList.add('on'); }); return; }
      var r = f.el.getBoundingClientRect(), p = (innerHeight * .82 - r.top) / (r.height + innerHeight * .35);
      var n = Math.round(Math.max(0, Math.min(1, p)) * f.words.length);
      f.words.forEach(function(s, i){ s.classList.toggle('on', i < n); });
    });
  }

  /* 카드: 올린 카드가 넓어진다 */
  $$('.pk-cards').forEach(function(row){
    var cards = $$('.pk-card', row);
    cards.forEach(function(c){ ['mouseenter', 'focus'].forEach(function(ev){ c.addEventListener(ev, function(){ cards.forEach(function(x){ x.classList.toggle('is-open', x === c); }); }); }); });
  });

  /* 절차: 화면에 보이는 동안 5초마다 다음 단계로. 누르거나 마우스를 올리면 멈춘다 */
  $$('.pk-steps').forEach(function(list){
    var steps = $$('.pk-step', list), cur = 0, seen = false, holdUntil = 0;
    function setStep(i){
      cur = (i + steps.length) % steps.length;
      steps.forEach(function(s, j){ var on = j === cur; s.classList.toggle('on', on); s.querySelector('.pk-step-b').setAttribute('aria-expanded', on ? 'true' : 'false'); });
    }
    steps.forEach(function(s, j){ s.querySelector('.pk-step-b').addEventListener('click', function(){ setStep(j); holdUntil = Date.now() + 15000; }); });
    list.addEventListener('mouseenter', function(){ list.classList.add('hold'); });
    list.addEventListener('mouseleave', function(){ list.classList.remove('hold'); });
    watch(list, function(v){ seen = v; });
    setInterval(function(){ if (seen && !reduce && !document.hidden && !list.classList.contains('hold') && Date.now() > holdUntil) setStep(cur + 1); }, 5200);
  });

  /* 자주 묻는 질문: 누르면 펼친다 */
  $$('.pk-q').forEach(function(q){
    var b = q.querySelector('.pk-q-b');
    b.addEventListener('click', function(){ var on = q.classList.toggle('on'); b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  });

  /* 숫자가 올라간다 (처음 값은 이미 최종 값으로 보인다) */
  $$('[data-count]').forEach(function(el){
    var to = +el.getAttribute('data-count'), done = false; if (!(to > 0)) return;
    watch(el, function(v){ if (!v || done || reduce) return; done = true; var t0 = performance.now(); (function step(t){ var k = Math.min(1, (t - t0) / 1600), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('ko-KR'); if (k < 1) requestAnimationFrame(step); })(t0); }, {threshold: .6});
  });

  /* 숫자 구역 바탕: 데이터 점이 물결친다 */
  $$('.pk-dots').forEach(function(cv){
    if (!cv.getContext) return;
    var ctx = cv.getContext('2d'), w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), on = false, raf = 0;
    function size(){ w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function draw(t){
      ctx.clearRect(0, 0, w, h);
      var g = w < 700 ? 20 : 26;
      for (var y = g / 2; y < h; y += g) for (var x = g / 2; x < w; x += g){
        var v = Math.sin(x * .011 + y * .006 - t * .0011) * .5 + Math.sin(x * .004 - y * .013 + t * .0007) * .5;
        ctx.fillStyle = 'rgba(' + scanRgb + ',' + (.06 + Math.pow(Math.max(0, v), 3) * .55).toFixed(3) + ')';
        ctx.fillRect(x - .9, y - .9, 1.8, 1.8);
      }
    }
    function loop(t){ draw(t); if (on && !reduce) raf = requestAnimationFrame(loop); }
    size(); draw(0);
    addEventListener('resize', function(){ size(); draw(performance.now()); });
    watch(cv, function(v){ on = v; cancelAnimationFrame(raf); if (v) raf = requestAnimationFrame(loop); });
  });

  /* 사진 천천히 움직이기 (그림+글 구역) */
  var par = $$('.pk-feat-m.photo img');

  /* 첫 화면 3D: 아파트 단지 위로 확인 띠가 오르내리며, 지나간 자리에 이름표가 켜진다 */
  var hero = $('.pk-hero'), heroVisible = true, heroP = 0;
  (function(){
    var cv = hero && $('.pk-hero-3d', hero), tagsBox = hero && $('.pk-tags', hero);
    var T = window.THREE;
    if (!hero || !cv){ return; }
    if (!T){ hero.classList.add('no3d'); return; }
    var R;
    try { R = new T.WebGLRenderer({canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance'}); }
    catch (e){ hero.classList.add('no3d'); return; }
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    R.setClearColor(0x000000, 0);
    var SC = new T.Color(scanHex), scanInt = SC.getHex(), light = SC.clone().lerp(new T.Color(0xffffff), .65).getHex();
    var scene = new T.Scene(); scene.fog = new T.Fog(0x0b1628, 120, 280);
    var cam = new T.PerspectiveCamera(30, 1, .1, 500);
    scene.add(new T.HemisphereLight(0xb4dcff, 0x0a1424, 1.05));
    var sun = new T.DirectionalLight(0xffffff, .55); sun.position.set(40, 70, 30); scene.add(sun);
    var fill2 = new T.DirectionalLight(scanInt, .35); fill2.position.set(-50, 20, -30); scene.add(fill2);

    // 바닥과 격자 (설계도 느낌)
    var ground = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshStandardMaterial({color: 0x0c1728, roughness: 1}));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    var grid = new T.GridHelper(260, 104, 0x2b5486, 0x152842); grid.material.transparent = true; grid.material.opacity = .5; grid.position.y = .02; scene.add(grid);

    // 창문 텍스처: 층마다 4칸. 불 켜진 창은 몇 개만
    var seed = 7; function rnd(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function winTex(){
      var c = document.createElement('canvas'); c.width = 128; c.height = 256; var x = c.getContext('2d');
      x.fillStyle = '#18294a'; x.fillRect(0, 0, 128, 256);
      for (var r = 0; r < 16; r++) for (var k = 0; k < 4; k++){
        var lit = rnd() < .2;
        x.fillStyle = lit ? (rnd() < .55 ? 'rgba(255,212,150,.9)' : 'rgba(178,226,255,.85)') : 'rgba(44,72,110,.95)';
        x.fillRect(9 + k * 30, 5 + r * 16, 19, 8);
      }
      x.fillStyle = 'rgba(255,255,255,.05)'; for (var r2 = 0; r2 < 16; r2++) x.fillRect(0, r2 * 16 + 15, 128, 1);
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    }
    var roofMat = new T.MeshStandardMaterial({color: 0x22375a, roughness: .9});
    var edgeMat = new T.LineBasicMaterial({color: scanInt, transparent: true, opacity: .42});
    // [x, z, 폭, 높이, 깊이]
    var B = [[0, 0, 8, 34, 7], [-15, -8, 7, 25, 6.5], [14, -10, 7, 28, 6.5], [-10, 13, 6.5, 18, 6], [12, 12, 6.5, 21, 6], [-27, 3, 6.5, 15, 6], [27, 1, 6.5, 19, 6], [1, -26, 7, 23, 6.5], [-24, -20, 6, 12, 6], [26, -22, 6, 14, 6]];
    B.forEach(function(b){
      var w = b[2], h = b[3], d = b[4], geo = new T.BoxGeometry(w, h, d);
      function side(fw){ var t = winTex(); t.repeat.set(fw / 7.2, h / 16); return new T.MeshStandardMaterial({map: t, roughness: .75, metalness: .05, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .55}); }
      var m = new T.Mesh(geo, [side(d), side(d), roofMat, roofMat, side(w), side(w)]); m.position.set(b[0], h / 2, b[1]); scene.add(m);
      var e = new T.LineSegments(new T.EdgesGeometry(geo), edgeMat); e.position.copy(m.position); scene.add(e);
      var cap = new T.Mesh(new T.BoxGeometry(w * .34, 1.6, d * .4), roofMat); cap.position.set(b[0], h + .8, b[1]); scene.add(cap);
    });

    // 확인 띠: 가운데 동을 감싸는 빛의 고리가 오르내린다
    var main = B[0], mw = main[2] + 1.4, md = main[4] + 1.4, MH = main[3];
    var gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; var gx = gc.getContext('2d');
    var gr = gx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(' + scanRgb + ',0)'); gr.addColorStop(.82, 'rgba(' + scanRgb + ',.38)'); gr.addColorStop(.97, 'rgba(235,248,255,.95)'); gr.addColorStop(1, 'rgba(' + scanRgb + ',0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 4, 128);
    var sleeveGeo = new T.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true); sleeveGeo.rotateY(Math.PI / 4);
    var sleeve = new T.Mesh(sleeveGeo, new T.MeshBasicMaterial({map: new T.CanvasTexture(gc), transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending}));
    sleeve.scale.set(mw, 4.5, md); scene.add(sleeve);
    var ringPts = [[-mw / 2, -md / 2], [mw / 2, -md / 2], [mw / 2, md / 2], [-mw / 2, md / 2]].map(function(p){ return new T.Vector3(p[0], 0, p[1]); });
    var ring = new T.LineLoop(new T.BufferGeometry().setFromPoints(ringPts), new T.LineBasicMaterial({color: light, transparent: true, opacity: .95}));
    scene.add(ring);
    var beam = new T.Mesh(new T.PlaneGeometry(mw * 3.4, md * 3.4), new T.MeshBasicMaterial({color: scanInt, transparent: true, opacity: .05, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending}));
    beam.rotation.x = -Math.PI / 2; scene.add(beam);

    // 이름표 지점: 띠가 지나가면 점이 켜지고 이름이 잠깐 뜬다 (구성안에 적힌 이름만 쓴다)
    var LB = []; try { LB = JSON.parse(hero.getAttribute('data-pk-labels') || '[]'); } catch (e){}
    var PRE = hero.getAttribute('data-pk-prefix') || '';
    var SP = [[0, 5.5, -1.8], [1, 10, 2.1], [0, 14.5, 1.6], [1, 19, -1.9], [0, 24, -1.2], [1, 29, 1.4]];
    var spots = LB.slice(0, 6).map(function(lb, i){
      var p = SP[Math.round(i * (SP.length - 1) / Math.max(1, Math.min(6, LB.length) - 1))] || SP[i];
      var front = p[0] === 0, y = p[1], u = p[2];
      var pos = front ? new T.Vector3(main[0] + u, y, main[1] + main[4] / 2 + .06) : new T.Vector3(main[0] + main[2] / 2 + .06, y, main[1] + u);
      var nrm = front ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
      var dot = new T.Mesh(new T.CircleGeometry(.32, 20), new T.MeshBasicMaterial({color: scanInt, transparent: true, opacity: 0}));
      var halo = new T.Mesh(new T.RingGeometry(.5, .62, 32), new T.MeshBasicMaterial({color: scanInt, transparent: true, opacity: 0, side: T.DoubleSide}));
      [dot, halo].forEach(function(o){ o.position.copy(pos); o.lookAt(pos.clone().add(nrm)); scene.add(o); });
      var tag = document.createElement('div'); tag.className = 'pk-tag';
      var b = document.createElement('b'); b.textContent = (PRE ? PRE + ' ' : '') + ('0' + (i + 1)).slice(-2);
      var s = document.createElement('span'); s.textContent = lb.t || '';
      tag.appendChild(b); tag.appendChild(s);
      if (lb.n){ var sm = document.createElement('small'); sm.textContent = lb.n; tag.appendChild(sm); }
      if (tagsBox) tagsBox.appendChild(tag);
      return {pos: pos, nrm: nrm, y: y, dot: dot, halo: halo, tag: tag, at: -1};
    });

    var W = 0, H = 0, mob = false, mx = 0, my = 0, tx = 0, ty = 0;
    function size(){
      W = hero.clientWidth; H = hero.clientHeight; mob = W < 760;
      R.setSize(W, H, false); cam.aspect = W / H;
      // 넓은 화면에서는 단지를 오른쪽으로, 휴대폰에서는 위쪽으로 보낸다 (왼쪽·아래에 글이 있다)
      if (mob) cam.setViewOffset(W, H, 0, H * .16, W, H); else cam.setViewOffset(W, H, -W * .2, 0, W, H);
      cam.updateProjectionMatrix();
    }
    size(); addEventListener('resize', size);
    hero.addEventListener('pointermove', function(e){ var r = hero.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - .5; my = (e.clientY - r.top) / r.height - .5; });

    var v3 = new T.Vector3(), toCam = new T.Vector3(), t0 = performance.now(), CYCLE = 9000;
    function frame(now){
      var t = (now - t0) / 1000, ph = ((now - t0) % CYCLE) / CYCLE;
      tx += (mx - tx) * .04; ty += (my - ty) * .04;
      var a = .72 + t * .045 + tx * .35, rad = mob ? 150 : 132, hgt = 46 + ty * 8 + heroP * 26;
      cam.position.set(Math.sin(a) * rad, hgt, Math.cos(a) * rad);
      cam.lookAt(0, 10 + heroP * 6, 0);
      var k = Math.min(1, ph / .78), sy = .6 + (MH + 1.4) * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      sleeve.position.set(main[0], sy - 2.1, main[1]); ring.position.set(main[0], sy, main[1]); beam.position.set(main[0], sy, main[1]);
      var fade = ph > .9 ? 1 - (ph - .9) / .1 : 1; sleeve.material.opacity = fade; ring.material.opacity = .95 * fade; beam.material.opacity = .05 * fade;
      spots.forEach(function(s){
        if (ph < .02) s.at = -1;
        if (s.at < 0 && sy >= s.y) s.at = now;
        var on = s.at >= 0, age = on ? (now - s.at) / 1000 : 0;
        s.dot.material.opacity = on ? Math.min(1, age * 3) * fade : 0;
        var pulse = on ? (age % 1.6) / 1.6 : 0;
        s.halo.material.opacity = on ? (1 - pulse) * .8 * fade : 0; s.halo.scale.setScalar(1 + pulse * 1.6);
        // 이름표: 켜진 뒤 3.2초 동안, 그 면이 카메라를 향할 때만, 최근 세 개까지
        var show = on && age < 3.2 && fade > .5 && spots.filter(function(o){ return o.at > s.at; }).length < 3;
        if (show){ toCam.copy(cam.position).sub(s.pos); if (toCam.dot(s.nrm) <= 0) show = false; }
        if (show){
          v3.copy(s.pos).project(cam);
          var x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
          if (x < 40 || x > W - 40 || y < 70 || y > H - 40) show = false;
          else s.tag.style.transform = 'translate(' + (x + 18).toFixed(1) + 'px,' + (y - 18).toFixed(1) + 'px)';
        }
        s.tag.classList.toggle('on', show);
      });
      R.render(scene, cam);
    }
    var raf = 0;
    function loop(now){ frame(now); if (heroVisible && !reduce) raf = requestAnimationFrame(loop); }
    if (reduce){ t0 = performance.now() - CYCLE * .7; frame(performance.now()); }
    else raf = requestAnimationFrame(loop);
    watch(hero, function(v){ heroVisible = v; cancelAnimationFrame(raf); if (v && !reduce) raf = requestAnimationFrame(loop); });
  })();

  /* 스크롤: 첫 화면 시점 이동, 문장 채우기, 사진 움직이기, 떠 있는 문의 버튼 */
  var top = hero || $('.pk-ph'), fab = $('.pk-fab'), ticking = false;
  function onScroll(){
    ticking = false;
    if (top){ var r = top.getBoundingClientRect(); heroP = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))); if (fab) fab.classList.toggle('show', r.bottom < innerHeight * .4); }
    else if (fab) fab.classList.add('show');
    fill();
    if (!reduce) par.forEach(function(img){ var r = img.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; var p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; img.style.transform = 'translateY(' + (-6.5 + p * 9).toFixed(2) + '%)'; });
  }
  addEventListener('scroll', function(){ if (!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
  onScroll();
  });
})();
