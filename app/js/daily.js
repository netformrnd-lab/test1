// ============================================================
// 아파트스퀘어 — 시공사 일일보고 + AI 검토 항목 처리 (초안)
//  · 시공사(contractor): 내 현장 → 오늘 일일보고(필수 사진·메모) → 감리원 요청 항목에 회신
//  · 감리원(auditor):    단지 메뉴 → 시공사 일일보고 → AI/규칙 '검토 필요' 항목을
//                        [확인함 → 시공사에 통보/요청함 → 시공사 회신 → 재확인] 또는 [오경보] 로 처리
//  · 상태 변경은 전부 DB 함수 finding_act() 로 → 누가·언제 했는지 finding_events 에 자동 기록
//
// 이 파일은 supabase-app.js 보다 먼저 로드되며 '함수 정의'만 합니다.
// sb · escH · compressImage · zoomPhoto · appToast · currentApt · MY_ID · MY_NAME 은 호출 시점에 supabase-app.js 것을 씁니다.
// DB: backend/migration-daily-reports.sql  ·  AI: supabase/functions/aptsq-ai (task daily)
// ============================================================
(function () {
  const BUCKET = 'daily-photos'
  const MAX_PHOTOS = 15
  const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const E = (s) => (typeof escH === 'function' ? escH(s) : String(s == null ? '' : s))
  const $d = (id) => document.getElementById(id)
  const toast = (t) => { try { appToast(t, 2400) } catch (e) { alert(t) } }
  const md = (d) => String(d || '').slice(5, 10).replace('-', '.')
  const hm = (t) => { try { const d = new Date(t); return (d.getMonth() + 1) + '.' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') } catch (e) { return '' } }
  const missingTableMsg = (err) => /relation|table|schema|does not exist|function/i.test((err && err.message) || '')
    ? '일일보고 기능 준비 전이에요 — backend/migration-daily-reports.sql 실행이 필요해요.'
    : ('불러오지 못했어요: ' + ((err && err.message) || ''))

  // ---------- 공통: 서명 URL(비공개 버킷) ----------
  const SIGNED = {}
  async function signAll(paths) {
    const need = [...new Set(paths.filter(p => p && !SIGNED[p]))]
    for (let i = 0; i < need.length; i += 100) {
      const chunk = need.slice(i, i + 100)
      try {
        const { data } = await sb.storage.from(BUCKET).createSignedUrls(chunk, 3600)
        ;(data || []).forEach(x => { if (x && x.signedUrl && x.path) SIGNED[x.path] = x.signedUrl })
      } catch (e) {}
    }
    return SIGNED
  }
  window.dailyZoom = async function (path) {
    await signAll([path])
    if (SIGNED[path]) { try { zoomPhoto(SIGNED[path]) } catch (e) { window.open(SIGNED[path], '_blank') } }
  }
  function thumbHtml(p, size) {
    const s = size || 64
    const u = SIGNED[p.thumb_path || p.path] || ''
    const warn = p.stale_flag ? '<span style="position:absolute;left:3px;bottom:3px;background:#e4544b;color:#fff;font-size:8.5px;font-weight:800;padding:1px 4px;border-radius:4px">촬영일 다름</span>' : ''
    return `<div onclick="dailyZoom('${p.path}')" style="position:relative;width:${s}px;height:${s}px;border-radius:9px;overflow:hidden;background:#e9edf4 ${u ? `url('${u}') center/cover` : ''};cursor:pointer;flex-shrink:0" title="${E(p.shot_label || '')}">${warn}</div>`
  }

  // ---------- 사진 준비: EXIF · 해시 · 축소본 ----------
  let exifrP = null
  function loadExifr() {
    if (window.exifr) return Promise.resolve(window.exifr)
    if (exifrP) return exifrP
    exifrP = new Promise((res) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js'
      s.onload = () => res(window.exifr || null); s.onerror = () => res(null)
      document.head.appendChild(s)
      setTimeout(() => res(window.exifr || null), 5000)
    })
    return exifrP
  }
  async function readExif(file) {
    try {
      const ex = await loadExifr(); if (!ex) return {}
      const o = await ex.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'] }) || {}
      const t = o.DateTimeOriginal || o.CreateDate
      return {
        exif_taken_at: (t instanceof Date && !isNaN(t)) ? t.toISOString() : null,
        exif_lat: typeof o.latitude === 'number' ? o.latitude : null,
        exif_lng: typeof o.longitude === 'number' ? o.longitude : null,
        exif_device: [o.Make, o.Model].filter(Boolean).join(' ') || null
      }
    } catch (e) { return {} }
  }
  async function sha256(file) {
    try {
      const buf = await file.arrayBuffer()
      const h = await crypto.subtle.digest('SHA-256', buf)
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
    } catch (e) { return null }
  }
  async function shrink(file, max, q) {
    try { return await compressImage(file, { max, quality: q }) } catch (e) { return file }
  }

  // ============================================================
  // 시공사 홈 (sc1)
  // ============================================================
  const DC = { sites: [], site: null, photos: [], busy: false }
  window.loadContractorHome = async function () {
    const box = $d('dc-sites'), rec = $d('dc-recent'), hero = $d('dc-hero'), alertBox = $d('dc-alert'); if (!box) return
    const hi = $d('dc-hello')
    box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const { data, error } = await sb.from('apartment_contractors').select('apartment_id, apartments(id,name,method,region,progress_current,progress_total)').eq('contractor_id', MY_ID)
    if (error) { box.innerHTML = `<div style="padding:16px;color:#8b95ad;font-size:12px;line-height:1.7">${E(missingTableMsg(error))}</div>`; if (hi) hi.textContent = ''; return }
    DC.sites = (data || []).map(r => r.apartments).filter(Boolean)
    const who = (typeof MY_NAME !== 'undefined' && MY_NAME) ? MY_NAME + '님' : '현장소장님'
    if (!DC.sites.length) {
      if (hi) hi.textContent = who + ', 환영합니다'
      if (hero) hero.innerHTML = ''
      if (alertBox) alertBox.innerHTML = ''
      box.innerHTML = '<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:24px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.75"><div style="font-size:28px;margin-bottom:6px">🏗️</div>아직 배정된 현장이 없어요.<br>아파트스퀘어에서 현장을 배정하면 여기에 보여요.</div>'
      if (rec) rec.innerHTML = ''
      setReqBadge(0)
      return
    }
    const ids = DC.sites.map(s => s.id), today = kstToday()
    const [{ data: todays }, { data: reqs }, { data: mine }] = await Promise.all([
      sb.from('daily_reports').select('id,apartment_id').in('apartment_id', ids).eq('work_date', today).eq('author_id', MY_ID),
      sb.from('ai_findings').select('id,apartment_id,title').in('apartment_id', ids).eq('state', 'requested'),
      sb.from('daily_reports').select('id,apartment_id,work_date,worktype,location,required_missing,created_at').eq('author_id', MY_ID).order('created_at', { ascending: false }).limit(5)
    ])
    const cnt = (rows, id) => (rows || []).filter(r => r.apartment_id === id).length
    const doneSites = DC.sites.filter(s => cnt(todays, s.id)).length
    const reqN = (reqs || []).length
    setReqBadge(reqN)
    if (hi) hi.textContent = who + ', 오늘 작업 사진을 올려 주세요 · 현장 ' + DC.sites.length + '곳'
    // 상단 요약 카드
    const d = new Date(Date.now() + 9 * 3600 * 1000), wk = '일월화수목금토'[d.getUTCDay()]
    const allDone = doneSites === DC.sites.length
    if (hero) hero.innerHTML = `<div style="background:linear-gradient(150deg,#243768,#1F2C5C);border-radius:14px;padding:14px 15px;color:#fff;position:relative;overflow:hidden;box-shadow:0 10px 22px -14px rgba(31,44,92,.9)">
        <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:radial-gradient(circle,rgba(127,161,224,.35),transparent 65%)"></div>
        <div style="position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:10px">
          <div><div style="font-size:10.5px;color:#c3cee6;font-weight:700">${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wk}) 오늘 보고</div>
            <div style="font-size:21px;font-weight:800;margin-top:4px">${doneSites}<span style="font-size:13px;color:#c3cee6"> / ${DC.sites.length}곳 완료</span></div>
            <div style="font-size:10.5px;color:#c3cee6;font-weight:600;margin-top:3px">${allDone ? '오늘 보고를 모두 올렸어요 👍' : '필수 사진만 찍어서 올리면 30초면 끝나요'}</div></div>
          ${allDone ? '' : `<div data-ctab="write" style="cursor:pointer;flex-shrink:0;background:#fff;color:#1F2C5C;font-size:12px;font-weight:800;padding:9px 13px;border-radius:10px">📸 보고하기</div>`}
        </div>
        <div style="position:relative;height:5px;border-radius:9px;background:rgba(255,255,255,.18);margin-top:11px;overflow:hidden"><div style="width:${Math.round(doneSites / DC.sites.length * 100)}%;height:100%;background:#7fd1a8;border-radius:9px"></div></div>
      </div>`
    if (alertBox) alertBox.innerHTML = reqN ? `<div data-ctab="req" style="cursor:pointer;margin-top:12px;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #f3c4bf;border-radius:13px;padding:11px 13px">
        <div style="width:34px;height:34px;border-radius:10px;background:#fdecea;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📨</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:800;color:#c0392b">감리원 요청 ${reqN}건 · 회신이 필요해요</div><div style="font-size:10.5px;color:#8b95ad;font-weight:600;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E((reqs[0] || {}).title || '')}${reqN > 1 ? ' 외 ' + (reqN - 1) + '건' : ''}</div></div>
        <span style="font-size:18px;color:#c3ccdb">›</span></div>` : ''
    // 현장 카드 (감리원 '담당 단지' 카드와 같은 모양)
    box.innerHTML = DC.sites.map(s => {
      const t = cnt(todays, s.id), q = cnt(reqs, s.id)
      const stages = (window.methodStages && window.methodStages(s.method)) || null
      const tot = stages ? stages.length : (s.progress_total || 0), cur = Math.min(s.progress_current || 0, tot || 0)
      const pct = tot ? Math.round(cur / tot * 100) : 0
      const now = stages ? (cur >= tot ? '공사 완료' : '현재 ' + stages[cur]) : '공정 미등록'
      const sub = [s.region, (window.methodLabel && window.methodLabel(s.method)) || ''].filter(Boolean).join(' · ') || '공법 미등록'
      return `<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:11px 11px 10px">
        <div style="display:flex;gap:10px;align-items:center">
          <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(150deg,#d9a441,#b26a00);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">🏗️</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px"><span style="font-size:12.5px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(s.name)}</span>${q ? `<span style="font-size:8px;font-weight:800;color:#fff;background:#e4544b;padding:1px 6px;border-radius:99px;flex-shrink:0">요청 ${q}</span>` : ''}</div>
            <div style="font-size:9.5px;color:#8b95ad;font-weight:600;margin-top:1px">${E(sub)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px"><div style="flex:1;height:5px;border-radius:9px;background:#eef1f7;overflow:hidden"><div style="width:${pct}%;height:100%;background:#2F6BF6;border-radius:9px"></div></div><span style="font-size:9px;font-weight:800;color:#2F6BF6">${tot ? cur + '/' + tot : '-'}</span></div>
            <div style="font-size:9.5px;color:#5a6480;font-weight:700;margin-top:3px">${E(now)}</div>
          </div>
          <span style="align-self:flex-start;display:inline-flex;align-items:center;gap:3px;font-size:8.5px;font-weight:800;padding:3px 7px;border-radius:99px;flex-shrink:0;${t ? 'color:#1f8a5b;background:#e7f5ee' : 'color:#a5701a;background:#fbf1de'}"><span style="width:4px;height:4px;border-radius:99px;background:${t ? '#1f8a5b' : '#c98a25'}"></span>${t ? '오늘 제출' : '미제출'}</span>
        </div>
        <div style="display:flex;gap:7px;margin-top:10px">
          <div onclick="openDailyWrite('${s.id}')" style="flex:1;cursor:pointer;text-align:center;background:#1F2C5C;color:#fff;padding:10px 0;border-radius:10px;font-size:12px;font-weight:800">📸 ${t ? '추가 보고' : '일일보고 올리기'}</div>
          <div onclick="openDailyRequests('${s.id}')" style="flex:.8;cursor:pointer;text-align:center;background:${q ? '#fdecea' : '#f2f5fa'};color:${q ? '#c0392b' : '#5a6480'};padding:10px 0;border-radius:10px;font-size:12px;font-weight:800">📨 감리 요청${q ? ' ' + q : ''}</div>
        </div></div>`
    }).join('')
    if (rec) rec.innerHTML = (mine || []).length ? mine.map(recentRow).join('') : '<div style="color:#8b95ad;font-size:12px;padding:4px 2px">아직 올린 보고가 없어요.</div>'
  }
  function siteName(id) { return (DC.sites.find(s => s.id === id) || {}).name || '' }
  function recentRow(r) {
    const miss = (r.required_missing || []).length
    return `<div style="background:#fff;border:1px solid #eef1f7;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px">
      <div style="width:38px;text-align:center;flex-shrink:0"><div style="font-size:12px;font-weight:800;color:#2F6BF6">${md(r.work_date)}</div></div>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(r.worktype || '')}${r.location ? ' · ' + E(r.location) : ''}</div><div style="font-size:10px;color:#8b95ad;font-weight:600;margin-top:1px">${E(siteName(r.apartment_id))}${miss ? ' · <span style="color:#e4544b">필수 사진 ' + miss + '장 누락</span>' : ''}</div></div>
      <span style="font-size:9.5px;color:#1f8a5b;font-weight:800;background:#e7f5ee;padding:3px 7px;border-radius:99px;flex-shrink:0">제출됨</span></div>`
  }
  function setReqBadge(n) {
    document.querySelectorAll('.cnav-bd').forEach(b => { b.textContent = n > 9 ? '9+' : String(n); b.style.display = n ? 'block' : 'none' })
  }
  async function ensureSites() {
    if (DC.sites.length) return DC.sites
    const { data } = await sb.from('apartment_contractors').select('apartment_id, apartments(id,name,method,region,progress_current,progress_total)').eq('contractor_id', MY_ID)
    DC.sites = (data || []).map(r => r.apartments).filter(Boolean)
    return DC.sites
  }
  // 현장이 여러 곳이면 고르는 시트
  function pickSite(cb) {
    if (DC.sites.length === 1) { cb(DC.sites[0].id); return }
    if (!DC.sites.length) { toast('배정된 현장이 없어요'); return }
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,22,42,.45);display:flex;align-items:flex-end;justify-content:center'
    ov.innerHTML = `<div style="background:#fff;width:100%;max-width:520px;border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom))">
      <div style="font-size:14px;font-weight:800;color:#1c2440;margin-bottom:10px">어느 현장 보고인가요?</div>
      ${DC.sites.map(s => `<div data-pick="${s.id}" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 4px;border-top:1px solid #eef1f7"><span style="font-size:18px">🏗️</span><span style="flex:1;font-size:13px;font-weight:800;color:#1c2440">${E(s.name)}</span><span style="color:#c3ccdb;font-size:18px">›</span></div>`).join('')}
      <div data-pick="" style="cursor:pointer;text-align:center;margin-top:8px;padding:11px;border-radius:11px;background:#f2f5fa;font-size:12.5px;font-weight:800;color:#5a6480">닫기</div></div>`
    ov.addEventListener('click', (e) => { const el = e.target.closest('[data-pick]'); if (e.target === ov || el) { ov.remove(); if (el && el.dataset.pick) cb(el.dataset.pick) } })
    document.body.appendChild(ov)
  }
  // 시공사 하단 탭
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ctab]'); if (!t) return
    const k = t.dataset.ctab
    if (k === 'home') { window.showScreen('sc1'); window.loadContractorHome() }
    else if (k === 'write') { await ensureSites(); pickSite(id => window.openDailyWrite(id)) }
    else if (k === 'req') { await ensureSites(); window.openDailyRequests(null) }
    else if (k === 'log') { await ensureSites(); window.openDailyLog() }
  })

  // ---------- 보고 기록 (sc4) ----------
  window.openDailyLog = async function () {
    window.showScreen('sc4')
    const box = $d('dl-list'); box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const since = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 86400000).toISOString().slice(0, 10)
    const { data: reps, error } = await sb.from('daily_reports').select('*').eq('author_id', MY_ID).gte('work_date', since).order('work_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) { box.innerHTML = `<div style="padding:14px;color:#8b95ad;font-size:12px">${E(missingTableMsg(error))}</div>`; return }
    if (!(reps || []).length) { box.innerHTML = '<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">최근 30일 보고가 없어요.</div>'; return }
    const { data: ph } = await sb.from('daily_photos').select('id,report_id,path,thumb_path,shot_label,stale_flag').in('report_id', reps.map(r => r.id)).order('created_at')
    const by = {}; (ph || []).forEach(p => { (by[p.report_id] = by[p.report_id] || []).push(p) })
    await signAll((ph || []).map(p => p.thumb_path || p.path))
    let last = ''
    box.innerHTML = reps.map(r => {
      const head = r.work_date !== last ? `<div style="font-size:11px;font-weight:800;color:#8b95ad;margin:${last ? '6px' : '0'} 2px -4px">${md(r.work_date)}</div>` : ''
      last = r.work_date
      const ps = by[r.id] || [], miss = r.required_missing || []
      return head + `<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:12.5px;font-weight:800;color:#1c2440">${E(r.worktype || '')}${r.location ? ' · ' + E(r.location) : ''}</div><span style="font-size:9.5px;color:#1f8a5b;font-weight:800;background:#e7f5ee;padding:3px 7px;border-radius:99px;flex-shrink:0">제출됨</span></div>
        <div style="font-size:10px;color:#8b95ad;font-weight:600;margin-top:2px">${E(siteName(r.apartment_id))} · 사진 ${ps.length}장${miss.length ? ' · <span style="color:#e4544b">누락: ' + E(miss.join(', ')) + '</span>' : ''}</div>
        ${r.memo ? `<div style="font-size:11.5px;color:#333c54;font-weight:600;margin-top:6px">“${E(r.memo)}”</div>` : ''}
        ${ps.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + ps.map(p => thumbHtml(p, 54)).join('') + '</div>' : ''}
      </div>`
    }).join('')
  }

  // ---------- 일일보고 작성 (sc2) ----------
  window.openDailyWrite = function (aptId) {
    const s = DC.sites.find(x => x.id === aptId); if (!s) return
    DC.site = s; DC.photos = []
    $d('dw-apt').textContent = s.name
    $d('dw-date').value = kstToday()
    $d('dw-loc').value = ''; $d('dw-memo').value = ''; $d('dw-msg').textContent = ''
    const stages = (window.methodStages && window.methodStages(s.method)) || []
    const all = stages.length ? stages : [...new Set(Object.values(window.STAGE_SETS || {}).flatMap(x => x.stages))]
    const last = (() => { try { return localStorage.getItem('aptsq_dw_type_' + aptId) || '' } catch (e) { return '' } })()
    $d('dw-type').innerHTML = '<option value="">공종 선택</option>' + all.map(t => `<option ${t === last ? 'selected' : ''}>${E(t)}</option>`).join('') + '<option>기타</option>'
    dwRenderGrid()
    window.showScreen('sc2')
  }
  // 올릴 사진 미리보기: 눌러서 크게 보기, × 로 빼기, 마지막 칸 '+ 더 넣기'
  function dwRenderGrid() {
    const n = DC.photos.length
    const c = $d('dw-count'); if (c) c.textContent = n ? '사진 ' + n + '장' + (n > MAX_PHOTOS ? ' · 최대 ' + MAX_PHOTOS + '장' : '') : ''
    $d('dw-grid').innerHTML = DC.photos.map((x, i) => `<div style="position:relative;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#e9edf4 url('${x.url}') center/cover" onclick="dwZoom(${i})">
        <span onclick="event.stopPropagation();dwDel(${i})" style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:rgba(20,29,52,.75);color:#fff;font-size:15px;line-height:26px;text-align:center;cursor:pointer">×</span>
        <span style="position:absolute;left:4px;bottom:4px;background:rgba(20,29,52,.65);color:#fff;font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:6px">${i + 1}</span>
      </div>`).join('') + (n ? `<label style="aspect-ratio:1/1;border-radius:10px;border:1.5px dashed #c9d3e6;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;color:#4a5a80;font-size:11px;font-weight:800"><span style="font-size:20px">＋</span>더 넣기<input type="file" accept="image/*" multiple style="display:none" onchange="dwBulk(this.files)"></label>`
      : '<div style="grid-column:1/-1;background:#fff;border:1px dashed #d7deea;border-radius:12px;padding:22px 10px;text-align:center;color:#8b95ad;font-size:11.5px;font-weight:600">위 버튼으로 사진을 넣으면 여기서 잘 나왔는지 확인할 수 있어요</div>')
  }
  window.dwBulk = function (files) {
    const list = Array.from(files || []); if (!list.length) return
    list.forEach(f => DC.photos.push({ file: f, url: URL.createObjectURL(f) }))
    const el = $d('dw-bulk'); if (el) el.value = ''
    dwRenderGrid()
  }
  window.dwDel = function (i) { DC.photos.splice(i, 1); dwRenderGrid() }
  window.dwZoom = function (i) { const x = DC.photos[i]; if (x) { try { zoomPhoto(x.url) } catch (e) {} } }

  window.dwSubmit = async function () {
    if (DC.busy || !DC.site) return
    const msg = $d('dw-msg'); const say = (t, c) => { msg.textContent = t; msg.style.color = c || '#8b95ad' }
    const type = $d('dw-type').value
    if (!type) { say('공종을 선택해 주세요', '#e4544b'); return }
    const list = DC.photos.map(x => ({ file: x.file, slot: null, label: '현장 사진' }))
    if (list.length > MAX_PHOTOS) { say('사진은 한 번에 ' + MAX_PHOTOS + '장까지 올릴 수 있어요 (지금 ' + list.length + '장)', '#e4544b'); return }
    const missing = []
    if (!list.length && !confirm('사진 없이 제출할까요? (사진 없음으로 기록돼요)')) return

    DC.busy = true; const btn = $d('dw-submit'); btn.style.opacity = '.6'
    try {
      say('제출 중…')
      try { localStorage.setItem('aptsq_dw_type_' + DC.site.id, type) } catch (e) {}
      const { data: rep, error } = await sb.from('daily_reports').insert({
        apartment_id: DC.site.id, author_id: MY_ID, author_name: MY_NAME || null,
        work_date: $d('dw-date').value || kstToday(), worktype: type,
        location: $d('dw-loc').value.trim() || null, memo: $d('dw-memo').value.trim() || null,
        required_missing: missing
      }).select('id').single()
      if (error || !rep) { say(missingTableMsg(error), '#e4544b'); return }
      let ok = 0
      for (let i = 0; i < list.length; i++) {
        say('사진 올리는 중… (' + (i + 1) + '/' + list.length + ')')
        const it = list[i]
        const [ex, hash, main, thumb] = await Promise.all([readExif(it.file), sha256(it.file), shrink(it.file, 1280, 0.75), shrink(it.file, 400, 0.7)])
        const base = DC.site.id + '/' + rep.id + '/' + i + '_' + Date.now()
        const up1 = await sb.storage.from(BUCKET).upload(base + '.jpg', main, { contentType: main.type || 'image/jpeg', upsert: false })
        if (up1.error) continue
        const up2 = await sb.storage.from(BUCKET).upload(base + '_t.jpg', thumb, { contentType: thumb.type || 'image/jpeg', upsert: false })
        const ins = await sb.from('daily_photos').insert(Object.assign({
          report_id: rep.id, apartment_id: DC.site.id, path: base + '.jpg', thumb_path: up2.error ? null : base + '_t.jpg',
          shot_slot: it.slot, shot_label: it.label, sha256: hash, bytes: main.size || null
        }, ex))
        if (!ins.error) ok++
      }
      say('✅ 제출 완료! (사진 ' + ok + '장)', '#1f8a5b')
      // AI 검토는 서버에서 진행 — 기다리지 않음(결과는 감리원에게만 전달)
      try { sb.functions.invoke('aptsq-ai', { body: { task: 'daily', report_id: rep.id } }).catch(() => {}) } catch (e) {}
      try { logEvent('daily_submit', DC.site.id) } catch (e) {}
      toast('일일보고가 제출됐어요 👍')
      setTimeout(() => { window.showScreen('sc1'); window.loadContractorHome() }, 900)
    } finally { DC.busy = false; btn.style.opacity = '1' }
  }

  // ---------- 요청받은 항목 + 회신 (sc3) ----------
  const STATE = {
    open: ['검토 필요', '#c0392b', '#fdecea'], acknowledged: ['감리원 확인함', '#2456c9', '#eef4ff'],
    requested: ['시공사 회신 대기', '#b26a00', '#fff3d9'], replied: ['시공사 회신함', '#6b4fd8', '#f1edff'],
    rechecked: ['재확인 완료', '#1f8a5b', '#e7f7ef'], false_alarm: ['오경보로 종결', '#5a6480', '#eef1f7']
  }
  const ACT = { acknowledge: '확인함', request: '시공사에 통보/요청함', reply: '시공사 회신', recheck: '재확인함', false_alarm: '오경보로 닫음', reopen: '다시 엶', escalate: '관리자 재알림' }
  const chip = (st) => { const s = STATE[st] || [st, '#5a6480', '#eef1f7']; return `<span style="font-size:10px;font-weight:800;color:${s[1]};background:${s[2]};padding:3px 8px;border-radius:99px;white-space:nowrap">${s[0]}</span>` }

  async function loadFindingBundle(findings) {
    const fids = findings.map(f => f.id)
    const pids = [...new Set(findings.flatMap(f => f.photo_ids || []))]
    const [{ data: ev }, { data: ph }] = await Promise.all([
      fids.length ? sb.from('finding_events').select('*').in('finding_id', fids).order('created_at') : Promise.resolve({ data: [] }),
      pids.length ? sb.from('daily_photos').select('id,path,thumb_path,shot_label,stale_flag').in('id', pids) : Promise.resolve({ data: [] })
    ])
    const evBy = {}; (ev || []).forEach(e => { (evBy[e.finding_id] = evBy[e.finding_id] || []).push(e) })
    const phBy = {}; (ph || []).forEach(p => { phBy[p.id] = p })
    const extra = (ev || []).flatMap(e => e.photo_paths || [])
    await signAll([...(ph || []).map(p => p.thumb_path || p.path), ...extra])
    return { evBy, phBy }
  }
  function eventsHtml(evs) {
    if (!evs || !evs.length) return ''
    return '<div style="border-top:1px dashed #e6eaf2;margin-top:9px;padding-top:8px;display:flex;flex-direction:column;gap:5px">' + evs.map(e =>
      `<div style="font-size:10.5px;color:#5c6580;font-weight:600;line-height:1.5"><b style="color:#1c2440">${E(ACT[e.action] || e.action)}</b> · ${E(e.actor_name || '')} · ${hm(e.created_at)}${e.note ? '<br><span style="color:#333c54">“' + E(e.note) + '”</span>' : ''}${(e.photo_paths || []).length ? '<div style="display:flex;gap:5px;margin-top:4px">' + e.photo_paths.map(p => thumbHtml({ path: p }, 46)).join('') + '</div>' : ''}</div>`
    ).join('') + '</div>'
  }

  let DQ_APT = null, DQ_FILTER = 'todo'
  window.dqFilter = function (f) { DQ_FILTER = f; window.openDailyRequests(DQ_APT) }
  // aptId 가 없으면 내 모든 현장의 요청을 모아서 보여줌
  window.openDailyRequests = async function (aptId) {
    DQ_APT = aptId || null
    if (!$d('sc3').classList.contains('active')) window.showScreen('sc3')
    const sub = $d('dq-apt')
    if (sub) sub.textContent = DQ_APT ? (siteName(DQ_APT) + ' · 감리원이 확인을 요청한 항목') : '감리원이 확인을 요청한 항목이에요. 조치 사진과 한 줄 회신을 보내 주세요.'
    const box = $d('dq-list'); box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const ids = DQ_APT ? [DQ_APT] : DC.sites.map(s => s.id)
    if (!ids.length) { box.innerHTML = '<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">배정된 현장이 없어요.</div>'; return }
    const { data, error } = await sb.from('ai_findings').select('*').in('apartment_id', ids).order('updated_at', { ascending: false }).limit(100)
    if (error) { box.innerHTML = `<div style="padding:14px;color:#8b95ad;font-size:12px">${E(missingTableMsg(error))}</div>`; return }
    const all = data || []
    const todoN = all.filter(f => f.state === 'requested').length
    if (!DQ_APT) setReqBadge(todoN)
    const fl = $d('dq-filter')
    if (fl) fl.innerHTML = [['todo', '회신 필요 ' + todoN], ['all', '전체 ' + all.length]].map(([k, l]) =>
      `<span onclick="dqFilter('${k}')" style="cursor:pointer;font-size:10.5px;font-weight:800;padding:5px 11px;border-radius:99px;${DQ_FILTER === k ? 'color:#fff;background:#2F6BF6' : 'color:#5a6480;background:#eef1f7'}">${l}</span>`).join('')
      + (DQ_APT && DC.sites.length > 1 ? `<span onclick="openDailyRequests(null)" style="cursor:pointer;margin-left:auto;font-size:10.5px;font-weight:800;color:#2F6BF6;padding:5px 2px">모든 현장 ›</span>` : '')
    const rows = DQ_FILTER === 'todo' ? all.filter(f => f.state === 'requested') : all
    if (!rows.length) { box.innerHTML = `<div style="background:#fff;border:1px solid #eef1f7;border-radius:13px;padding:24px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600"><div style="font-size:26px;margin-bottom:6px">👍</div>${DQ_FILTER === 'todo' ? '회신할 요청이 없어요.' : '감리원 요청 사항이 없어요.'}</div>`; return }
    const { evBy, phBy } = await loadFindingBundle(rows)
    box.innerHTML = rows.map(f => {
      const evs = evBy[f.id] || []
      const req = [...evs].reverse().find(e => e.action === 'request')
      const photos = (f.photo_ids || []).map(id => phBy[id]).filter(Boolean)
      const form = f.state === 'requested' ? `
        <div style="margin-top:10px;background:#f8fafd;border:1px solid #e6eaf2;border-radius:11px;padding:10px">
          <div style="font-size:11px;font-weight:800;color:#1c2440;margin-bottom:6px">회신하기</div>
          <input id="dq-note-${f.id}" class="dw-in" placeholder="예: 안전난간 재설치 완료했습니다">
          <label style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:7px;border:1.5px dashed #c9d3e6;background:#fff;border-radius:10px;padding:9px;font-size:11.5px;font-weight:800;color:#4a5a80;cursor:pointer">📎 조치 사진 첨부 <span id="dq-cnt-${f.id}" style="color:#2F6BF6"></span><input id="dq-file-${f.id}" type="file" accept="image/*" multiple style="display:none" onchange="document.getElementById('dq-cnt-${f.id}').textContent=this.files.length?this.files.length+'장':''"></label>
          <div onclick="dqReply('${f.id}',this)" style="margin-top:9px;cursor:pointer;text-align:center;background:#1F2C5C;color:#fff;padding:10px;border-radius:10px;font-size:12.5px;font-weight:800">회신 보내기</div>
        </div>` : ''
      return `<div style="background:#fff;border:1px solid ${f.state === 'requested' ? '#f3c4bf' : '#eef1f7'};border-radius:13px;padding:12px 13px">
        ${DQ_APT ? '' : `<div style="font-size:10px;font-weight:800;color:#8b95ad;margin-bottom:4px">🏗️ ${E(siteName(f.apartment_id))}</div>`}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:13px;font-weight:800;color:#1c2440">${E(f.title)}</div>${f.state === 'requested' ? '<span style="font-size:10px;font-weight:800;color:#c0392b;background:#fdecea;padding:3px 8px;border-radius:99px;white-space:nowrap">회신 필요</span>' : f.state === 'replied' ? '<span style="font-size:10px;font-weight:800;color:#6b4fd8;background:#f1edff;padding:3px 8px;border-radius:99px;white-space:nowrap">회신 완료 · 감리원 확인 중</span>' : chip(f.state)}</div>
        ${req && req.note ? `<div style="font-size:11.5px;color:#333c54;font-weight:600;margin-top:7px;line-height:1.6;background:#f6f8fb;border-radius:9px;padding:8px 10px">📨 <b>감리원</b> · ${E(req.note)}</div>` : ''}
        ${photos.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + photos.map(p => thumbHtml(p, 58)).join('') + '</div>' : ''}
        ${form}${eventsHtml(evs)}</div>`
    }).join('')
  }
  window.dqReply = async function (fid, btn) {
    const note = ($d('dq-note-' + fid).value || '').trim()
    const files = Array.from(($d('dq-file-' + fid) || {}).files || [])
    if (!note && !files.length) { toast('회신 내용이나 조치 사진을 넣어 주세요'); return }
    btn.style.opacity = '.6'; btn.textContent = '보내는 중…'
    const paths = []
    for (let i = 0; i < files.length; i++) {
      const f = await shrink(files[i], 1280, 0.75)
      const p = DQ_APT + '/reply/' + fid + '_' + Date.now() + '_' + i + '.jpg'
      const up = await sb.storage.from(BUCKET).upload(p, f, { contentType: f.type || 'image/jpeg', upsert: false })
      if (!up.error) paths.push(p)
    }
    const { error } = await sb.rpc('finding_act', { p_finding: fid, p_action: 'reply', p_note: note || null, p_photos: paths })
    if (error) { btn.style.opacity = '1'; btn.textContent = '회신 보내기'; toast('회신 실패: ' + error.message); return }
    toast('회신을 보냈어요. 감리원이 재확인해요.')
    window.openDailyRequests(DQ_APT)
  }

  // ============================================================
  // 감리원: 현장 일일보고 + 검토 항목 처리 (sa1)
  // ============================================================
  const DA = { tab: 'todo', more: {}, ftype: '', fissue: false, since: null, reports: [], ai: {}, photos: {}, findings: [], evBy: {}, phBy: {} }
  window.dailyMenuBadge = async function (aptId) {
    const b = $d('aud-daily-badge'); if (!b) return
    b.style.display = 'none'
    try {
      const { count } = await sb.from('ai_findings').select('id', { count: 'exact', head: true }).eq('apartment_id', aptId).in('state', ['open', 'replied'])
      if (count) { b.textContent = '검토 ' + count; b.style.display = 'inline-block' }
    } catch (e) {}
  }
  window.openDailyAuditor = async function () {
    if (!currentApt) return
    $d('da-apt').textContent = currentApt.name
    window.showScreen('sa1')
    try { logEvent('daily_auditor', currentApt.id) } catch (e) {}
    await daLoad()
  }
  window.daSetPeriod = function (v) { DA.period = v; daLoad() }
  async function daLoad() {
    const box = $d('da-list'); box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const aptId = currentApt.id
    const per = DA.period || 'visit'; const ps = $d('da-period'); if (ps) ps.value = per
    // 지난 방문(다녀옴 표시된 일정) 이후. 없으면 최근 14일
    let since = null
    if (per !== 'visit') since = 'x'
    else try {
      const { data: v } = await sb.from('schedules').select('done_at').eq('apartment_id', aptId).not('done_at', 'is', null).order('done_at', { ascending: false }).limit(1)
      if (v && v[0] && v[0].done_at) since = new Date(new Date(v[0].done_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    } catch (e) {}
    const fallback = new Date(Date.now() + 9 * 3600 * 1000 - 14 * 86400000).toISOString().slice(0, 10)
    if (per !== 'visit') {
      DA.since = new Date(Date.now() + 9 * 3600 * 1000 - (Number(per) - 1) * 86400000).toISOString().slice(0, 10)
      $d('da-range').textContent = DA.since.slice(5).replace('-', '.') + ' 이후'
    } else {
      DA.since = since || fallback
      $d('da-range').textContent = since ? (since.slice(5).replace('-', '.') + ' 방문 이후') : '방문 기록 없음 · 최근 14일'
    }
    const { data: reps, error } = await sb.from('daily_reports').select('*').eq('apartment_id', aptId).gte('work_date', DA.since).order('work_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) { box.innerHTML = `<div style="padding:14px;color:#8b95ad;font-size:12px">${E(missingTableMsg(error))}</div>`; return }
    DA.reports = reps || []
    const rids = DA.reports.map(r => r.id)
    const [{ data: ai }, { data: ph }, { data: fs }] = await Promise.all([
      rids.length ? sb.from('daily_ai').select('*').in('report_id', rids) : Promise.resolve({ data: [] }),
      rids.length ? sb.from('daily_photos').select('*').in('report_id', rids).order('created_at') : Promise.resolve({ data: [] }),
      // 처리 안 끝난 항목은 기간과 상관없이 모두
      sb.from('ai_findings').select('*').eq('apartment_id', aptId).order('created_at', { ascending: false }).limit(200)
    ])
    DA.ai = {}; (ai || []).forEach(a => { DA.ai[a.report_id] = a })
    DA.photos = {}; (ph || []).forEach(p => { (DA.photos[p.report_id] = DA.photos[p.report_id] || []).push(p) })
    DA.findings = (fs || []).filter(f => rids.includes(f.report_id) || !['rechecked', 'false_alarm'].includes(f.state) || (!f.report_id && String(f.created_at).slice(0, 10) >= DA.since))
    const b = await loadFindingBundle(DA.findings); DA.evBy = b.evBy; DA.phBy = b.phBy
    await signAll((ph || []).map(p => p.thumb_path || p.path))
    daRender()
  }
  window.daTab = function (t) { DA.tab = t; daRender() }
  window.daFilt = function (k, v) { if (k === 'issue') DA.fissue = !DA.fissue; else DA.ftype = v || ''; daRender() }
  // 감리원이 직접 요청 (AI 없이도): 보고를 지정하면 근거 사진을 고를 수 있음
  window.daReqSheet = async function (rid) {
    const r = rid ? DA.reports.find(x => x.id === rid) : null, ps = r ? (DA.photos[r.id] || []) : []
    if (ps.length) await signAll(ps.map(p => p.thumb_path || p.path))
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,22,42,.45);display:flex;align-items:flex-end;justify-content:center'
    ov.innerHTML = `<div style="background:#fff;width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom))">
      <div style="font-size:14px;font-weight:800;color:#1c2440">📨 시공사에 요청</div>
      <div style="font-size:11px;color:#8b95ad;font-weight:600;margin:3px 0 12px">${r ? md(r.work_date) + ' · ' + E(r.worktype || '') + ' ' + E(r.location || '') : E(currentApt.name) + ' · 보고와 상관없이 현장에 보내는 요청'}</div>
      <div class="dw-lb">분류</div>
      <select id="rq-cat" class="dw-in"><option>안전</option><option>공정·품질</option><option>기록</option><option>기타</option></select>
      <div class="dw-lb" style="margin-top:10px">요청 제목 *</div>
      <input id="rq-title" class="dw-in" placeholder="예: 103동 하부 통제 사진 보내주세요">
      <div class="dw-lb" style="margin-top:10px">요청 내용</div>
      <textarea id="rq-note" class="dw-in" rows="3" style="resize:vertical" placeholder="예: 달비계 작업 구간 하부 출입통제 설치 사진을 회신해 주세요."></textarea>
      ${ps.length ? `<div class="dw-lb" style="margin-top:10px">근거 사진 (선택)</div><div style="display:flex;gap:6px;flex-wrap:wrap">${ps.map(p => `<label style="position:relative;width:62px;height:62px;border-radius:9px;overflow:hidden;background:#eef1f7 url('${SIGNED[p.thumb_path || p.path] || ''}') center/cover"><input type="checkbox" class="rq-ph" value="${p.id}" style="position:absolute;top:4px;left:4px;width:18px;height:18px"></label>`).join('')}</div>` : ''}
      <div id="rq-msg" style="font-size:11.5px;font-weight:800;color:#e4544b;min-height:15px;margin-top:10px"></div>
      <div style="display:flex;gap:8px;margin-top:6px"><div data-x style="flex:1;cursor:pointer;text-align:center;padding:12px;border-radius:11px;background:#f2f5fa;font-size:13px;font-weight:800;color:#5a6480">취소</div><div data-send style="flex:2;cursor:pointer;text-align:center;padding:12px;border-radius:11px;background:#1F2C5C;font-size:13px;font-weight:800;color:#fff">요청 보내기</div></div>
    </div>`
    ov.addEventListener('click', async (e) => {
      if (e.target === ov || e.target.closest('[data-x]')) { ov.remove(); return }
      if (!e.target.closest('[data-send]')) return
      const title = (ov.querySelector('#rq-title').value || '').trim()
      if (!title) { ov.querySelector('#rq-msg').textContent = '요청 제목을 입력해 주세요'; return }
      const photos = [...ov.querySelectorAll('.rq-ph:checked')].map(x => x.value)
      const { error } = await sb.rpc('finding_create', { p_apt: currentApt.id, p_report: r ? r.id : null, p_title: title, p_note: (ov.querySelector('#rq-note').value || '').trim() || null, p_photo_ids: photos, p_category: ov.querySelector('#rq-cat').value })
      if (error) { ov.querySelector('#rq-msg').textContent = /function|does not exist/i.test(error.message) ? '요청 기능 준비 전 — 최신 SQL 실행 필요' : ('요청 실패: ' + error.message); return }
      ov.remove(); toast('시공사에게 요청을 보냈어요'); DA.tab = 'wait'; await daLoad()
    })
    document.body.appendChild(ov)
  }
  function findingCard(f) {
    const evs = DA.evBy[f.id] || []
    const photos = (f.photo_ids || []).map(id => DA.phBy[id]).filter(Boolean)
    const btn = (a, label, c) => `<span onclick="daAct('${f.id}','${a}')" style="cursor:pointer;font-size:11px;font-weight:800;color:${c || '#2456c9'};background:#fff;border:1px solid #d7deea;padding:6px 9px;border-radius:8px;white-space:nowrap">${label}</span>`
    const acts = {
      open: [btn('acknowledge', '확인함'), btn('false_alarm', '오경보', '#5a6480')],
      acknowledged: [btn('request', '시공사에 통보/요청'), btn('recheck', '재확인 완료', '#1f8a5b'), btn('false_alarm', '오경보', '#5a6480')],
      requested: ['<span style="font-size:11px;color:#b26a00;font-weight:700">시공사 회신 기다리는 중</span>'],
      replied: [btn('recheck', '재확인 완료', '#1f8a5b'), btn('request', '다시 요청')],
      rechecked: [btn('reopen', '다시 열기', '#5a6480')], false_alarm: [btn('reopen', '다시 열기', '#5a6480')]
    }[f.state] || []
    const src = f.source === 'rule' ? '자동 점검' : f.source === 'manual' ? '감리원 직접 요청' : 'AI'
    return `<div style="background:#fbfcfe;border:1px solid ${f.state === 'open' || f.state === 'replied' ? '#f3c4bf' : '#e6eaf2'};border-radius:12px;padding:10px 11px;margin-top:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:12.5px;font-weight:800;color:#1c2440">${E(f.title)}</div>${chip(f.state)}</div>
      <div style="font-size:10px;color:#8b95ad;font-weight:700;margin-top:2px">${src}${f.category ? ' · ' + E(f.category) : ''}${f.escalated_at ? ' · <span style="color:#e4544b">관리자 재알림됨</span>' : ''}</div>
      <div style="font-size:11.5px;color:#333c54;font-weight:600;margin-top:5px;line-height:1.6">${E(f.reason || '')}</div>
      ${photos.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">' + photos.map(p => thumbHtml(p, 54)).join('') + '</div>' : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">${acts.join('')}</div>
      ${eventsHtml(evs)}</div>`
  }
  function daRender() {
    const box = $d('da-list')
    const todo = DA.findings.filter(f => ['open', 'acknowledged', 'replied'].includes(f.state))
    const wait = DA.findings.filter(f => f.state === 'requested')
    $d('da-tabs').innerHTML = [['todo', '처리 ' + todo.length], ['wait', '회신 대기 ' + wait.length], ['all', '보고 ' + DA.reports.length]].map(([k, l]) =>
      `<span onclick="daTab('${k}')" style="cursor:pointer;font-size:11px;font-weight:800;padding:7px 10px;border-radius:99px;white-space:nowrap;${DA.tab === k ? 'background:#1F2C5C;color:#fff' : 'background:#fff;color:#5a6480;border:1px solid #e1e6ef'}">${l}</span>`).join('')
      + `<span onclick="daReqSheet(null)" style="cursor:pointer;margin-left:auto;font-size:11px;font-weight:800;padding:7px 10px;border-radius:99px;white-space:nowrap;background:#2F6BF6;color:#fff">＋ 요청</span>`
    if (DA.tab === 'todo' || DA.tab === 'wait') {
      const lst = DA.tab === 'todo' ? todo : wait
      box.innerHTML = lst.length ? lst.map(f => {
        const r = DA.reports.find(x => x.id === f.report_id)
        return `<div><div style="font-size:10.5px;color:#8b95ad;font-weight:700">${r ? md(r.work_date) + ' · ' + E(r.worktype || '') + ' · ' + E(r.location || '') : (f.report_id ? '' : '현장 요청 (보고와 별도)')}</div>${findingCard(f)}</div>`
      }).join('') : `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">${DA.tab === 'todo' ? '처리할 항목이 없어요 👍' : '시공사 회신을 기다리는 요청이 없어요'}</div>`
      return
    }
    // ── 일일보고 탭: 공종 필터 · 문제 있는 보고만 · 날짜 묶음 · 사진 접기
    const types = [...new Set(DA.reports.map(r => r.worktype).filter(Boolean))]
    const issue = (r) => (r.required_missing || []).length || (DA.photos[r.id] || []).some(p => p.stale_flag) || DA.findings.some(f => f.report_id === r.id && !['rechecked', 'false_alarm'].includes(f.state))
    const reps = DA.reports.filter(r => (!DA.ftype || r.worktype === DA.ftype) && (!DA.fissue || issue(r)))
    const chipS = (on) => `cursor:pointer;flex-shrink:0;font-size:10.5px;font-weight:800;padding:5px 10px;border-radius:99px;${on ? 'background:#2F6BF6;color:#fff' : 'background:#fff;color:#5a6480;border:1px solid #e1e6ef'}`
    const filt = `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:6px">
        <span onclick="daFilt('issue')" style="${chipS(DA.fissue)}">⚠ 문제만</span>
        <span onclick="daFilt('type','')" style="${chipS(!DA.ftype)}">전체 공종</span>
        ${types.map(t => `<span onclick="daFilt('type','${E(t).replace(/'/g, '')}')" style="${chipS(DA.ftype === t)}">${E(t)}</span>`).join('')}
      </div>`
    const general = DA.findings.filter(f => !f.report_id)
    const genHtml = general.length ? `<div style="font-size:11px;font-weight:800;color:#8b95ad;margin:2px 2px -2px">현장 요청 (보고와 별도)</div>${general.map(findingCard).join('')}` : ''
    if (!DA.reports.length) { box.innerHTML = genHtml + '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;margin-top:10px">이 기간에 올라온 일일보고가 없어요.</div>'; return }
    let lastDay = ''
    box.innerHTML = filt + genHtml + (reps.length ? '' : '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">조건에 맞는 보고가 없어요.</div>') + reps.map(r => {
      const dayHead = r.work_date !== lastDay ? `<div style="font-size:11.5px;font-weight:800;color:#1c2440;margin:${lastDay ? '8px' : '2px'} 2px -2px">${md(r.work_date)} <span style="color:#8b95ad;font-weight:700">· ${reps.filter(x => x.work_date === r.work_date).length}건</span></div>` : ''
      lastDay = r.work_date
      const ai = DA.ai[r.id], ph = DA.photos[r.id] || [], fs = DA.findings.filter(f => f.report_id === r.id)
      const sum = ai && ai.summary
      const waitLong = (r.ai_status === 'pending' || r.ai_status === 'running') && (Date.now() - new Date(r.created_at).getTime()) > 10 * 60000
      const badge = waitLong ? '<span style="font-size:10px;font-weight:800;color:#5a6480;background:#eef1f7;padding:3px 8px;border-radius:99px">AI 미연결 · 직접 확인</span>'
        : r.ai_status === 'pending' || r.ai_status === 'running' ? '<span style="font-size:10px;font-weight:800;color:#5a6480;background:#eef1f7;padding:3px 8px;border-radius:99px">AI 검토 중</span>'
        : r.ai_status === 'failed' ? '<span style="font-size:10px;font-weight:800;color:#c0392b;background:#fdecea;padding:3px 8px;border-radius:99px">AI 실패</span>'
          : sum === '검토 필요' ? '<span style="font-size:10px;font-weight:800;color:#c0392b;background:#fdecea;padding:3px 8px;border-radius:99px">검토 필요</span>'
            : sum === '판단 불가' ? '<span style="font-size:10px;font-weight:800;color:#b26a00;background:#fff3d9;padding:3px 8px;border-radius:99px">판단 불가</span>'
              : '<span style="font-size:10px;font-weight:800;color:#1f8a5b;background:#e7f7ef;padding:3px 8px;border-radius:99px">이상 징후 없음</span>'
      const miss = (r.required_missing || [])
      const skipped = ai && ai.result && ai.result.skipped
      return dayHead + `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:13px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:13px;font-weight:800;color:#1c2440">${E(r.worktype || '공종 미기재')}</div>${badge}</div>
        <div style="font-size:11px;color:#8b95ad;font-weight:600;margin-top:2px">${E(r.location || '부위 미기재')} · ${E(r.author_name || '시공사')} · 사진 ${ph.length}장${miss.length ? ' · <span style="color:#e4544b">필수 누락 ' + miss.length + '</span>' : ''}</div>
        ${r.memo ? `<div style="font-size:12px;color:#333c54;font-weight:600;margin-top:7px">“${E(r.memo)}”</div>` : ''}
        ${ph.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' + (DA.more[r.id] ? ph : ph.slice(0, 4)).map(p => thumbHtml(p, 58)).join('') + (ph.length > 4 && !DA.more[r.id] ? `<span onclick="DA.more['${r.id}']=1;daRender()" style="cursor:pointer;width:58px;height:58px;border-radius:9px;background:#eef4ff;color:#2F6BF6;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">+${ph.length - 4}</span>` : '') + '</div>' : ''}
        <div style="display:flex;gap:14px;margin-top:8px">${ph.length ? `<span onclick="daSaveReport('${r.id}',this)" style="cursor:pointer;font-size:11px;font-weight:800;color:#2F6BF6">⬇ 사진 저장 (${ph.length}장)</span>` : ''}<span onclick="daReqSheet('${r.id}')" style="cursor:pointer;font-size:11px;font-weight:800;color:#2F6BF6">＋ 이 보고로 요청</span></div>
        ${ai && ai.result && ai.result.note ? `<div style="font-size:11px;color:#5c6580;font-weight:600;margin-top:8px;background:#f6f8fb;border-radius:9px;padding:7px 9px">🤖 ${E(ai.result.note)} <span style="color:#aab2c4">(참고용 · 최종 판단은 감리원)</span></div>` : ''}
        ${skipped ? `<div style="font-size:10.5px;color:#b26a00;font-weight:700;margin-top:6px">AI 분석 생략: ${E(skipped)} — 사진 직접 확인 필요</div>` : ''}
        ${fs.map(findingCard).join('')}
        ${['failed', 'skipped', 'pending'].includes(r.ai_status) || (ai && ai.error) ? `<div onclick="daRerun('${r.id}',this)" style="cursor:pointer;margin-top:9px;font-size:11px;font-weight:800;color:#2456c9">↻ AI 다시 분석</div>` : ''}
      </div>`
    }).join('')
  }
  window.daAct = async function (fid, action) {
    const f = DA.findings.find(x => x.id === fid); if (!f) return
    let note = null
    if (action === 'request') { note = prompt('시공사에게 보낼 요청 내용', f.title + ' — 확인 후 조치 사진 회신 부탁드립니다.'); if (note === null) return }
    else if (action === 'false_alarm') { note = prompt('오경보로 닫을까요?\n사유를 적으면 AI가 배워서 다음엔 덜 틀려요.\n(예: 지상 1층 작업이라 안전대 불필요 / 그림자를 균열로 봄)', ''); if (note === null) return }
    else if (action === 'recheck') { note = prompt('재확인 메모(선택)', ''); if (note === null) return }
    else if (action === 'reopen') { if (!confirm('이 항목을 다시 열까요?')) return }
    const { error } = await sb.rpc('finding_act', { p_finding: fid, p_action: action, p_note: note, p_photos: [] })
    if (error) { toast('처리 실패: ' + error.message); return }
    toast(ACT[action] + ' ✔')
    await daLoad()
    try { window.dailyMenuBadge(currentApt.id) } catch (e) {}
  }
  // 사진 저장: 앱(네이티브)은 공유 시트(→ '이미지 저장'·카톡·드라이브), 웹은 zip 다운로드
  let jszipP = null
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip)
    if (jszipP) return jszipP
    jszipP = new Promise((res) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; sc.onload = () => res(window.JSZip || null); sc.onerror = () => res(null); document.head.appendChild(sc) })
    return jszipP
  }
  const fileSafe = (t) => String(t || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
  async function savePhotos(items, label, el) {
    items = items.filter(x => x && x.path); if (!items.length) { toast('저장할 사진이 없어요'); return }
    const t0 = el ? el.textContent : ''; const say = (t) => { if (el) el.textContent = t }
    try {
      await signAll(items.map(x => x.path))
      const blobs = []
      for (let i = 0; i < items.length; i++) {
        say('사진 받는 중 ' + (i + 1) + '/' + items.length)
        try { const r = await fetch(SIGNED[items[i].path]); if (r.ok) blobs.push({ name: items[i].name, blob: await r.blob() }) } catch (e) {}
      }
      if (!blobs.length) { toast('사진을 받지 못했어요'); return }
      const P = window.Capacitor && window.Capacitor.Plugins, FS = P && P.Filesystem, SH = P && P.Share
      if (FS && FS.writeFile && SH && SH.share) {
        const uris = []
        for (const b of blobs) {
          const data = await blobToBase64(b.blob)
          const w = await FS.writeFile({ path: 'aptsq_' + Date.now() + '_' + b.name, data, directory: 'CACHE' })
          uris.push((w && w.uri) || (await FS.getUri({ path: 'aptsq_' + b.name, directory: 'CACHE' })).uri)
        }
        try { await SH.share({ title: label, files: uris, dialogTitle: '사진 ' + uris.length + '장 저장·공유' }) } catch (e) {}
        return
      }
      try {
        const files = blobs.map(b => new File([b.blob], b.name, { type: b.blob.type || 'image/jpeg' }))
        if (navigator.canShare && navigator.canShare({ files }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files, title: label }); return }
      } catch (e) { if (e && e.name === 'AbortError') return }
      const JSZip = await loadJSZip()
      if (!JSZip) { blobs.forEach(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b.blob); a.download = b.name; a.click() }); return }
      say('압축 중…')
      const zip = new JSZip(); blobs.forEach(b => zip.file(b.name, b.blob))
      const z = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(z); a.download = fileSafe(label) + '.zip'; document.body.appendChild(a); a.click(); a.remove()
    } catch (e) { toast('저장 실패: ' + ((e && e.message) || e)) }
    finally { say(t0) }
  }
  function reportItems(r) {
    return (DA.photos[r.id] || []).map((p, i) => ({ path: p.path, name: r.work_date + '_' + fileSafe(r.worktype) + '_' + String(i + 1).padStart(2, '0') + '_' + fileSafe(p.shot_label || '사진') + '.jpg' }))
  }
  window.daSaveReport = function (rid, el) {
    const r = DA.reports.find(x => x.id === rid); if (!r) return
    savePhotos(reportItems(r), currentApt.name + '_' + r.work_date + '_시공사사진', el)
  }
  window.daSaveAll = function (el) {
    const items = DA.reports.flatMap(reportItems)
    if (items.length > 60 && !confirm('사진 ' + items.length + '장을 저장할까요? 시간이 조금 걸려요.')) return
    savePhotos(items, currentApt.name + '_시공사사진_' + (DA.since || ''), el)
  }
  window.daRerun = async function (rid, el) {
    if (el) el.textContent = '분석 중…'
    try {
      const { data, error } = await sb.functions.invoke('aptsq-ai', { body: { task: 'daily', report_id: rid, force: true } })
      if (error || (data && data.ok === false)) toast('AI 분석 실패: ' + ((data && data.error) || (error && error.message) || ''))
    } catch (e) { toast('AI 분석 실패') }
    await daLoad()
  }
  // 감리일지에 붙일 근거 문구 (시공자 작업내용은 감리가 창작하지 않고 '원문 수령·보관' 으로 기록)
  window.daCopyEvidence = async function () {
    if (!DA.reports.length) { toast('이 기간 일일보고가 없어요'); return }
    const rs = [...DA.reports].sort((a, b) => a.work_date.localeCompare(b.work_date))
    const nPh = rs.reduce((s, r) => s + (DA.photos[r.id] || []).length, 0)
    const fs = DA.findings.filter(f => rs.some(r => r.id === f.report_id))
    const closed = fs.filter(f => ['rechecked', 'false_alarm'].includes(f.state)).length
    const lines = []
    lines.push('[시공사 보고]')
    lines.push('시공자 제출 작업보고 원문 수령·보관함 (' + md(rs[0].work_date) + '~' + md(rs[rs.length - 1].work_date) + ', ' + rs.length + '건, 사진 ' + nPh + '장)')
    rs.forEach(r => {
      const miss = (r.required_missing || []).length
      lines.push('- ' + md(r.work_date) + ' ' + (r.worktype || '') + (r.location ? ' · ' + r.location : '') + ' (사진 ' + (DA.photos[r.id] || []).length + '장' + (miss ? ', 필수 사진 ' + miss + '장 미제출' : '') + ')')
    })
    if (fs.length) {
      lines.push('[감리 확인]')
      lines.push('제출 사진 검토 항목 ' + fs.length + '건을 확인함 (종결 ' + closed + '건, 진행 ' + (fs.length - closed) + '건)')
      const req = fs.filter(f => (DA.evBy[f.id] || []).some(e => e.action === 'request'))
      if (req.length) lines.push('시공자에게 확인 요청을 통보함 ' + req.length + '건')
    }
    const text = lines.join('\n')
    try { await navigator.clipboard.writeText(text); toast('감리일지 근거 문구를 복사했어요') }
    catch (e) { prompt('아래 문구를 복사하세요', text) }
  }
})()
