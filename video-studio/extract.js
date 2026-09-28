// 브랜드 자료실 파일 → 글자 추출 (브라우저에서 처리, 필요한 라이브러리는 그때그때 불러옴)
// 지원: PDF · PPTX · DOCX · XLSX/XLS/CSV · HWPX · HTML · TXT/MD/JSON/XML
// 미지원(옛 형식): PPT · DOC · HWP → PDF 로 저장해서 올리도록 안내
;(function () {
  const CDN = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    pdfCmaps: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',        // 한글 CID 글꼴 해석용
    pdfFonts: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  }
  const loading = {}
  function load(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName])
    loading[url] = loading[url] || new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error('라이브러리를 불러오지 못했습니다.')))
      s.onerror = () => reject(new Error('파일 해석 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'))
      document.head.appendChild(s)
    })
    return loading[url]
  }

  const ext = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''
  const clean = (t) => String(t || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const xmlText = (xml, tag) => {
    // <a:p> 문단 단위로 <a:t> 글자를 모은다 (PPTX/HWPX 공통)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const paras = [...doc.getElementsByTagNameNS('*', tag.p)]
    const lines = (paras.length ? paras : [doc.documentElement]).map((p) => [...p.getElementsByTagNameNS('*', tag.t)].map((t) => t.textContent).join(''))
    return lines.filter((l) => l.trim()).join('\n')
  }
  const byNumber = (re) => (a, b) => Number((a.match(re) || [])[1]) - Number((b.match(re) || [])[1])

  async function readText(file) {
    const buf = await file.arrayBuffer()
    let t = new TextDecoder('utf-8').decode(buf)
    if ((t.match(/�/g) || []).length > 5) { try { t = new TextDecoder('euc-kr').decode(buf) } catch (e) { /* utf-8 유지 */ } }
    return t
  }

  async function pdf(file) {
    const lib = await load(CDN.pdf, 'pdfjsLib')
    lib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker
    const doc = await lib.getDocument({ data: await file.arrayBuffer(), cMapUrl: CDN.pdfCmaps, cMapPacked: true, standardFontDataUrl: CDN.pdfFonts }).promise
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      let line = '', out = [], lastY = null
      for (const it of tc.items) {
        const y = it.transform ? Math.round(it.transform[5]) : null
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) { out.push(line); line = '' }
        line += it.str
        lastY = y
        if (it.hasEOL) { out.push(line); line = ''; lastY = null }
      }
      out.push(line)
      const txt = clean(out.join('\n'))
      if (txt) pages.push(`[${i}쪽]\n${txt}`)
    }
    const text = pages.join('\n\n')
    return { text, note: text.length < 30 ? '글자가 없는 PDF(스캔 이미지)입니다. 글자가 들어 있는 PDF 로 다시 저장하거나 본문을 붙여 넣어 주세요.' : `${doc.numPages}쪽` }
  }

  async function pptx(file) {
    const JSZip = await load(CDN.jszip, 'JSZip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber(/slide(\d+)\.xml/))
    const out = []
    for (const [i, n] of slides.entries()) {
      let t = xmlText(await zip.file(n).async('string'), { p: 'p', t: 't' })
      const note = zip.file(n.replace('slides/slide', 'notesSlides/notesSlide'))
      if (note) {
        const nt = xmlText(await note.async('string'), { p: 'p', t: 't' }).replace(/^\d+$/gm, '').trim()
        if (nt) t += `\n(발표자 노트) ${nt}`
      }
      if (t.trim()) out.push(`[슬라이드 ${i + 1}]\n${clean(t)}`)
    }
    return { text: out.join('\n\n'), note: `슬라이드 ${slides.length}장` }
  }

  async function docx(file) {
    const m = await load(CDN.mammoth, 'mammoth')
    const r = await m.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { text: clean(r.value), note: '' }
  }

  async function sheet(file) {
    const X = await load(CDN.xlsx, 'XLSX')
    const wb = X.read(await file.arrayBuffer(), { type: 'array' })
    const out = wb.SheetNames.map((n) => {
      const csv = X.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }).split('\n').filter((l) => l.replace(/,/g, '').trim()).join('\n')
      return csv ? `[시트: ${n}]\n${csv}` : ''
    }).filter(Boolean)
    return { text: out.join('\n\n'), note: `시트 ${wb.SheetNames.length}개` }
  }

  async function hwpx(file) {
    const JSZip = await load(CDN.jszip, 'JSZip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const secs = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort(byNumber(/section(\d+)\.xml/i))
    const out = []
    for (const n of secs) out.push(xmlText(await zip.file(n).async('string'), { p: 'p', t: 't' }))
    return { text: clean(out.join('\n\n')), note: '' }
  }

  async function html(file) {
    const src = (await readText(file)).replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)\b[^>]*>/gi, (m) => m + '\n')
    const doc = new DOMParser().parseFromString(src, 'text/html')
    doc.querySelectorAll('script,style,noscript,template,svg').forEach((e) => e.remove())
    const title = (doc.title || '').trim()
    return { text: clean((title ? title + '\n\n' : '') + (doc.body ? doc.body.textContent : '')), note: '' }
  }

  async function extract(file) {
    const e = ext(file.name)
    let r
    if (e === 'pdf') r = await pdf(file)
    else if (e === 'pptx') r = await pptx(file)
    else if (e === 'docx') r = await docx(file)
    else if (['xlsx', 'xls', 'csv'].includes(e)) r = await sheet(file)
    else if (e === 'hwpx') r = await hwpx(file)
    else if (['html', 'htm'].includes(e)) r = await html(file)
    else if (['txt', 'md', 'json', 'xml', 'rtf'].includes(e)) r = { text: clean(await readText(file)), note: '' }
    else if (['ppt', 'doc', 'hwp'].includes(e)) throw new Error(`옛 ${e.toUpperCase()} 형식은 글자를 뽑을 수 없습니다. 파일을 열어 PDF(또는 ${e === 'ppt' ? 'PPTX' : e === 'doc' ? 'DOCX' : 'HWPX'})로 저장한 뒤 올려 주세요.`)
    else throw new Error('지원하지 않는 파일 형식입니다.')
    if (!r.text || r.text.length < 30) throw new Error(r.note && r.text.length < 30 && e === 'pdf' ? r.note : '파일에서 글자를 찾지 못했습니다(30자 미만).')
    return r
  }

  window.StudioExtract = { extract, ext }
})()
