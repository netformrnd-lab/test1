// ============================================================
// 아파트스퀘어 — 시공사 일일보고 + AI 검토 항목 처리 (초안)
//  · 시공사(contractor): 내 현장 → 오늘 일일보고(필수 사진·메모) → 감리원 요청 항목에 회신
//  · 감리원(auditor):    단지 메뉴 → 시공사 일일보고 → AI/규칙 '검토 필요' 항목을
//                        [확인함 → 시공사에 통보/요청함 → 시공사 회신 → 재확인] 또는 [오경보] 로 처리
//  · 상태 변경은 전부 DB 함수 finding_act() 로 → 누가·언제 했는지 finding_events 에 자동 기록
//
// 이 파일은 supabase-app.js 보다 먼저 로드되며 '함수 정의'만 합니다.
// sb · escH · compressImage · zoomPhoto · appToast · currentApt · MY_ID · MY_NAME 은 호출 시점에 supabase-app.js 것을 씁니다.
// DB: backend/migration-daily-reports.sql  ·  AI: supabase/functions/daily-ai
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
  const DC = { sites: [], site: null, shots: {}, extras: [], busy: false }
  window.loadContractorHome = async function () {
    const box = $d('dc-sites'), rec = $d('dc-recent'); if (!box) return
    const hi = $d('dc-hello'); if (hi && typeof MY_NAME !== 'undefined' && MY_NAME) hi.textContent = MY_NAME + '님, 오늘 작업 사진을 올려 주세요. 30초면 끝나요.'
    box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const { data, error } = await sb.from('apartment_contractors').select('apartment_id, apartments(id,name,method)').eq('contractor_id', MY_ID)
    if (error) { box.innerHTML = `<div style="padding:16px;color:#8b95ad;font-size:12px;line-height:1.7">${E(missingTableMsg(error))}</div>`; return }
    DC.sites = (data || []).map(r => r.apartments).filter(Boolean)
    if (!DC.sites.length) {
      box.innerHTML = '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600;line-height:1.7">아직 배정된 현장이 없어요.<br>아파트스퀘어 관리자가 현장을 배정하면 여기에 보여요.</div>'
      if (rec) rec.innerHTML = ''
      return
    }
    const ids = DC.sites.map(s => s.id), today = kstToday()
    const [{ data: todays }, { data: reqs }, { data: mine }] = await Promise.all([
      sb.from('daily_reports').select('id,apartment_id').in('apartment_id', ids).eq('work_date', today).eq('author_id', MY_ID),
      sb.from('ai_findings').select('id,apartment_id').in('apartment_id', ids).eq('state', 'requested'),
      sb.from('daily_reports').select('id,apartment_id,work_date,worktype,location,required_missing,created_at').eq('author_id', MY_ID).order('created_at', { ascending: false }).limit(10)
    ])
    const cnt = (rows, id) => (rows || []).filter(r => r.apartment_id === id).length
    box.innerHTML = DC.sites.map(s => {
      const t = cnt(todays, s.id), q = cnt(reqs, s.id)
      return `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:15px;padding:14px;box-shadow:0 8px 18px -14px rgba(23,38,80,.4)">
        <div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:14.5px;font-weight:800;color:#1c2440">${E(s.name)}</div><span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;${t ? 'background:#e7f7ef;color:#1f8a5b' : 'background:#fff3d9;color:#b26a00'}">${t ? '오늘 ' + t + '건 제출' : '오늘 미제출'}</span></div>
        <div style="font-size:11px;color:#8b95ad;font-weight:600;margin-top:3px">${E((window.methodLabel && window.methodLabel(s.method)) || '공법 미등록')}</div>
        <div style="display:flex;gap:8px;margin-top:11px">
          <div onclick="openDailyWrite('${s.id}')" style="flex:1;cursor:pointer;text-align:center;background:#1F2C5C;color:#fff;padding:11px 0;border-radius:11px;font-size:12.5px;font-weight:800">📸 오늘 일일보고</div>
          <div onclick="openDailyRequests('${s.id}')" style="flex:1;cursor:pointer;text-align:center;background:${q ? '#fdecea' : '#eef1f7'};color:${q ? '#c0392b' : '#5a6480'};padding:11px 0;border-radius:11px;font-size:12.5px;font-weight:800">📨 요청 사항${q ? ' ' + q : ''}</div>
        </div></div>`
    }).join('')
    if (rec) {
      const nm = (id) => (DC.sites.find(s => s.id === id) || {}).name || ''
      rec.innerHTML = (mine || []).length ? mine.map(r => {
        const miss = (r.required_missing || []).length
        return `<div style="background:#fff;border:1px solid #eef1f7;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;font-weight:800;color:#2F6BF6;width:36px">${md(r.work_date)}</div>
          <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:800;color:#1c2440;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(r.worktype || '')} · ${E(r.location || '')}</div><div style="font-size:10.5px;color:#8b95ad;font-weight:600">${E(nm(r.apartment_id))}${miss ? ' · <span style="color:#e4544b">필수 사진 ' + miss + '장 누락</span>' : ''}</div></div>
          <span style="font-size:10px;color:#1f8a5b;font-weight:800">제출됨</span></div>`
      }).join('') : '<div style="color:#8b95ad;font-size:12px;padding:8px 2px">아직 제출한 보고가 없어요.</div>'
    }
  }

  // ---------- 일일보고 작성 (sc2) ----------
  window.openDailyWrite = function (aptId) {
    const s = DC.sites.find(x => x.id === aptId); if (!s) return
    DC.site = s; DC.shots = {}; DC.extras = []
    $d('dw-apt').textContent = s.name
    $d('dw-date').value = kstToday()
    $d('dw-loc').value = ''; $d('dw-memo').value = ''; $d('dw-msg').textContent = ''
    const stages = (window.methodStages && window.methodStages(s.method)) || []
    const all = stages.length ? stages : [...new Set(Object.values(window.STAGE_SETS || {}).flatMap(x => x.stages))]
    const last = (() => { try { return localStorage.getItem('aptsq_dw_type_' + aptId) || '' } catch (e) { return '' } })()
    $d('dw-type').innerHTML = '<option value="">공종 선택</option>' + all.map(t => `<option ${t === last ? 'selected' : ''}>${E(t)}</option>`).join('') + '<option>기타</option>'
    dwRenderShots(); dwRenderExtras()
    window.showScreen('sc2')
  }
  function dwRenderShots() {
    const type = $d('dw-type').value
    const shots = (window.dailyShots && window.dailyShots(type)) || []
    $d('dw-shots').innerHTML = shots.map(sh => {
      const f = DC.shots[sh.key]
      const bg = f ? `url('${f.url}') center/cover` : '#fff'
      return `<label style="position:relative;display:block;height:118px;border-radius:12px;border:1.5px ${f ? 'solid #2F6BF6' : 'dashed #c9d3e6'};background:${bg};cursor:pointer;overflow:hidden">
        <input type="file" accept="image/*" style="display:none" onchange="dwPickShot('${sh.key}','${E(sh.label).replace(/'/g, '')}',this.files)">
        <div style="position:absolute;left:0;right:0;bottom:0;background:${f ? 'rgba(20,29,52,.72)' : 'transparent'};color:${f ? '#fff' : '#4a5a80'};font-size:11px;font-weight:800;padding:7px 8px;line-height:1.35">${f ? '✔ ' : '＋ '}${E(sh.label)}</div>
      </label>`
    }).join('')
  }
  window.dwRenderShots = dwRenderShots
  window.dwPickShot = function (key, label, files) {
    const f = files && files[0]; if (!f) return
    DC.shots[key] = { file: f, label, url: URL.createObjectURL(f) }
    dwRenderShots()
  }
  function dwRenderExtras() {
    $d('dw-extra-list').innerHTML = DC.extras.map((x, i) => `<div style="position:relative;width:58px;height:58px;border-radius:9px;background:url('${x.url}') center/cover"><span onclick="dwDelExtra(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#1c2440;color:#fff;font-size:12px;line-height:20px;text-align:center;cursor:pointer">×</span></div>`).join('')
  }
  window.dwAddExtra = function (files) {
    Array.from(files || []).forEach(f => DC.extras.push({ file: f, url: URL.createObjectURL(f) }))
    const el = $d('dw-extra'); if (el) el.value = ''
    dwRenderExtras()
  }
  window.dwDelExtra = function (i) { DC.extras.splice(i, 1); dwRenderExtras() }

  window.dwSubmit = async function () {
    if (DC.busy || !DC.site) return
    const msg = $d('dw-msg'); const say = (t, c) => { msg.textContent = t; msg.style.color = c || '#8b95ad' }
    const type = $d('dw-type').value
    if (!type) { say('공종을 선택해 주세요', '#e4544b'); return }
    const shots = (window.dailyShots && window.dailyShots(type)) || []
    const list = []
    shots.forEach(sh => { const f = DC.shots[sh.key]; if (f) list.push({ file: f.file, slot: sh.key, label: sh.label }) })
    DC.extras.forEach(x => list.push({ file: x.file, slot: null, label: '추가 사진' }))
    if (list.length > MAX_PHOTOS) { say('사진은 한 번에 ' + MAX_PHOTOS + '장까지 올릴 수 있어요', '#e4544b'); return }
    const missing = shots.filter(sh => !DC.shots[sh.key]).map(sh => sh.label)
    if (!list.length && !confirm('사진 없이 제출할까요? (사진 없음으로 기록돼요)')) return
    if (list.length && missing.length && !confirm('필수 사진 ' + missing.length + '장이 비어 있어요.\n(' + missing.join(', ') + ')\n그대로 제출할까요? ‘사진 누락’으로 기록돼요.')) return

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
      try { sb.functions.invoke('daily-ai', { body: { report_id: rep.id } }).catch(() => {}) } catch (e) {}
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

  let DQ_APT = null
  window.openDailyRequests = async function (aptId) {
    DQ_APT = aptId
    const s = DC.sites.find(x => x.id === aptId); $d('dq-apt').textContent = s ? s.name : ''
    window.showScreen('sc3')
    const box = $d('dq-list'); box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const { data, error } = await sb.from('ai_findings').select('*').eq('apartment_id', aptId).order('updated_at', { ascending: false }).limit(50)
    if (error) { box.innerHTML = `<div style="padding:14px;color:#8b95ad;font-size:12px">${E(missingTableMsg(error))}</div>`; return }
    const rows = data || []
    if (!rows.length) { box.innerHTML = '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">감리원 요청 사항이 없어요 👍</div>'; return }
    const { evBy, phBy } = await loadFindingBundle(rows)
    box.innerHTML = rows.map(f => {
      const evs = evBy[f.id] || []
      const req = [...evs].reverse().find(e => e.action === 'request')
      const photos = (f.photo_ids || []).map(id => phBy[id]).filter(Boolean)
      const form = f.state === 'requested' ? `
        <div style="margin-top:10px;background:#f8fafd;border:1px solid #e6eaf2;border-radius:11px;padding:10px">
          <div style="font-size:11px;font-weight:800;color:#1c2440;margin-bottom:6px">회신하기</div>
          <input id="dq-note-${f.id}" class="dw-in" placeholder="예: 안전난간 재설치 완료했습니다">
          <label style="display:block;margin-top:7px;font-size:11.5px;font-weight:800;color:#4a5a80;cursor:pointer">📎 조치 사진 첨부 <span id="dq-cnt-${f.id}" style="color:#2F6BF6"></span><input id="dq-file-${f.id}" type="file" accept="image/*" multiple style="display:none" onchange="document.getElementById('dq-cnt-${f.id}').textContent=this.files.length?this.files.length+'장':''"></label>
          <div onclick="dqReply('${f.id}',this)" style="margin-top:9px;cursor:pointer;text-align:center;background:#1F2C5C;color:#fff;padding:10px;border-radius:10px;font-size:12.5px;font-weight:800">회신 보내기</div>
        </div>` : ''
      return `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:13px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:13.5px;font-weight:800;color:#1c2440">${E(f.title)}</div>${chip(f.state)}</div>
        ${req && req.note ? `<div style="font-size:12px;color:#333c54;font-weight:600;margin-top:6px;line-height:1.6">📨 감리원: ${E(req.note)}</div>` : ''}
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
  const DA = { tab: 'todo', since: null, reports: [], ai: {}, photos: {}, findings: [], evBy: {}, phBy: {} }
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
  async function daLoad() {
    const box = $d('da-list'); box.innerHTML = '<div style="padding:14px;color:#8b95ad;font-size:12px">불러오는 중…</div>'
    const aptId = currentApt.id
    // 지난 방문(다녀옴 표시된 일정) 이후. 없으면 최근 14일
    let since = null
    try {
      const { data: v } = await sb.from('schedules').select('done_at').eq('apartment_id', aptId).not('done_at', 'is', null).order('done_at', { ascending: false }).limit(1)
      if (v && v[0] && v[0].done_at) since = new Date(new Date(v[0].done_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    } catch (e) {}
    const fallback = new Date(Date.now() + 9 * 3600 * 1000 - 14 * 86400000).toISOString().slice(0, 10)
    DA.since = since || fallback
    $d('da-range').textContent = since ? ('지난 방문(' + since + ') 이후 일일보고') : '최근 14일 일일보고 (다녀온 방문 기록 없음)'
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
    DA.findings = (fs || []).filter(f => rids.includes(f.report_id) || !['rechecked', 'false_alarm'].includes(f.state))
    const b = await loadFindingBundle(DA.findings); DA.evBy = b.evBy; DA.phBy = b.phBy
    await signAll((ph || []).map(p => p.thumb_path || p.path))
    daRender()
  }
  window.daTab = function (t) { DA.tab = t; daRender() }
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
    const src = f.source === 'rule' ? '자동 점검' : 'AI'
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
    $d('da-tabs').innerHTML = [['todo', '처리할 항목 ' + todo.length], ['all', '일일보고 ' + DA.reports.length]].map(([k, l]) =>
      `<span onclick="daTab('${k}')" style="cursor:pointer;font-size:11.5px;font-weight:800;padding:7px 12px;border-radius:99px;${DA.tab === k ? 'background:#1F2C5C;color:#fff' : 'background:#fff;color:#5a6480;border:1px solid #e1e6ef'}">${l}</span>`).join('')
    if (DA.tab === 'todo') {
      box.innerHTML = todo.length ? todo.map(f => {
        const r = DA.reports.find(x => x.id === f.report_id)
        return `<div><div style="font-size:10.5px;color:#8b95ad;font-weight:700">${r ? md(r.work_date) + ' · ' + E(r.worktype || '') + ' · ' + E(r.location || '') : ''}</div>${findingCard(f)}</div>`
      }).join('') : '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">처리할 항목이 없어요 👍</div>'
      return
    }
    if (!DA.reports.length) { box.innerHTML = '<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:22px 14px;text-align:center;color:#8b95ad;font-size:12px;font-weight:600">이 기간에 올라온 일일보고가 없어요.</div>'; return }
    box.innerHTML = DA.reports.map(r => {
      const ai = DA.ai[r.id], ph = DA.photos[r.id] || [], fs = DA.findings.filter(f => f.report_id === r.id)
      const sum = ai && ai.summary
      const badge = r.ai_status === 'pending' || r.ai_status === 'running' ? '<span style="font-size:10px;font-weight:800;color:#5a6480;background:#eef1f7;padding:3px 8px;border-radius:99px">AI 검토 중</span>'
        : r.ai_status === 'failed' ? '<span style="font-size:10px;font-weight:800;color:#c0392b;background:#fdecea;padding:3px 8px;border-radius:99px">AI 실패</span>'
          : sum === '검토 필요' ? '<span style="font-size:10px;font-weight:800;color:#c0392b;background:#fdecea;padding:3px 8px;border-radius:99px">검토 필요</span>'
            : sum === '판단 불가' ? '<span style="font-size:10px;font-weight:800;color:#b26a00;background:#fff3d9;padding:3px 8px;border-radius:99px">판단 불가</span>'
              : '<span style="font-size:10px;font-weight:800;color:#1f8a5b;background:#e7f7ef;padding:3px 8px;border-radius:99px">이상 징후 없음</span>'
      const miss = (r.required_missing || [])
      const skipped = ai && ai.result && ai.result.skipped
      return `<div style="background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:13px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-size:13px;font-weight:800;color:#1c2440">${md(r.work_date)} · ${E(r.worktype || '')}</div>${badge}</div>
        <div style="font-size:11px;color:#8b95ad;font-weight:600;margin-top:2px">${E(r.location || '부위 미기재')} · ${E(r.author_name || '시공사')} · 사진 ${ph.length}장${miss.length ? ' · <span style="color:#e4544b">필수 누락 ' + miss.length + '</span>' : ''}</div>
        ${r.memo ? `<div style="font-size:12px;color:#333c54;font-weight:600;margin-top:7px">“${E(r.memo)}”</div>` : ''}
        ${ph.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' + ph.map(p => thumbHtml(p, 58)).join('') + '</div>' : ''}
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
    else if (action === 'false_alarm') { note = prompt('오경보로 닫을까요? 사유(선택)', ''); if (note === null) return }
    else if (action === 'recheck') { note = prompt('재확인 메모(선택)', ''); if (note === null) return }
    else if (action === 'reopen') { if (!confirm('이 항목을 다시 열까요?')) return }
    const { error } = await sb.rpc('finding_act', { p_finding: fid, p_action: action, p_note: note, p_photos: [] })
    if (error) { toast('처리 실패: ' + error.message); return }
    toast(ACT[action] + ' ✔')
    await daLoad()
    try { window.dailyMenuBadge(currentApt.id) } catch (e) {}
  }
  window.daRerun = async function (rid, el) {
    if (el) el.textContent = '분석 중…'
    try {
      const { data, error } = await sb.functions.invoke('daily-ai', { body: { report_id: rid, force: true } })
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
