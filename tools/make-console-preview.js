// 콘솔 '편집용 미리보기' HTML 생성 — 로그인·Supabase 없이 더블클릭으로 열리는 단일 파일
// 사용법:  node tools/make-console-preview.js [출력파일]
//   기본 출력: docs/preview/console-preview.html
// 원본(app/console/index.html)은 건드리지 않습니다. 미리보기는 tools/mock-data.js 의 가짜 데이터로 그려지고,
// 저장 버튼을 눌러도 아무 데도 저장되지 않습니다(디자인·배치 실험 전용).
const fs = require('fs'); const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'app/console/index.html')
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/preview/console-preview.html'))
let html = fs.readFileSync(SRC, 'utf8')
const stages = fs.readFileSync(path.join(ROOT, 'app/js/stages.js'), 'utf8')
const mockSrc = fs.readFileSync(path.join(ROOT, 'tools/mock-data.js'), 'utf8')
// 1) 외부 스크립트 → 인라인/스텁
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"[^>]*><\/script>/,
  `<script>/* [미리보기] Supabase 스텁 — 네트워크 없이 빈 결과만 돌려줌 */
(function(){ const mk=()=>new Proxy(function(){},{get(t,k){ if(k==='then')return (res)=>res({data:null,error:null}); if(k==='data'||k==='error')return null; return mk(); },apply(){ return mk(); }}); window.supabase={createClient:()=>mk()}; })();</script>`)
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx[^"]*"[^>]*><\/script>/, '<script>window.XLSX={};</script>')
html = html.replace(/<script src="\.\.\/js\/stages\.js"[^>]*><\/script>/, '<script>/* [미리보기] stages.js 인라인 */\n' + stages + '\n</script>')
// 2) 폰트 (원본은 CSS에서 로컬 폰트 참조) → CDN Pretendard
html = html.replace('</head>', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">\n</head>')
// 3) 로드 후 가짜 데이터 주입 + 로그인 화면 건너뛰기 + 상단 안내 띠
const inject = `
<script>/* [미리보기] 가짜 데이터 주입 — 이 블록은 원본에 없음 */
(function(){
  const module={exports:{}}; ${mockSrc}
  const makeMock=module.exports;
  function boot(){
    try{
      const mock=makeMock();
      Object.keys(mock).forEach(k=>{ try{ eval(k+'=mock["'+k+'"]'); }catch(e){} });
      try{ PHASEB_OK={sales:true,roadmap:true,docs:true,csites:true}; }catch(e){}
      const lg=document.getElementById('login'), app=document.getElementById('app'); if(lg)lg.style.display='none'; if(app)app.style.display='';
      try{ renderAll(); }catch(e){ console.warn('renderAll',e); }
      try{ go('projects'); }catch(e){}
      const bar=document.createElement('div'); bar.id='previewBar';
      bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#17244d;color:#fff;font:600 12px/1.4 Pretendard,system-ui,sans-serif;padding:7px 14px;text-align:center;box-shadow:0 -4px 16px rgba(0,0,0,.2)';
      bar.innerHTML='🧪 <b>디자인 미리보기</b> · 가짜 데이터 · 저장되지 않음 · 원본은 app/console/index.html · <span style="opacity:.8">이 파일의 &lt;style&gt; 과 HTML을 고쳐 보며 배치를 실험하세요</span> <span style="margin-left:10px;cursor:pointer;opacity:.7" onclick="this.parentNode.remove()">닫기 ✕</span>';
      document.body.appendChild(bar);
    }catch(e){ console.error('[미리보기 부팅 실패]',e); }
  }
  if(document.readyState==='complete') setTimeout(boot,300); else window.addEventListener('load',()=>setTimeout(boot,300));
})();
</script>
</body>`
html = html.replace(/<\/body>\s*<\/html>\s*$/, inject + '\n</html>')
html = html.replace('<title>', '<title>[미리보기] ')
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, html)
console.log('→', OUT, Math.round(html.length / 1024) + ' KB')
