// ⚠️ 자동 생성 파일 — 직접 고치지 말고 video-studio/ 원본을 고친 뒤 `node build.mjs` 를 다시 실행하세요.
// 이 파일 전체를 Cloudflare Worker 편집기에 붙여넣으면 화면 + API 가 함께 동작합니다.
const STATIC_FILES = {"index.html":"<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<title>아파트스퀘어 | 영상 제작 작업실</title>\n<meta name=\"description\" content=\"아파트스퀘어 자료 기반 대본, Claude·OpenAI 교차 검수, HeyGen 아바타 영상 제작 작업실\">\n<link rel=\"stylesheet\" href=\"studio.css\">\n</head>\n<body class=\"antialiased\">\n<main class=\"studio\">\n  <header class=\"masthead\">\n    <div class=\"brand\">\n      <span class=\"brand-mark\"><span></span></span>\n      <div><strong>아파트스퀘어</strong><small>VIDEO STUDIO</small></div>\n    </div>\n    <div class=\"header-right\">\n      <span class=\"tag\"><i data-icon=\"lock\" data-size=\"13\"></i>비공개 작업실</span>\n      <span class=\"edition\">조현식 이사 · AI 아바타</span>\n      <button type=\"button\" class=\"btn ghost sm\" id=\"logout-btn\" hidden>로그아웃</button>\n    </div>\n  </header>\n\n  <div class=\"workspace\">\n    <!-- 로그인 (관리자 전용) -->\n    <section class=\"panel login-card\" id=\"login-view\" hidden>\n      <h2>관리자 로그인</h2>\n      <p class=\"body-note\">영상 제작 작업실은 아파트스퀘어 관리자 계정만 사용할 수 있습니다.</p>\n      <div class=\"field\"><label for=\"li-id\">아이디 또는 이메일</label><input class=\"input\" id=\"li-id\" autocomplete=\"username\"></div>\n      <div class=\"field\"><label for=\"li-pw\">비밀번호</label><input class=\"input\" id=\"li-pw\" type=\"password\" autocomplete=\"current-password\"></div>\n      <button type=\"button\" class=\"btn\" id=\"login-btn\">로그인</button>\n      <p class=\"fineprint\" id=\"login-msg\" role=\"status\"></p>\n    </section>\n\n    <div id=\"studio-view\" hidden>\n      <div class=\"nav-row\">\n        <div role=\"tablist\" class=\"nav-tabs\" aria-label=\"작업실 메뉴\">\n          <button type=\"button\" role=\"tab\" data-slot=\"tabs-trigger\" data-tab=\"create\" data-state=\"active\"><i data-icon=\"film\"></i>영상 제작</button>\n          <button type=\"button\" role=\"tab\" data-slot=\"tabs-trigger\" data-tab=\"knowledge\" data-state=\"inactive\"><i data-icon=\"book\"></i>브랜드 자료실 <span class=\"count\" id=\"tab-src-count\">0</span></button>\n          <button type=\"button\" role=\"tab\" data-slot=\"tabs-trigger\" data-tab=\"history\" data-state=\"inactive\"><i data-icon=\"history\"></i>제작 이력</button>\n          <button type=\"button\" role=\"tab\" data-slot=\"tabs-trigger\" data-tab=\"settings\" data-state=\"inactive\"><i data-icon=\"settings\"></i>연결 설정</button>\n        </div>\n        <span class=\"nav-note\">APARTMENT MAINTENANCE · KNOWLEDGE TO VIDEO</span>\n      </div>\n\n      <div id=\"msg-area\"></div>\n\n      <!-- 01 영상 제작 -->\n      <div role=\"tabpanel\" data-panel=\"create\">\n        <section class=\"page-heading\">\n          <div>\n            <span class=\"eyebrow\">CONTENT PRODUCTION</span>\n            <h1>전문 지식을, 신뢰할 수 있는 영상으로.</h1>\n            <p>키워드와 시청자를 정하면, 자료 검색부터 이중 검수·아바타 영상 제작까지 이어집니다.</p>\n          </div>\n          <span class=\"heading-number\">01—04</span>\n        </section>\n        <div id=\"setup-banner\"></div>\n        <div class=\"production-grid\">\n          <section class=\"panel brief-panel\">\n            <div class=\"section-label\"><span>01</span><h2>이번 영상의 주제</h2><span class=\"tag\">매번 입력하는 항목</span></div>\n            <div class=\"field\">\n              <label for=\"keywords\">키워드</label>\n              <textarea class=\"textarea keyword-input\" id=\"keywords\" maxlength=\"1000\" placeholder=\"예: 외벽 재도장, 바탕면 처리, 감리가 필요한 이유\"></textarea>\n              <small>사실·수치는 승인된 아파트스퀘어 자료에서만 가져옵니다.</small>\n            </div>\n            <div class=\"topics\" id=\"topics\"></div>\n            <div class=\"field\">\n              <label for=\"audience\">시청 대상</label>\n              <select class=\"select\" id=\"audience\">\n                <option>입주자대표회의</option><option>관리사무소장</option><option>아파트 입주민</option><option>시공사 담당자</option>\n              </select>\n            </div>\n            <div class=\"form-grid\">\n              <div class=\"field\">\n                <label for=\"ratio\">화면 비율</label>\n                <select class=\"select\" id=\"ratio\"><option value=\"16:9\">가로형 16:9</option><option value=\"9:16\">세로형 9:16</option></select>\n              </div>\n              <div class=\"field\">\n                <label for=\"seconds\">목표 영상 길이</label>\n                <select class=\"select\" id=\"seconds\">\n                  <option value=\"30\">30초</option><option value=\"60\" selected>1분</option><option value=\"90\">1.5분</option>\n                  <option value=\"120\">2분</option><option value=\"180\">3분</option><option value=\"300\">5분</option>\n                </select>\n              </div>\n            </div>\n            <div class=\"presenter\">\n              <div class=\"presenter-icon\"><i data-icon=\"user\" data-size=\"24\"></i></div>\n              <div><strong>조현식 이사</strong><p>아파트스퀘어 전용 아바타</p></div>\n              <span class=\"tag\" id=\"presenter-tag\">본인·동의 확인 전</span>\n            </div>\n            <div id=\"readiness\"></div>\n            <button type=\"button\" class=\"btn create-button\" id=\"create-btn\" disabled></button>\n            <p class=\"fineprint\">실제 제작 시 각 서비스 사용료가 발생합니다. 목표 길이는 음성과 편집에 따라 달라질 수 있습니다. 자료 검색·검수 중에는 이 창을 열어 두세요.</p>\n          </section>\n          <aside class=\"pipeline-panel\">\n            <div class=\"pipeline-heading\"><span class=\"eyebrow\">QUALITY PIPELINE</span><h2>만들기 전에, 두 번 확인합니다.</h2></div>\n            <div id=\"pipeline-steps\"></div>\n            <div class=\"quality-rule\">\n              <i data-icon=\"shield\" data-size=\"20\"></i>\n              <p><strong>근거가 없으면, 만들지 않습니다.</strong><br>양쪽 검수 항목 90점 이상 · 중대 지적 0건<br>미통과 시 최대 2회 수정 후 자동 보류</p>\n            </div>\n            <p class=\"pipeline-foot\">검수 점수는 모델의 평가이며 사실 정확도나 완성 영상의 품질 보증이 아닙니다.</p>\n          </aside>\n        </div>\n        <section class=\"result-section\">\n          <div class=\"section-label\"><span>RESULT</span><h2>제작 결과</h2><span class=\"tag\" id=\"result-tag\" hidden></span></div>\n          <div id=\"result-body\"></div>\n        </section>\n      </div>\n\n      <!-- 02 브랜드 자료실 -->\n      <div role=\"tabpanel\" data-panel=\"knowledge\" hidden>\n        <section class=\"page-heading\">\n          <div>\n            <span class=\"eyebrow\">BRAND KNOWLEDGE</span>\n            <h1>아파트스퀘어가 말할 수 있는 근거.</h1>\n            <p>운영 초기에 자료를 등록하고 승인합니다. 이후 영상 제작에는 키워드·대상·비율·길이만 필요합니다.</p>\n          </div>\n        </section>\n        <div class=\"knowledge-grid\">\n          <section class=\"panel\">\n            <div class=\"section-label\"><i data-icon=\"book\" data-size=\"20\"></i><h2>근거 자료 등록</h2></div>\n            <div class=\"field\"><label for=\"source-title\">자료 제목</label><input class=\"input\" id=\"source-title\" maxlength=\"150\"></div>\n            <div class=\"field\"><label for=\"source-origin\">출처·작성일·버전</label><input class=\"input\" id=\"source-origin\" maxlength=\"500\" placeholder=\"예: 외벽 재도장 표준 시방서 · 2026-09 · 2차 개정\"></div>\n            <div class=\"field\"><label for=\"source-content\">자료 본문</label><textarea class=\"textarea source-input\" id=\"source-content\" maxlength=\"60000\" placeholder=\"검증된 자료의 본문을 그대로 붙여 넣어 주세요. 목표·계획과 실제 실적은 구분해 주세요.\"></textarea></div>\n            <label class=\"file-picker\"><i data-icon=\"upload\" data-size=\"16\"></i> TXT / MD 파일 불러오기<input type=\"file\" id=\"source-file\" accept=\".txt,.md,text/plain,text/markdown\"></label>\n            <p class=\"fineprint\">PDF·PPT·한글 문서는 본문을 복사해 등록해 주세요. 현재 파일 자동 추출은 TXT·MD만 지원합니다.</p>\n            <div class=\"check-row\"><input type=\"checkbox\" data-slot=\"checkbox\" id=\"source-approve\"><label for=\"source-approve\">최신 내용과 외부 영상 활용 가능 여부를 확인했습니다.</label></div>\n            <button type=\"button\" class=\"btn w-full\" id=\"source-save\" disabled>자료 저장</button>\n            <button type=\"button\" class=\"text-link\" id=\"source-sample\">기존 킥오프 자료 발췌 불러오기 <i data-icon=\"external\" data-size=\"14\"></i></button>\n          </section>\n          <section>\n            <div class=\"between mb-5\"><h2>등록 자료 <span class=\"muted\" id=\"src-count\">0</span></h2><span class=\"tag\" id=\"src-approved\">승인 0개</span></div>\n            <div id=\"sources-list\"></div>\n            <div class=\"learning-card\">\n              <i data-icon=\"sparkles\" data-size=\"20\"></i>\n              <h3>반복 제작을 통해 축적하는 것</h3>\n              <p>실제 생성 완료 <span id=\"learning-count\">0</span>건의 검수 통과 장면 수와 발화량을 다음 대본의 형식에 참고합니다. 새 사실은 원문 자료에서만 가져옵니다.</p>\n              <small>현재 방식은 자료 검색·제작 패턴 재사용입니다. 모델 자체의 재학습이나 자동 품질 향상을 보장하지 않습니다.</small>\n            </div>\n          </section>\n        </div>\n      </div>\n\n      <!-- 03 제작 이력 -->\n      <div role=\"tabpanel\" data-panel=\"history\" hidden>\n        <section class=\"page-heading\">\n          <div>\n            <span class=\"eyebrow\">PRODUCTION LOG</span>\n            <h1>무엇을 근거로, 어떻게 만들었는지.</h1>\n            <p>최근 50개 작업을 표시합니다. 창을 다시 열면 진행 중인 작업을 자동으로 이어갑니다.</p>\n          </div>\n          <button type=\"button\" class=\"btn outline\" data-refresh><i data-icon=\"refresh\"></i>새로고침</button>\n        </section>\n        <div id=\"history-body\"></div>\n      </div>\n\n      <!-- 04 연결 설정 -->\n      <div role=\"tabpanel\" data-panel=\"settings\" hidden>\n        <section class=\"page-heading\">\n          <div>\n            <span class=\"eyebrow\">CONNECTION SETTINGS</span>\n            <h1>API를 연결하고 기존 아바타를 선택하세요.</h1>\n            <p>최초 한 번 저장하면 다음 제작부터 같은 연결을 사용합니다.</p>\n          </div>\n        </section>\n        <div class=\"security-note\">\n          <i data-icon=\"key\" data-size=\"20\"></i>\n          <div>\n            <strong>API 키는 아래 입력란에 등록하세요.</strong>\n            <p>키는 서버에서 암호화해 저장하며 화면으로 다시 보내지 않습니다. 연결 확인은 계정·모델 조회만 하며 영상을 생성하지 않습니다.</p>\n          </div>\n        </div>\n        <div class=\"provider-grid\" id=\"provider-grid\"></div>\n        <section class=\"panel avatar-panel\">\n          <div class=\"between\">\n            <div>\n              <h2>HeyGen에 등록된 조현식 이사님 아바타</h2>\n              <p class=\"body-note\">기존 아바타를 그대로 사용합니다. 사진을 선택하면 등록된 기본 음성을 함께 가져옵니다.</p>\n            </div>\n            <button type=\"button\" class=\"btn\" id=\"avatar-load\" disabled>내 HeyGen 아바타 불러오기</button>\n          </div>\n          <p class=\"body-note\" id=\"avatar-need-key\">위에서 HeyGen API 키를 저장하면 목록을 불러올 수 있습니다.</p>\n          <p class=\"body-note\" id=\"avatar-empty\" hidden>이 API 계정에서 조회되는 개인 아바타가 없습니다. 아바타가 등록된 HeyGen 워크스페이스의 키인지 확인해 주세요.</p>\n          <div class=\"avatar-grid\" id=\"avatar-grid\"></div>\n          <button type=\"button\" class=\"btn outline\" id=\"avatar-more\" hidden>아바타 더 불러오기</button>\n          <p class=\"body-note\" id=\"avatar-selected\" hidden></p>\n          <div class=\"field\">\n            <label for=\"voice-id\">음성 ID</label>\n            <input class=\"input\" id=\"voice-id\">\n            <small>아바타의 기본 음성을 자동 입력합니다. 기본 음성이 없으면 HeyGen의 해당 음성 ID를 입력해 주세요.</small>\n          </div>\n          <div class=\"check-row\"><input type=\"checkbox\" data-slot=\"checkbox\" id=\"avatar-confirm\"><label for=\"avatar-confirm\">선택한 아바타·음성이 조현식 이사님 것이며 사용 권한이 있습니다.</label></div>\n          <div class=\"field\">\n            <label for=\"daily-limit\">하루 최대 제작 접수 건수 (UTC 기준)</label>\n            <input class=\"input\" id=\"daily-limit\" type=\"number\" min=\"1\" max=\"20\">\n          </div>\n          <button type=\"button\" class=\"btn\" id=\"settings-save\" disabled>아바타·음성 설정 저장</button>\n          <p role=\"status\" id=\"settings-ok\" hidden></p>\n          <p class=\"message error\" role=\"alert\" id=\"settings-err\" hidden></p>\n        </section>\n        <div class=\"boundary-note\">\n          <p>자료 검색·대본·검수 단계에서는 창을 열어 두세요. HeyGen 접수 후 렌더링은 창을 닫아도 계속됩니다. 완성 영상의 화면·발음·자막 품질 자동검증은 아직 제공되지 않습니다.</p>\n        </div>\n      </div>\n    </div>\n\n    <footer>\n      <span>아파트스퀘어 · 영상 제작 작업실</span>\n      <span>출처 중심 생성 / 독립 교차 검수 / 승인된 아바타</span>\n    </footer>\n  </div>\n</main>\n\n<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>\n<script src=\"config.js\"></script>\n<script src=\"studio.js\"></script>\n</body>\n</html>\n","studio.css":"/* 아파트스퀘어 영상 제작 작업실 — 원본(reelty-ai-video-studio) 디자인 보존 */\n/* Tailwind preflight 중 원본 화면에 영향을 주는 부분 */\n*, ::before, ::after { box-sizing: border-box; border: 0 solid; }\nh1, h2, h3, h4 { font-size: inherit; font-weight: inherit; }\nb, strong { font-weight: bolder; }\na { color: inherit; text-decoration: inherit; }\nol, ul { list-style: none; margin: 0; padding: 0; }\nblockquote, figure, p { margin: 0; }\nimg, video { display: block; max-width: 100%; }\nbutton { background: transparent; color: inherit; border-radius: 0; padding: 0; }\n:root {\n  --background: #f4f6f9;\n  --foreground: #14213d;\n  --card: #fff;\n  --card-foreground: #14213d;\n  --popover: #fff;\n  --popover-foreground: #14213d;\n  --primary: #ea3345;\n  --primary-foreground: #fff;\n  --secondary: #eef1f5;\n  --secondary-foreground: #14213d;\n  --muted: #eef1f5;\n  --muted-foreground: #64748b;\n  --accent: #eef1f5;\n  --accent-foreground: #14213d;\n  --destructive: #dc2626;\n  --border: #dfe5ec;\n  --input: #dfe5ec;\n  --ring: #ea3345;\n  --radius: 0.85rem;\n}\n* {\n  border-color: var(--border);\n}\nbody {\n  background: var(--background);\n  color: var(--foreground);\n  margin: 0;\n  font-family:\n    Arial,\n    Apple SD Gothic Neo,\n    Noto Sans KR,\n    sans-serif;\n}\nbutton,\ninput,\ntextarea {\n  font: inherit;\n}\n:root {\n  --background: #f5f6f8;\n  --foreground: #181c35;\n  --primary: #dc3042;\n  --ring: #dc3042;\n  --radius: 0.65rem;\n}\nbutton,\na,\nsummary {\n  -webkit-tap-highlight-color: transparent;\n}\nbutton:not(:disabled),\nsummary {\n  cursor: pointer;\n}\nbutton:disabled {\n  cursor: not-allowed;\n}\na {\n  text-underline-offset: 4px;\n}\nh1,\nh2,\nh3,\nh4,\np {\n  margin: 0;\n}\nsmall {\n  font-size: 13px;\n}\ninput,\ntextarea {\n  font-size: 16px !important;\n}\npre {\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  background: #f5f6f8;\n  border-radius: 8px;\n  max-height: 500px;\n  margin-top: 12px;\n  padding: 16px;\n  font-family: inherit;\n  font-size: 14px;\n  line-height: 1.8;\n  overflow: auto;\n}\n.studio {\n  min-height: 100vh;\n}\n.masthead {\n  background: #fff;\n  border-bottom: 1px solid #e1e3e9;\n  justify-content: space-between;\n  align-items: center;\n  height: 94px;\n  padding: 0 4.5vw;\n  display: flex;\n}\n.brand {\n  align-items: center;\n  gap: 13px;\n  display: flex;\n}\n.brand strong {\n  letter-spacing: -1px;\n  font-size: 23px;\n  display: block;\n}\n.brand small {\n  letter-spacing: 3px;\n  color: #737788;\n  margin-top: 1px;\n  font-size: 10px;\n  font-weight: 700;\n  display: block;\n}\n.brand-mark {\n  background: #dc3042;\n  place-items: center;\n  width: 40px;\n  height: 40px;\n  display: grid;\n}\n.brand-mark span {\n  border: 3px solid #fff;\n  border-right-width: 7px;\n  width: 22px;\n  height: 22px;\n}\n.header-right {\n  align-items: center;\n  gap: 22px;\n  display: flex;\n}\n.edition {\n  color: #6c7284;\n  font-size: 14px;\n}\n.workspace {\n  max-width: 1470px;\n  margin: 0 auto;\n  padding: 0 4.5vw;\n}\n.nav-row {\n  border-bottom: 1px solid #e0e3e9;\n  justify-content: space-between;\n  align-items: center;\n  gap: 20px;\n  min-height: 80px;\n  display: flex;\n}\n.nav-tabs {\n  flex-wrap: wrap;\n  gap: 8px;\n  background: 0 0 !important;\n  height: auto !important;\n  padding: 0 !important;\n}\n.nav-tabs [data-slot=\"tabs-trigger\"] {\n  color: #696d7c;\n  border-radius: 7px;\n  flex: none;\n  height: auto;\n  padding: 12px 17px;\n  font-size: 15px;\n  font-weight: 600;\n  box-shadow: none !important;\n}\n.nav-tabs [data-state=\"active\"] {\n  color: #fff !important;\n  background: #181c35 !important;\n}\n.nav-note {\n  letter-spacing: 1.5px;\n  color: #8d909e;\n  text-align: right;\n  font-size: 10px;\n}\n.count {\n  color: #505666;\n  background: #e8eaf0;\n  border-radius: 4px;\n  padding: 0 6px;\n  font-size: 12px;\n}\n.page-heading {\n  justify-content: space-between;\n  align-items: center;\n  gap: 20px;\n  padding: 40px 0 28px;\n  display: flex;\n}\n.eyebrow {\n  color: #a02436;\n  letter-spacing: 2px;\n  margin-bottom: 12px;\n  font-size: 11px;\n  font-weight: 700;\n  display: block;\n}\n.page-heading h1 {\n  letter-spacing: -1.3px;\n  font-size: clamp(24px, 2.4vw, 33px);\n  font-weight: 750;\n  line-height: 1.4;\n}\n.page-heading p {\n  color: #72778a;\n  margin-top: 9px;\n  font-size: 15px;\n  line-height: 1.8;\n}\n.heading-number {\n  letter-spacing: -2px;\n  color: #d0d3dd;\n  white-space: nowrap;\n  font-size: 43px;\n  font-weight: 300;\n}\n.setup-banner {\n  background: #fff;\n  border: 1px solid #e4d3d7;\n  border-left: 3px solid #d82b40;\n  border-radius: 5px;\n  justify-content: space-between;\n  align-items: center;\n  gap: 18px;\n  margin-bottom: 23px;\n  padding: 17px 21px;\n  display: flex;\n}\n.setup-banner > div {\n  align-items: center;\n  gap: 14px;\n  display: flex;\n}\n.setup-banner svg {\n  color: #c92f42;\n  flex-shrink: 0;\n}\n.setup-banner strong {\n  font-size: 14px;\n}\n.setup-banner p {\n  color: #767987;\n  margin-top: 4px;\n  font-size: 13px;\n}\n.production-grid {\n  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 1fr);\n  align-items: start;\n  gap: 25px;\n  display: grid;\n}\n.panel {\n  background: #fff;\n  border: 1px solid #e1e4eb;\n  border-radius: 10px;\n  padding: 28px;\n}\n.brief-panel {\n  padding: 31px;\n}\n.section-label {\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 12px;\n  margin-bottom: 25px;\n  display: flex;\n}\n.section-label > span:first-child:not(.tag) {\n  color: #b32237;\n  letter-spacing: 1.4px;\n  font-size: 12px;\n  font-weight: 700;\n}\n.section-label h2 {\n  letter-spacing: -0.6px;\n  font-size: 18px;\n  font-weight: 700;\n}\n.section-label > .tag {\n  margin-left: auto;\n}\n.tag {\n  white-space: normal;\n  color: #696f80;\n  background: #eef0f4;\n  border-radius: 5px;\n  align-items: center;\n  gap: 6px;\n  padding: 5px 9px;\n  font-size: 12px;\n  font-weight: 600;\n  line-height: 1.5;\n  display: inline-flex;\n}\n.tag.green {\n  color: #226b52;\n  background: #eaf4f0;\n}\n.field {\n  flex-direction: column;\n  gap: 10px;\n  margin-bottom: 22px;\n  display: flex;\n}\n.field label {\n  color: #444a5e;\n  font-size: 14px;\n  font-weight: 600;\n}\n.field small {\n  color: #8b90a0;\n  line-height: 1.6;\n}\n.field input {\n  height: 46px;\n}\n.keyword-input {\n  resize: vertical;\n  background: #fafbfc;\n  min-height: 117px;\n  padding: 15px;\n  line-height: 1.8;\n}\n.topics {\n  flex-wrap: wrap;\n  gap: 7px;\n  margin: -8px 0 24px;\n  display: flex;\n}\n.topics button {\n  color: #777b8c;\n  background: #f7f8fa;\n  border: 1px solid #e2e5ec;\n  border-radius: 4px;\n  align-items: center;\n  gap: 4px;\n  padding: 5px 9px;\n  font-size: 12px;\n  display: flex;\n}\n.topics button:hover {\n  color: #c52c40;\n  border-color: #c52c40;\n}\n.form-grid {\n  grid-template-columns: 1fr 1fr;\n  gap: 17px;\n  display: grid;\n}\n.presenter {\n  border-top: 1px solid #edf0f4;\n  align-items: center;\n  gap: 13px;\n  margin-top: 1px;\n  padding: 19px 0;\n  display: flex;\n}\n.presenter-icon {\n  color: #81899e;\n  background: #f0f1f6;\n  border-radius: 50%;\n  place-items: center;\n  width: 45px;\n  height: 45px;\n  display: grid;\n}\n.presenter strong {\n  font-size: 15px;\n}\n.presenter p {\n  color: #858b9c;\n  margin-top: 3px;\n  font-size: 12px;\n}\n.presenter > .tag {\n  margin-left: auto;\n}\n.create-button {\n  color: #fff;\n  background: #d83144;\n  justify-content: center;\n  gap: 10px;\n  width: 100%;\n  height: auto;\n  min-height: 54px;\n  margin-top: 3px;\n  font-size: 16px;\n  font-weight: 700;\n  display: flex;\n}\n.create-button:hover {\n  background: #c3263b;\n}\n.create-button:disabled {\n  opacity: 1;\n  background: #bfc3ce;\n}\n.fineprint {\n  color: #858a99;\n  margin-top: 13px;\n  font-size: 12px;\n  line-height: 1.8;\n}\n.pipeline-panel {\n  color: #fff;\n  background: #181c35;\n  border-radius: 10px;\n  padding: 30px 29px;\n}\n.pipeline-heading {\n  border-bottom: 1px solid #ffffff15;\n  margin-bottom: 25px;\n  padding-bottom: 29px;\n}\n.pipeline-heading .eyebrow {\n  color: #aaaec5;\n  font-size: 10px;\n}\n.pipeline-heading h2 {\n  letter-spacing: -0.6px;\n  font-size: 19px;\n}\n.pipeline-step {\n  gap: 17px;\n  padding-bottom: 29px;\n  display: flex;\n  position: relative;\n}\n.pipeline-step:not(:nth-last-child(3)):before {\n  content: \"\";\n  background: #ffffff17;\n  width: 1px;\n  height: calc(100% - 34px);\n  position: absolute;\n  top: 34px;\n  left: 17px;\n}\n.step-index {\n  color: #949ab3;\n  z-index: 1;\n  background: #181c35;\n  border: 1px solid #ffffff29;\n  border-radius: 50%;\n  flex-shrink: 0;\n  place-items: center;\n  width: 35px;\n  height: 35px;\n  font-size: 11px;\n  display: grid;\n}\n.pipeline-step h3 {\n  margin: 0 0 6px;\n  font-size: 15px;\n  font-weight: 600;\n}\n.pipeline-step p {\n  color: #a0a6bd;\n  font-size: 13px;\n  line-height: 1.6;\n}\n.pipeline-step small {\n  color: #82899f;\n  margin-top: 7px;\n  font-size: 11px;\n  display: inline-block;\n}\n.pipeline-step.done .step-index {\n  color: #85d0ae;\n  background: #31463e;\n  border-color: #31463e;\n}\n.pipeline-step.active .step-index {\n  color: #fff;\n  background: #dc3042;\n  border-color: #dc3042;\n}\n.pipeline-step.active small {\n  color: #faa2ac;\n}\n.quality-rule {\n  color: #c9cde0;\n  border-top: 1px solid #ffffff15;\n  gap: 12px;\n  padding-top: 20px;\n  display: flex;\n}\n.quality-rule > svg {\n  color: #fa9ba7;\n  flex-shrink: 0;\n  margin-top: 4px;\n}\n.quality-rule p {\n  font-size: 13px;\n  line-height: 1.9;\n}\n.quality-rule strong {\n  color: #fff;\n  font-size: 14px;\n}\n.pipeline-foot {\n  color: #8e95b0;\n  margin-top: 17px;\n  font-size: 12px;\n  line-height: 1.8;\n}\n.result-section {\n  margin-top: 40px;\n}\n.empty-result {\n  text-align: center;\n  color: #99a0b3;\n  background: #f9fafb;\n  border: 1px dashed #d8dce6;\n  border-radius: 10px;\n  flex-direction: column;\n  align-items: center;\n  gap: 13px;\n  padding: 48px 28px;\n  display: flex;\n}\n.empty-result h3 {\n  color: #60677b;\n  font-size: 17px;\n  font-weight: 600;\n}\n.empty-result p {\n  color: #9196a5;\n  max-width: 500px;\n  font-size: 14px;\n  line-height: 1.8;\n}\n.empty-result.small {\n  padding: 32px 24px;\n}\n.knowledge-grid {\n  grid-template-columns: 1fr 1fr;\n  align-items: start;\n  gap: 28px;\n  display: grid;\n}\n.body-note {\n  color: #71778b;\n  margin-bottom: 25px;\n  font-size: 15px;\n  line-height: 1.9;\n}\n.source-input {\n  min-height: 245px;\n  padding: 14px;\n  line-height: 1.8;\n}\n.file-picker {\n  cursor: pointer;\n  border: 1px dashed #cbd0dc;\n  border-radius: 7px;\n  justify-content: center;\n  align-items: center;\n  gap: 9px;\n  padding: 13px;\n  font-size: 14px;\n  display: flex;\n  position: relative;\n}\n.file-picker input {\n  opacity: 0;\n  cursor: pointer;\n  width: 100%;\n  position: absolute;\n  inset: 0;\n}\n.check-row {\n  align-items: flex-start;\n  gap: 10px;\n  margin: 20px 0;\n  display: flex;\n}\n.check-row [data-slot=\"checkbox\"] {\n  flex-shrink: 0;\n  margin-top: 3px;\n}\n.check-row label {\n  cursor: pointer;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 1.7;\n}\n.text-link {\n  color: #ac2639;\n  align-items: center;\n  gap: 6px;\n  margin-top: 17px;\n  font-size: 13px;\n  text-decoration: underline;\n  display: flex;\n}\n.source-card {\n  background: #fff;\n  border: 1px solid #e1e4eb;\n  border-radius: 8px;\n  margin-bottom: 15px;\n  padding: 23px;\n}\n.source-card h3 {\n  font-size: 16px;\n  font-weight: 600;\n}\n.source-meta {\n  color: #8c91a1;\n  margin: 11px 0;\n  font-size: 12px;\n  line-height: 1.7;\n}\n.source-card .check-row {\n  margin-bottom: 0;\n}\n.learning-card {\n  background: #eceff5;\n  border: 1px solid #d5dbe7;\n  border-radius: 8px;\n  margin-top: 24px;\n  padding: 24px;\n}\n.learning-card svg {\n  color: #59667e;\n}\n.learning-card h3 {\n  margin-top: 12px;\n  font-size: 16px;\n  font-weight: 700;\n}\n.learning-card p {\n  color: #606b82;\n  margin-top: 12px;\n  font-size: 14px;\n  line-height: 1.9;\n}\n.learning-card small {\n  color: #848d9f;\n  margin-top: 10px;\n  font-size: 12px;\n  line-height: 1.8;\n  display: block;\n}\n.connection-row {\n  border-bottom: 1px solid #e9ebf1;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  padding: 20px 0;\n  display: flex;\n}\n.connection-row h3 {\n  font-size: 17px;\n  font-weight: 700;\n}\n.connection-row p {\n  color: #7d8496;\n  margin-top: 6px;\n  font-size: 13px;\n}\n.connection-row small {\n  font-size: 12px;\n}\n.security-note {\n  gap: 12px;\n  padding: 24px 0;\n  display: flex;\n}\n.security-note svg {\n  color: #b33141;\n  flex-shrink: 0;\n  margin-top: 4px;\n}\n.security-note strong {\n  font-size: 14px;\n}\n.security-note p {\n  color: #8a90a2;\n  overflow-wrap: anywhere;\n  margin-top: 7px;\n  font-size: 13px;\n  line-height: 1.9;\n}\n.boundary-note {\n  border-top: 1px solid #e9ebf1;\n  margin-top: 25px;\n  padding-top: 25px;\n}\n.boundary-note h3 {\n  font-size: 15px;\n  font-weight: 600;\n}\n.boundary-note p {\n  color: #7c8294;\n  margin-top: 12px;\n  font-size: 13px;\n  line-height: 1.9;\n}\n.between {\n  justify-content: space-between;\n  align-items: center;\n  gap: 15px;\n  display: flex;\n}\n.muted {\n  color: #9ca2b2;\n}\n.message {\n  overflow-wrap: anywhere;\n  background: #fff;\n  border: 1px solid #dde2ea;\n  border-radius: 7px;\n  align-items: center;\n  gap: 12px;\n  margin: 15px 0;\n  padding: 14px 17px;\n  font-size: 14px;\n  line-height: 1.7;\n  display: flex;\n}\n.message > svg {\n  flex-shrink: 0;\n}\n.message > button:last-child:not([data-slot]) {\n  margin-left: auto;\n  font-size: 22px;\n}\n.message.error {\n  color: #ab3446;\n  background: #fff5f5;\n  border-color: #f0d9dd;\n}\n.message.success {\n  color: #316c53;\n  background: #edf7f2;\n  border-color: #c5dfd1;\n}\n.job-result {\n  background: #fff;\n  border: 1px solid #e2e5ec;\n  border-radius: 10px;\n  min-width: 0;\n  padding: 27px;\n}\n.job-result h3 {\n  font-size: 19px;\n  font-weight: 700;\n  line-height: 1.6;\n}\n.job-result > .between p {\n  color: #8991a4;\n  margin-top: 5px;\n  font-size: 13px;\n  line-height: 1.8;\n}\n.reviews-grid {\n  grid-template-columns: 1fr 1fr;\n  gap: 14px;\n  margin: 24px 0;\n  display: grid;\n}\n.review-card {\n  border: 1px solid #e5e8f0;\n  border-radius: 7px;\n  min-width: 0;\n  padding: 16px;\n}\n.review-card strong {\n  font-size: 14px;\n}\n.review-card > p {\n  color: #989fb0;\n  margin-top: 14px;\n  font-size: 13px;\n  line-height: 1.8;\n}\n.score-row {\n  text-align: center;\n  grid-template-columns: repeat(4, 1fr);\n  gap: 6px;\n  margin-top: 19px;\n  display: grid;\n}\n.score-row b {\n  font-size: 22px;\n  font-weight: 500;\n}\n.score-row small {\n  color: #929bae;\n  margin-top: 3px;\n  font-size: 12px;\n  display: block;\n}\n.review-card ul {\n  color: #9f3547;\n  margin: 15px 0 0;\n  padding-left: 16px;\n  font-size: 13px;\n  line-height: 1.8;\n  list-style: outside;\n}\ndetails {\n  border-top: 1px solid #e7eaf0;\n  padding: 14px 0;\n}\nsummary {\n  color: #555e76;\n  font-size: 14px;\n  font-weight: 600;\n  line-height: 1.7;\n}\ndetails[open] > summary {\n  margin-bottom: 17px;\n}\n.scene-list > div {\n  border-bottom: 1px solid #eef0f4;\n  padding: 18px 0;\n}\n.scene-label {\n  color: #b13144;\n  letter-spacing: 1px;\n  align-items: center;\n  gap: 15px;\n  font-size: 11px;\n  font-weight: 700;\n  display: flex;\n}\n.scene-label small {\n  color: #939aac;\n  letter-spacing: 0;\n  font-size: 12px;\n  font-weight: 400;\n}\n.scene-list h4 {\n  margin: 13px 0 10px;\n  font-size: 16px;\n  font-weight: 700;\n}\n.scene-list p {\n  color: #414b62;\n  font-size: 16px;\n  line-height: 1.9;\n}\n.scene-list > div > small {\n  color: #989eae;\n  margin: 12px 0;\n  line-height: 1.8;\n  display: block;\n}\n.scene-list blockquote {\n  background: #f8f9fb;\n  border-left: 2px solid #c7cdda;\n  margin: 12px 0;\n  padding: 13px;\n}\n.scene-list blockquote b {\n  color: #68738b;\n  font-size: 12px;\n  font-weight: 500;\n}\n.scene-list blockquote p {\n  margin: 8px 0;\n  font-size: 14px;\n}\n.scene-list blockquote small {\n  color: #949db0;\n}\n.event-list {\n  flex-direction: column;\n  gap: 13px;\n  padding: 0;\n  list-style: none;\n  display: flex;\n}\n.event-list li {\n  color: #626e86;\n  gap: 15px;\n  font-size: 13px;\n  line-height: 1.8;\n  display: flex;\n}\n.event-list time {\n  white-space: nowrap;\n  color: #979fb0;\n  font-size: 12px;\n}\n.history-grid {\n  grid-template-columns: 310px minmax(0, 1fr);\n  align-items: start;\n  gap: 23px;\n  display: grid;\n}\n.history-list {\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n.history-list button {\n  text-align: left;\n  background: #fff;\n  border: 1px solid #e0e4ec;\n  border-radius: 8px;\n  width: 100%;\n  padding: 19px;\n}\n.history-list button.selected {\n  border-color: #c93349;\n  box-shadow: 0 0 0 1px #c93349;\n}\n.history-list strong {\n  overflow-wrap: anywhere;\n  margin-top: 13px;\n  font-size: 15px;\n  line-height: 1.7;\n  display: block;\n}\n.history-list p {\n  color: #8b93a6;\n  margin-top: 8px;\n  font-size: 12px;\n  line-height: 1.8;\n}\n.history-list small {\n  color: #a1a7b7;\n  font-size: 11px;\n}\n.video-output {\n  margin-top: 22px;\n}\n.video-output video {\n  background: #181c35;\n  border-radius: 8px;\n  width: 100%;\n  max-width: 100%;\n  max-height: 480px;\n}\n.video-output > .between {\n  color: #7f889d;\n  padding-top: 13px;\n  font-size: 13px;\n}\n.video-output a {\n  color: #b43145;\n  align-items: center;\n  gap: 5px;\n  display: flex;\n}\nfooter {\n  color: #9a9ead;\n  letter-spacing: 0.3px;\n  border-top: 1px solid #e1e4eb;\n  flex-wrap: wrap;\n  justify-content: space-between;\n  gap: 20px;\n  margin-top: 45px;\n  padding: 29px 0;\n  font-size: 11px;\n  display: flex;\n}\n@media (max-width: 1080px) {\n  .nav-note {\n    display: none;\n  }\n  .workspace,\n  .masthead {\n    padding: 0 25px;\n  }\n  .production-grid {\n    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 1fr);\n  }\n  .brief-panel,\n  .pipeline-panel,\n  .panel {\n    padding: 24px;\n  }\n  .heading-number {\n    display: none;\n  }\n}\n@media (max-width: 800px) {\n  .production-grid,\n  .knowledge-grid,\n  .history-grid {\n    grid-template-columns: 1fr;\n  }\n  .pipeline-panel {\n    padding: 25px;\n  }\n  .pipeline-step {\n    padding-bottom: 22px;\n  }\n  .pipeline-heading {\n    margin-bottom: 22px;\n    padding-bottom: 20px;\n  }\n  .edition {\n    display: none;\n  }\n  .masthead {\n    height: 82px;\n  }\n  .workspace,\n  .masthead {\n    padding: 0 18px;\n  }\n  .nav-row {\n    min-height: 75px;\n  }\n  .nav-tabs {\n    grid-template-columns: 1fr 1fr;\n    gap: 3px;\n    display: grid !important;\n  }\n  .nav-tabs [data-slot=\"tabs-trigger\"] {\n    padding: 9px 10px;\n    font-size: 13px;\n  }\n  .page-heading {\n    padding: 27px 0 22px;\n  }\n  .page-heading p {\n    font-size: 14px;\n  }\n  .setup-banner {\n    flex-direction: column;\n    align-items: flex-start;\n  }\n  .setup-banner p {\n    font-size: 12px;\n    line-height: 1.8;\n  }\n  .brief-panel,\n  .panel,\n  .job-result {\n    padding: 21px;\n  }\n  .presenter > .tag {\n    max-width: 105px;\n    font-size: 11px;\n  }\n  .history-list {\n    grid-template-columns: 1fr 1fr;\n    display: grid;\n  }\n  .header-right .tag {\n    font-size: 11px;\n  }\n  .brand strong {\n    font-size: 20px;\n  }\n  .form-grid {\n    gap: 12px;\n  }\n  .reviews-grid {\n    gap: 9px;\n  }\n  .review-card {\n    padding: 12px;\n  }\n  .score-row b {\n    font-size: 20px;\n  }\n  .event-list li,\n  .event-list time {\n    display: block;\n  }\n  .job-result > .between {\n    align-items: flex-start;\n  }\n  footer {\n    font-size: 10px;\n  }\n}\n@media (max-width: 420px) {\n  .reviews-grid,\n  .history-list {\n    grid-template-columns: 1fr;\n  }\n  .brand small {\n    font-size: 9px;\n  }\n  .brand-mark {\n    width: 33px;\n    height: 33px;\n  }\n  .page-heading h1 {\n    font-size: 24px;\n  }\n  .section-label > .tag {\n    margin-left: 0;\n  }\n  .header-right .tag svg {\n    display: none;\n  }\n}\n.provider-grid {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 20px;\n  margin: 24px 0;\n  display: grid;\n}\n.provider-grid .panel {\n  min-width: 0;\n}\n.connection-actions {\n  flex-wrap: wrap;\n  gap: 10px;\n  display: flex;\n}\n.avatar-panel {\n  margin-top: 24px;\n}\n.avatar-grid {\n  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));\n  gap: 16px;\n  margin: 20px 0;\n  display: grid;\n}\n.avatar-choice {\n  text-align: left;\n  background: #fff;\n  border: 2px solid #d9dce5;\n  border-radius: 12px;\n  padding: 0 0 14px;\n  overflow: hidden;\n}\n.avatar-choice.chosen {\n  border-color: #dc3042;\n}\n.avatar-choice:disabled {\n  opacity: 0.5;\n}\n.avatar-choice img,\n.avatar-placeholder {\n  object-fit: cover;\n  background: #f1f3f8;\n  width: 100%;\n  height: 190px;\n}\n.avatar-choice strong,\n.avatar-choice small {\n  margin: 10px 12px 0;\n  display: block;\n}\n.avatar-placeholder {\n  color: #62677b;\n  place-items: center;\n  display: grid;\n}\n@media (max-width: 1050px) {\n  .provider-grid {\n    grid-template-columns: 1fr;\n  }\n  .avatar-panel > .between {\n    flex-wrap: wrap;\n    gap: 16px;\n  }\n}\n.creation-readiness {\n  background: #f7f8fc;\n  border: 1px solid #d9dce5;\n  border-radius: 12px;\n  margin-bottom: 16px;\n  padding: 14px 16px;\n  font-size: 14px;\n}\n.readiness-item {\n  border-top: 1px solid #e0e3eb;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  margin-top: 10px;\n  padding-top: 12px;\n  line-height: 1.6;\n  display: flex;\n}\n.readiness-item > span {\n  flex: 1;\n}\n.readiness-item button {\n  flex-shrink: 0;\n}\n@media (max-width: 600px) {\n  .readiness-item {\n    flex-direction: column;\n    align-items: flex-start;\n  }\n}\n\n/* ── 원본 shadcn/ui 구성요소(버튼·입력·선택·체크박스·탭) 대응 스타일 ── */\n[hidden] { display: none !important; }\n.btn {\n  display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; gap: 8px;\n  height: 36px; padding: 8px 16px; border-radius: 6px; border: 1px solid transparent;\n  background: var(--primary); color: #fff; font-size: 14px; font-weight: 500; white-space: nowrap;\n  transition: background .15s, opacity .15s; outline: none;\n}\n.btn:hover { background: #c3263b; }\n.btn:disabled { opacity: .5; pointer-events: none; }\n.btn:focus-visible { box-shadow: 0 0 0 3px #dc304240; }\n.btn svg { flex-shrink: 0; width: 16px; height: 16px; pointer-events: none; }\n.btn.outline { background: #fff; color: var(--foreground); border-color: var(--border); box-shadow: 0 1px 2px #0000000d; }\n.btn.outline:hover { background: #eef1f5; }\n.btn.ghost { background: transparent; color: var(--foreground); }\n.btn.ghost:hover { background: #eef1f5; }\n.btn.sm { height: 32px; padding: 0 12px; gap: 6px; font-size: 13px; }\n.btn.w-full { width: 100%; }\n.create-button svg { width: 18px; height: 18px; }\n.create-button:disabled { opacity: 1; }\n.connection-actions .btn, .panel > .btn { margin-top: 2px; }\n.provider-grid .panel > .btn.outline { margin-bottom: 22px; }\n\n.input, .textarea, .select {\n  width: 100%; box-sizing: border-box; border: 1px solid var(--input); border-radius: 6px; background: transparent;\n  padding: 8px 12px; color: var(--foreground); box-shadow: 0 1px 2px #0000000d; outline: none;\n  transition: border-color .15s, box-shadow .15s;\n}\n.input { height: 36px; }\n.textarea { min-height: 64px; display: block; }\n.input:focus-visible, .textarea:focus-visible, .select:focus-visible { border-color: var(--ring); box-shadow: 0 0 0 3px #dc304240; }\n.input::placeholder, .textarea::placeholder { color: #64748b; }\n.select {\n  height: 48px; background: #fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 12px center;\n  -webkit-appearance: none; appearance: none; padding-right: 36px; font-size: 14px;\n}\n.select:disabled { opacity: .6; }\n.field .select-sm { height: 36px; }\n\n[data-slot=\"checkbox\"] {\n  -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin: 0; border: 1px solid var(--input);\n  border-radius: 4px; background: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 1px 2px #0000000d;\n}\n[data-slot=\"checkbox\"]:checked { background: var(--primary); border-color: var(--primary); }\n[data-slot=\"checkbox\"]:checked::after {\n  content: \"\"; width: 9px; height: 5px; border: 2px solid #fff; border-top: 0; border-right: 0; transform: rotate(-45deg) translate(1px, -1px);\n}\n[data-slot=\"checkbox\"]:disabled { opacity: .5; cursor: not-allowed; }\n\n.nav-tabs { display: inline-flex; align-items: center; }\n.nav-tabs [data-slot=\"tabs-trigger\"] { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; background: transparent; }\n.nav-tabs [data-slot=\"tabs-trigger\"]:hover { color: #181c35; }\n.nav-tabs [data-slot=\"tabs-trigger\"] svg { width: 16px; height: 16px; flex-shrink: 0; }\n.nav-tabs [data-state=\"active\"] .count { color: #181c35; background: #fff; }\n[role=\"tabpanel\"] { outline: none; }\n.mb-5 { margin-bottom: 20px; }\n.animate-spin { animation: spin 1s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n\n/* 로그인(관리자 전용 비공개 작업실) */\n.login-card { max-width: 420px; margin: 60px auto; }\n.login-card h2 { font-size: 20px; font-weight: 700; letter-spacing: -.6px; margin-bottom: 8px; }\n.login-card .body-note { margin-bottom: 22px; font-size: 14px; }\n.login-card .btn { width: 100%; height: 46px; font-size: 15px; }\n.header-right .btn.ghost { color: #6c7284; }\n","studio.js":"// 아파트스퀘어 영상 제작 작업실 (원본 reelty-ai-video-studio 화면·흐름을 바닐라 JS로 재현)\n// 서버: worker/worker.js (build.mjs 로 화면과 합쳐 deploy/worker.js 로 배포)  ·  설정: config.js\n;(function () {\n  const CFG = window.STUDIO_CONFIG || {}\n  const API = CFG.STUDIO_API || '/api/studio'\n  const sbc = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY)\n  const $ = (id) => document.getElementById(id)\n  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]))\n\n  // ── lucide 아이콘 ──\n  const ICONS = {\n    lock: '<circle cx=\"12\" cy=\"16\" r=\"1\"/><rect x=\"3\" y=\"10\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M7 10V7a5 5 0 0 1 10 0v3\"/>',\n    film: '<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M7 3v18\"/><path d=\"M3 7.5h4\"/><path d=\"M3 12h18\"/><path d=\"M3 16.5h4\"/><path d=\"M17 3v18\"/><path d=\"M17 7.5h4\"/><path d=\"M17 16.5h4\"/>',\n    book: '<path d=\"M12 7v14\"/><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\"/>',\n    history: '<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/>',\n    settings: '<path d=\"M14 17H5\"/><path d=\"M19 7h-9\"/><circle cx=\"17\" cy=\"17\" r=\"3\"/><circle cx=\"7\" cy=\"7\" r=\"3\"/>',\n    loader: '<path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/>',\n    plus: '<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>',\n    user: '<circle cx=\"12\" cy=\"8\" r=\"5\"/><path d=\"M20 21a8 8 0 0 0-16 0\"/>',\n    sparkles: '<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>',\n    arrow: '<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>',\n    shield: '<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>',\n    check: '<path d=\"M20 6 9 17l-5-5\"/>',\n    alert: '<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>',\n    ok: '<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m9 12 2 2 4-4\"/>',\n    upload: '<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>',\n    external: '<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>',\n    copy: '<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>',\n    refresh: '<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>',\n    key: '<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\"/><circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>',\n    library: '<path d=\"m16 6 4 14\"/><path d=\"M12 6v14\"/><path d=\"M8 8v12\"/><path d=\"M4 4v16\"/>',\n  }\n  function icon(name, size = 24, cls = '') {\n    return `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${size}\" height=\"${size}\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"${cls}\" aria-hidden=\"true\">${ICONS[name] || ''}</svg>`\n  }\n  document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 24) })\n\n  // ── 상수 (원본과 동일) ──\n  const STATUS = {\n    queued: '자료 검색', drafting: '대본 작성', reviewing: '교차 검수', revising: '자동 수정', submitting: '제작 요청',\n    rendering: 'HeyGen 제작 중', rendered: '영상 생성 완료', held: '자동 보류', failed: '처리 실패', uncertain: '중복 방지로 중단',\n  }\n  const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'submitting', 'rendering']\n  const DEFAULT_SETTINGS = { avatarId: '', avatarType: 'avatar', voiceId: 'fdd91d5eb0654e45a8b216b3f2c86eca', avatarName: '조현식 이사', consent: false, consentAt: '', maxDailyJobs: 5 }\n  const SAMPLE_SOURCE = {\n    title: '아파트스퀘어 핵심 고객·공종·서비스 기획',\n    provenance: '아파트스퀘어 킥오프 미팅(2).docx · 2026-08-04 등록 · 원문 2~3절 발췌 · 계획 자료(현재 제공 범위 확인 필요)',\n    content: `[기획 자료: 실제 서비스 제공 여부 및 현재 범위 확인 후 사용]\n2. 핵심 고객과 우선 공종\n핵심 고객\n· 12개월 이내 공사 추진 예정\n· 주요 의사결정자: 입주자대표회의, 관리사무소장\n대상 공종\n1. 외벽 재도장\n1. 옥상·외벽 방수\n1. 지하주차장 에폭시 및 누수 보수\n1. 보도블럭/아스콘\n초기에는 모든 공종을 확대하기보다, 고객 만족도와 수익성이 높은 공종에 집중한다.\n\n3. 대표 상품 구성\n서비스는 감리 업무의 나열이 아니라 고객이 얻는 결과를 중심으로 구성한다.\n어떤 과정에서도 고객 입장에서 ‘why?’가 없도록, 논리적 비약이 없도록 구축\n공사 전 진단 패키지 (특색/차별성 있게)\n· 현장 상태 진단\n· 필요한 공사와 미뤄도 되는 공사 구분\n· 공법별 장단점 비교\n· 예상 공사비 범위(합리적인 근거 표준 폼 구축)\n· 입주자대표회의 설명자료\n\n설계·공정입찰 패키지\n· 공사 범위 확정\n· 설계도서 및 시방서 작성\n· 물량산출\n· 입찰조건 작성\n· 업체 평가기준 수립\n· 현장설명회와 기술평가 지원\n· 디자인&모델링`,\n  }\n  const PIPELINE = [\n    ['아파트스퀘어 자료 검색', '승인 원문과 문장별 근거 확보', 0, 1],\n    ['Claude × OpenAI 교차 검수', '같은 대본·프롬프트를 독립 평가', 1, 5],\n    ['HeyGen 전용 프롬프트', '대본·장면·자막·브랜드 지시 고정', 5, 6],\n    ['이사님 아바타 영상 생성', '선택한 외형·음성으로 실제 제작', 6, 7],\n  ]\n  const PROVIDERS = [['claude', 'Claude'], ['openai', 'ChatGPT · OpenAI'], ['heygen', 'HeyGen']]\n\n  // ── 상태 ──\n  const S = {\n    data: null, tab: 'create', error: '', success: '', busy: false, selectedId: null, requestId: null,\n    settings: { ...DEFAULT_SETTINGS }, avatars: [], nextToken: '', avatarsLoaded: false, settingsBusy: false,\n    providerUi: {},\n  }\n\n  // ── API ──\n  async function api(body) {\n    const { data: { session } } = await sbc.auth.getSession()\n    if (!session) { showLogin(); throw new Error('로그인이 필요합니다.') }\n    let res\n    try {\n      res = await fetch(API, {\n        method: body ? 'POST' : 'GET',\n        headers: { authorization: 'Bearer ' + session.access_token, ...(body ? { 'content-type': 'application/json' } : {}) },\n        ...(body ? { body: JSON.stringify(body) } : {}),\n      })\n    } catch (e) {\n      throw new Error('작업실 서버에 연결하지 못했습니다. config.js 의 STUDIO_API 주소와 Worker 배포 상태를 확인해 주세요.')\n    }\n    const out = await res.json().catch(() => ({}))\n    if (res.status === 401) showLogin()\n    if (!res.ok) throw new Error(out.error || '요청을 처리하지 못했습니다.')\n    return out\n  }\n\n  async function load() {\n    try {\n      S.data = await api()\n      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }\n      syncSettingsForm()\n    } catch (e) { S.error = e.message }\n    renderAll()\n  }\n\n  async function act(body, okMsg) {\n    S.busy = true; S.error = ''; S.success = ''; renderAll()\n    try {\n      S.data = await api(body)\n      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }\n      syncSettingsForm()\n      S.success = okMsg\n      return true\n    } catch (e) { S.error = e.message; return false } finally { S.busy = false; renderAll() }\n  }\n\n  // ── 파생 값 ──\n  const activeJob = () => S.data && S.data.jobs.find((j) => ACTIVE.includes(j.status))\n  const currentJob = () => S.data && (S.data.jobs.find((j) => j.id === S.selectedId) || activeJob() || S.data.jobs[0])\n  function missing() {\n    const n = S.data\n    if (!n) return []\n    const out = []\n    if (!n.readiness.claude) out.push({ label: 'Claude API와 사용할 모델을 저장해 주세요.', tab: 'settings', action: 'Claude 연결' })\n    if (!n.readiness.openai) out.push({ label: 'OpenAI API와 사용할 모델을 저장해 주세요.', tab: 'settings', action: 'OpenAI 연결' })\n    if (!n.readiness.heygen) out.push({ label: 'HeyGen API 연결을 저장해 주세요.', tab: 'settings', action: 'HeyGen 연결' })\n    if (!n.settings.avatarId || !n.settings.voiceId) out.push({ label: '사용할 아바타와 음성을 선택하고 저장해 주세요.', tab: 'settings', action: '아바타 설정' })\n    if (!n.settings.consent) out.push({ label: '아바타 사용 권한 확인을 체크하고 설정을 저장해 주세요.', tab: 'settings', action: '동의 저장' })\n    if (!n.sources.some((s) => s.approved === 1)) {\n      out.push({ label: n.sources.length ? '등록 자료에서 ‘영상 제작 근거로 사용’을 체크해 주세요.' : '영상의 근거가 될 브랜드 자료를 1개 이상 등록해 주세요.', tab: 'knowledge', action: '자료실 열기' })\n    }\n    return out\n  }\n  const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })\n  function passes(r) {\n    return !!r && r.pass && r.issues.length === 0 && [r.grounding, r.brand, r.clarity, r.production].every((x) => x >= 90)\n  }\n\n  // ── 렌더링 ──\n  function renderAll() {\n    renderTabs(); renderMessages(); renderCreate(); renderKnowledge(); renderHistory(); renderSettings()\n    ensurePolling()\n  }\n\n  function renderTabs() {\n    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('data-state', b.dataset.tab === S.tab ? 'active' : 'inactive'))\n    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== S.tab })\n    $('tab-src-count').textContent = S.data ? S.data.sources.length : 0\n  }\n\n  function renderMessages() {\n    let h = ''\n    if (S.error) h += `<div class=\"message error\" role=\"alert\">${icon('alert', 18)}<span>${esc(S.error)}</span><button data-close=\"error\" aria-label=\"오류 닫기\">×</button></div>`\n    if (S.success) h += `<div class=\"message success\" role=\"status\">${icon('ok', 18)}<span>${esc(S.success)}</span><button data-close=\"success\" aria-label=\"알림 닫기\">×</button></div>`\n    if (!S.data) h += `<div class=\"message\">${icon('loader', 18, 'animate-spin')}<span>작업실 정보를 불러오는 중입니다. 오류가 보이면 새로고침하세요.</span><button class=\"btn outline\" data-refresh>새로고침</button></div>`\n    $('msg-area').innerHTML = h\n  }\n\n  function renderCreate() {\n    const n = S.data\n    const miss = missing()\n    const ready = !!n && miss.length === 0\n    const act = activeJob()\n    const kw = $('keywords').value.trim()\n    const I = currentJob()\n\n    $('setup-banner').innerHTML = !ready && n ? `<div class=\"setup-banner\"><div>${icon('shield', 22)}<div>\n      <strong>제작 전 ${miss.length}개 항목을 완료해 주세요</strong>\n      <p>${n.settings.consent ? '아바타 사용 동의는 저장되었습니다. 아래 제작 버튼 위에 남은 항목을 표시했습니다.' : '아래 제작 버튼 위에서 필요한 항목을 확인하세요.'}</p></div></div></div>` : ''\n\n    const consent = n && n.settings.consent\n    $('presenter-tag').className = consent ? 'tag green' : 'tag'\n    $('presenter-tag').textContent = consent ? '사용 동의 저장 완료' : '본인·동의 확인 전'\n\n    if (n) {\n      const title = act ? '진행 중인 제작이 있습니다' : miss.length || kw.length < 2 ? '제작을 시작하려면' : '제작 준비 완료'\n      let h = `<div class=\"creation-readiness\" aria-live=\"polite\"><div class=\"between\"><strong>${title}</strong><button class=\"btn ghost sm\" data-refresh>상태 새로고침</button></div>`\n      miss.forEach((m) => { h += `<div class=\"readiness-item\"><span>${esc(m.label)}</span><button class=\"btn outline sm\" data-goto=\"${m.tab}\">${esc(m.action)}</button></div>` })\n      if (kw.length < 2) h += `<div class=\"readiness-item\"><span>영상 주제 키워드를 2자 이상 입력해 주세요.</span><button class=\"btn outline sm\" data-focus-keywords>키워드 입력</button></div>`\n      if (act) h += `<div class=\"readiness-item\"><span>현재 작업이 끝난 뒤 새 영상을 시작할 수 있습니다.</span><button class=\"btn outline sm\" data-goto=\"history\">제작 이력</button></div>`\n      $('readiness').innerHTML = h + '</div>'\n    } else $('readiness').innerHTML = ''\n\n    const btn = $('create-btn')\n    btn.disabled = S.busy || !ready || !!act || kw.length < 2\n    btn.innerHTML = `${S.busy ? icon('loader', 18, 'animate-spin') : icon('sparkles', 18)} ${act ? '영상 제작 진행 중' : '자동 영상 제작 시작'}${icon('arrow', 18)}`\n\n    $('pipeline-steps').innerHTML = PIPELINE.map(([t, d, from, to], i) => {\n      const done = I && (I.step >= to || I.status === 'rendered')\n      const on = I && ACTIVE.includes(I.status) && I.step >= from && I.step < to\n      return `<div class=\"pipeline-step ${done ? 'done' : ''} ${on ? 'active' : ''}\">\n        <span class=\"step-index\">${done ? icon('check', 17) : on ? icon('loader', 16, 'animate-spin') : String(i + 1).padStart(2, '0')}</span>\n        <div><h3>${t}</h3><p>${d}</p><small>${done ? '진행 완료' : on ? '처리 중' : '대기'}</small></div></div>`\n    }).join('')\n\n    $('result-tag').hidden = !I\n    if (I) $('result-tag').textContent = STATUS[I.status] || I.status\n    $('result-body').innerHTML = I ? jobHtml(I) : `<div class=\"empty-result\">${icon('film', 30)}<h3>첫 번째 영상을 기다리고 있습니다</h3><p>실제 제작 결과와 검수 기록만 표시합니다. 예시 영상이나 가짜 통과 결과는 생성하지 않습니다.</p></div>`\n  }\n\n  function reviewHtml(name, r) {\n    const tag = r ? (passes(r) ? '<span class=\"tag green\">AI 통과</span>' : '<span class=\"tag\">미통과</span>') : '<span class=\"tag\">미실행</span>'\n    let body = '<p>실제 API 검수가 끝나면 결과가 표시됩니다.</p>'\n    if (r) {\n      body = `<div class=\"score-row\">${[['근거', r.grounding], ['브랜드', r.brand], ['전달', r.clarity], ['제작', r.production]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>`\n      if (r.issues.length) body += `<ul>${r.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`\n    }\n    return `<div class=\"review-card\"><div class=\"between\"><strong>${name}</strong>${tag}</div>${body}</div>`\n  }\n\n  function jobHtml(e) {\n    let h = `<div class=\"job-result\"><div class=\"between\"><div><h3>${esc((e.plan && e.plan.title) || e.input.keywords)}</h3>\n      <p>${esc(e.input.audience)} · 목표 ${e.input.seconds}초 · ${e.input.ratio} · 수정 ${e.revision}/2회</p></div><span class=\"tag\">${STATUS[e.status] || esc(e.status)}</span></div>`\n    if (e.error) h += `<div class=\"message error\">${icon('shield', 18)}${esc(e.error)}</div>`\n    if (e.videoUrl) {\n      h += `<div class=\"video-output\"><video controls playsinline preload=\"metadata\" src=\"${esc(e.videoUrl)}\"></video>\n        <div class=\"between\"><span>실제 길이 ${e.actualSeconds || '미확인'}초</span><a href=\"${esc(e.videoUrl)}\" target=\"_blank\" rel=\"noreferrer\">영상 열기 ${icon('external', 14)}</a></div>\n        <p class=\"fineprint\">AI 아바타 생성 영상 · 화면·발음·자막의 최종 품질은 자동 검증되지 않았습니다. 영상 주소는 만료될 수 있습니다.</p></div>`\n    }\n    h += `<div class=\"reviews-grid\">${reviewHtml('Claude', e.claude)}${reviewHtml('OpenAI', e.openai)}</div>`\n    if (e.plan) {\n      h += `<details open><summary>최종 대본 · 장면 구성</summary><div class=\"scene-list\">${e.plan.scenes.map((s, i) => `<div>\n        <span class=\"scene-label\">SCENE ${String(i + 1).padStart(2, '0')} <small>${s.seconds}초</small></span>\n        <h4>${esc(s.onScreen)}</h4><p>${esc(s.narration)}</p><small>화면: ${esc(s.visual)}</small>\n        <details><summary>원문 근거 ${s.citations.length}개</summary>${s.citations.map((c) => `<blockquote>\n          <b>${esc((e.sources.find((x) => x.id === c.sourceId) || {}).title || '출처 확인 필요')}</b><p>${esc(c.quote)}</p><small>${esc(c.claim)}</small></blockquote>`).join('')}</details>\n      </div>`).join('')}</div></details>`\n    }\n    if (e.prompt) {\n      h += `<details><summary>HeyGen에 전달하는 실제 프롬프트</summary><button class=\"btn outline\" data-copy-prompt=\"${e.id}\">${icon('copy', 14)}복사</button><pre>${esc(e.prompt)}</pre></details>`\n    }\n    h += `<details><summary>제작 기록 · ${e.events.length}건</summary><ol class=\"event-list\">${e.events.map((x) => `<li><time>${fmt(x.time)}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>\n      <small>프롬프트 ${esc(e.promptVersion)} · Claude ${esc(e.models.claude)} · OpenAI ${esc(e.models.openai)}</small></details>`\n    if (e.memory.length) h += `<details><summary>이번 제작에 참고한 누적 패턴</summary>${e.memory.map((m) => `<p>${esc(m)}</p>`).join('')}</details>`\n    return h + '</div>'\n  }\n\n  function renderKnowledge() {\n    const n = S.data\n    const srcs = (n && n.sources) || []\n    $('src-count').textContent = srcs.length\n    $('src-approved').textContent = `승인 ${srcs.filter((s) => s.approved === 1).length}개`\n    $('learning-count').textContent = (n && n.learningCount) || 0\n    $('sources-list').innerHTML = srcs.length ? srcs.map((s) => `<article class=\"source-card\">\n        <div class=\"between\"><h3>${esc(s.title)}</h3><span class=\"${s.approved ? 'tag green' : 'tag'}\">${s.approved ? '사용 중' : '승인 대기'}</span></div>\n        <p class=\"source-meta\">${esc(s.provenance)}</p>\n        <details><summary>본문 확인</summary><pre>${esc(s.content)}</pre></details>\n        <div class=\"check-row\"><input type=\"checkbox\" data-slot=\"checkbox\" id=\"src-${s.id}\" data-approve=\"${s.id}\" ${s.approved === 1 ? 'checked' : ''} ${S.busy ? 'disabled' : ''}><label for=\"src-${s.id}\">영상 제작 근거로 사용</label></div>\n      </article>`).join('')\n      : `<div class=\"empty-result small\">${icon('library', 28)}<h3>아직 등록된 자료가 없습니다</h3><p>서비스 소개서, 시방서, 검증된 현장사례를 등록하면 다음 제작부터 검색합니다.</p></div>`\n    updateSourceSave()\n  }\n  function updateSourceSave() {\n    $('source-save').disabled = S.busy || $('source-content').value.length < 30 || !$('source-title').value || !$('source-origin').value\n  }\n\n  function renderHistory() {\n    const n = S.data\n    if (!n || !n.jobs.length) { $('history-body').innerHTML = `<div class=\"empty-result\">${icon('history', 30)}<h3>아직 제작 이력이 없습니다</h3></div>`; return }\n    const I = currentJob()\n    $('history-body').innerHTML = `<div class=\"history-grid\"><div class=\"history-list\">${n.jobs.map((e) => `<button class=\"${I && I.id === e.id ? 'selected' : ''}\" data-select-job=\"${e.id}\">\n        <div class=\"between\"><span class=\"tag\">${STATUS[e.status] || esc(e.status)}</span><small>${fmt(e.created)}</small></div>\n        <strong>${esc((e.plan && e.plan.title) || e.input.keywords)}</strong><p>${esc(e.input.audience)} · ${e.input.seconds}초 · ${e.input.ratio}</p></button>`).join('')}</div>\n      ${I ? jobHtml(I) : ''}</div>`\n  }\n\n  // ── 연결 설정 ──\n  function buildProviders() {\n    $('provider-grid').innerHTML = PROVIDERS.map(([p, label]) => `<section class=\"panel\" data-provider=\"${p}\">\n      <div class=\"between\"><h2>${label}</h2><span class=\"tag\" data-p-status>연결 필요</span></div>\n      <div class=\"field\"><label for=\"${p}-key\">API 키</label><input class=\"input\" id=\"${p}-key\" type=\"password\" autocomplete=\"new-password\" spellcheck=\"false\" placeholder=\"API 키를 여기에 붙여 넣으세요\"></div>\n      ${p !== 'heygen' ? `<button class=\"btn outline\" data-p-check>연결 확인 · 모델 불러오기</button>\n      <div class=\"field\"><label for=\"${p}-model\">사용할 모델</label><select class=\"select select-sm\" id=\"${p}-model\"><option value=\"\">먼저 모델을 불러오세요</option></select>\n      <small>구조화 출력이 가능한 텍스트 모델을 선택해 주세요.</small></div>` : ''}\n      <div class=\"connection-actions\"><button class=\"btn\" data-p-save>연결 확인 후 저장</button><button class=\"btn outline\" data-p-delete hidden>연결 삭제</button></div>\n      <p class=\"body-note\" role=\"status\" data-p-ok hidden></p><p class=\"message error\" role=\"alert\" data-p-err hidden></p>\n    </section>`).join('')\n    PROVIDERS.forEach(([p]) => { S.providerUi[p] = { models: [], busy: false, ok: '', err: '', model: '' } })\n    $('provider-grid').addEventListener('input', (ev) => {\n      const box = ev.target.closest('[data-provider]'); if (!box) return\n      const u = S.providerUi[box.dataset.provider]\n      if (ev.target.id.endsWith('-key')) { u.models = []; u.ok = ''; fillModels(box.dataset.provider) }\n      renderProviders()\n    })\n    $('provider-grid').addEventListener('change', (ev) => {\n      if (!ev.target.id.endsWith('-model')) return\n      S.providerUi[ev.target.id.split('-')[0]].model = ev.target.value; renderProviders()\n    })\n    $('provider-grid').addEventListener('click', (ev) => {\n      const box = ev.target.closest('[data-provider]'); if (!box) return\n      const p = box.dataset.provider\n      if (ev.target.closest('[data-p-check]')) providerConnect(p, false)\n      if (ev.target.closest('[data-p-save]')) providerConnect(p, true)\n      if (ev.target.closest('[data-p-delete]')) providerDisconnect(p)\n    })\n  }\n  function fillModels(p) {\n    const sel = $(p + '-model'); if (!sel) return\n    const u = S.providerUi[p]\n    const list = u.models.length ? u.models : u.model ? [{ id: u.model, name: u.model }] : []\n    sel.innerHTML = list.length ? list.map((m) => `<option value=\"${esc(m.id)}\" ${m.id === u.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('') : '<option value=\"\">먼저 모델을 불러오세요</option>'\n    if (list.length && !list.some((m) => m.id === u.model)) { sel.value = ''; sel.insertAdjacentHTML('afterbegin', '<option value=\"\" selected>모델을 선택하세요</option>') }\n  }\n  function renderProviders() {\n    PROVIDERS.forEach(([p]) => {\n      const box = document.querySelector(`[data-provider=\"${p}\"]`); if (!box) return\n      const st = S.data && S.data.connections && S.data.connections[p]\n      const u = S.providerUi[p]\n      const key = $(p + '-key').value\n      const tag = box.querySelector('[data-p-status]')\n      tag.className = st && st.checkedAt ? 'tag green' : 'tag'\n      tag.textContent = st && st.checkedAt ? '인증 확인 · 저장됨' : st && st.configured ? '키 설정됨' : '연결 필요'\n      $(p + '-key').placeholder = st && st.configured ? '저장됨 · 변경할 때만 새 키 입력' : 'API 키를 여기에 붙여 넣으세요'\n      const check = box.querySelector('[data-p-check]')\n      if (check) { check.disabled = u.busy || (!key && !(st && st.configured)); check.textContent = u.busy ? '확인 중…' : '연결 확인 · 모델 불러오기' }\n      const save = box.querySelector('[data-p-save]')\n      save.disabled = u.busy || (!key && !(st && st.configured)) || (p !== 'heygen' && !u.model)\n      save.textContent = u.busy ? '연결 확인 중…' : '연결 확인 후 저장'\n      const del = box.querySelector('[data-p-delete]')\n      del.hidden = !(st && st.configured); del.disabled = u.busy\n      const ok = box.querySelector('[data-p-ok]'); ok.hidden = !u.ok; ok.textContent = u.ok\n      const err = box.querySelector('[data-p-err]'); err.hidden = !u.err; err.textContent = u.err\n    })\n  }\n  async function providerConnect(p, save) {\n    const u = S.providerUi[p]\n    u.busy = true; u.ok = ''; u.err = ''; renderProviders()\n    try {\n      const out = await api({ action: 'connection', provider: p, key: $(p + '-key').value, model: save ? u.model : '', save })\n      if (save) {\n        $(p + '-key').value = ''\n        u.ok = '연결 확인 및 암호화 저장 완료. 실제 생성 가능 여부는 제작 시 확인됩니다.'\n        await load()\n      } else {\n        u.models = out.models; fillModels(p)\n        u.ok = 'API 인증 확인 완료. 사용할 모델을 선택하고 저장해 주세요.'\n      }\n    } catch (e) { u.err = e.message } finally { u.busy = false; renderProviders() }\n  }\n  async function providerDisconnect(p) {\n    const u = S.providerUi[p]\n    u.busy = true; u.err = ''; renderProviders()\n    try {\n      await api({ action: 'disconnect', provider: p })\n      $(p + '-key').value = ''; u.model = ''; u.models = []; fillModels(p)\n      u.ok = '저장한 API 연결을 삭제했습니다.'\n      await load()\n    } catch (e) { u.err = e.message } finally { u.busy = false; renderProviders() }\n  }\n\n  function syncSettingsForm() {\n    $('voice-id').value = S.settings.voiceId || ''\n    $('avatar-confirm').checked = !!S.settings.consent\n    $('daily-limit').value = S.settings.maxDailyJobs\n    if (S.data) PROVIDERS.forEach(([p]) => {\n      const m = S.data.connections[p] && S.data.connections[p].model\n      if (m && !S.providerUi[p].models.length) { S.providerUi[p].model = m; fillModels(p) }\n    })\n  }\n  function renderSettings() {\n    renderProviders()\n    const heygen = !!(S.data && S.data.readiness.heygen)\n    $('avatar-load').disabled = S.settingsBusy || !heygen\n    $('avatar-load').textContent = S.settingsBusy ? '불러오는 중…' : '내 HeyGen 아바타 불러오기'\n    $('avatar-need-key').hidden = heygen\n    $('avatar-empty').hidden = !(S.avatarsLoaded && !S.avatars.length)\n    $('avatar-grid').innerHTML = S.avatars.map((a) => `<button type=\"button\" class=\"avatar-choice ${S.settings.avatarId === a.id ? 'chosen' : ''}\" data-avatar=\"${esc(a.id)}\" ${a.status !== 'completed' ? 'disabled' : ''}>\n        ${a.preview ? `<img src=\"${esc(a.preview)}\" alt=\"${esc(a.name)}\" loading=\"lazy\" referrerpolicy=\"no-referrer\">` : '<div class=\"avatar-placeholder\">미리보기 없음</div>'}\n        <strong>${esc(a.name)}</strong><small>${a.status === 'completed' ? (S.settings.avatarId === a.id ? '선택됨' : '선택하기') : 'HeyGen 준비 중'}</small></button>`).join('')\n    $('avatar-more').hidden = !S.nextToken\n    $('avatar-more').disabled = S.settingsBusy\n    const sel = S.settings.avatarId\n    $('avatar-selected').hidden = !sel\n    if (sel) $('avatar-selected').textContent = '선택된 아바타: ' + ((S.avatars.find((a) => a.id === sel) || {}).name || sel)\n    $('settings-save').disabled = S.settingsBusy || !S.settings.avatarId || !S.settings.voiceId || !heygen\n  }\n  async function loadAvatars(more) {\n    S.settingsBusy = true; $('settings-err').hidden = true; renderSettings()\n    try {\n      const t = await api({ action: 'avatars', token: more ? S.nextToken : '' })\n      S.avatars = more ? [...S.avatars, ...t.avatars.filter((a) => !S.avatars.some((b) => b.id === a.id))] : t.avatars\n      S.nextToken = t.nextToken; S.avatarsLoaded = true\n    } catch (e) { $('settings-err').textContent = e.message; $('settings-err').hidden = false } finally { S.settingsBusy = false; renderSettings() }\n  }\n  async function saveSettings() {\n    S.settingsBusy = true; $('settings-err').hidden = true; $('settings-ok').hidden = true; renderSettings()\n    try {\n      S.data = await api({ action: 'settings', settings: S.settings })\n      S.settings = { ...DEFAULT_SETTINGS, ...S.data.settings }\n      syncSettingsForm()\n      $('settings-ok').textContent = '기존 HeyGen 아바타와 음성 설정을 저장했습니다.'; $('settings-ok').hidden = false\n    } catch (e) { $('settings-err').textContent = e.message; $('settings-err').hidden = false } finally { S.settingsBusy = false; renderAll() }\n  }\n\n  // ── 진행 중 작업 자동 진행 (원본: 0.7초 후 시작, 1.2초 간격, 렌더링 단계는 15초 간격) ──\n  let pollTimer = null, advancing = false\n  function ensurePolling() {\n    if (pollTimer || advancing) return\n    if (activeJob()) pollTimer = setTimeout(tick, 700)\n  }\n  async function tick() {\n    pollTimer = null\n    const job = activeJob()\n    if (!job) return\n    advancing = true\n    try {\n      const t = await api({ action: 'advance', id: job.id })\n      S.data.jobs = S.data.jobs.map((j) => (j.id === t.job.id ? t.job : j))\n      if (t.job.status === 'rendered') S.data.learningCount = S.data.jobs.filter((j) => j.status === 'rendered').length\n      S.error = ''\n    } catch (e) { S.error = e.message }\n    advancing = false\n    const next = activeJob()\n    if (next) pollTimer = setTimeout(tick, next.step === 6 ? 15000 : 1200)\n    renderAll()\n  }\n\n  function newRequestId() {\n    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()\n    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')\n  }\n  async function createJob() {\n    S.busy = true; S.error = ''; S.success = ''; renderAll()\n    try {\n      S.requestId = S.requestId || newRequestId()\n      const e = await api({\n        action: 'create', requestId: S.requestId,\n        input: { keywords: $('keywords').value, audience: $('audience').value, seconds: Number($('seconds').value), ratio: $('ratio').value },\n      })\n      S.data.jobs = [e.job, ...S.data.jobs.filter((j) => j.id !== e.job.id)]\n      S.selectedId = e.job.id\n      S.requestId = null\n    } catch (e) { S.error = e.message } finally { S.busy = false; renderAll() }\n  }\n\n  // ── 이벤트 ──\n  $('topics').innerHTML = ['외벽 재도장', '옥상 방수', '공사 전 진단'].map((t) => `<button type=\"button\" data-topic=\"${t}\">${icon('plus', 13)}${t}</button>`).join('')\n  ;['keywords', 'audience', 'ratio', 'seconds'].forEach((id) => $(id).addEventListener('input', () => { S.requestId = null; renderCreate() }))\n  $('create-btn').addEventListener('click', createJob)\n  ;['source-title', 'source-origin', 'source-content'].forEach((id) => $(id).addEventListener('input', updateSourceSave))\n  $('source-save').addEventListener('click', async () => {\n    const ok = await act({ action: 'source', source: { title: $('source-title').value, provenance: $('source-origin').value, content: $('source-content').value, approved: $('source-approve').checked } }, '자료를 저장했습니다.')\n    if (ok) { $('source-title').value = ''; $('source-origin').value = ''; $('source-content').value = ''; $('source-approve').checked = false; updateSourceSave() }\n  })\n  $('source-sample').addEventListener('click', () => {\n    $('source-title').value = SAMPLE_SOURCE.title; $('source-origin').value = SAMPLE_SOURCE.provenance\n    $('source-content').value = SAMPLE_SOURCE.content; $('source-approve').checked = false; updateSourceSave()\n  })\n  $('source-file').addEventListener('change', async (ev) => {\n    const f = ev.target.files && ev.target.files[0]; ev.target.value = ''\n    if (!f) return\n    if (!/\\.(txt|md)$/i.test(f.name) || f.size > 180000) { S.error = '180KB 이하의 TXT 또는 MD 파일을 선택해 주세요. PDF·PPT·한글 문서는 본문 텍스트를 붙여 넣어 주세요.'; renderMessages(); return }\n    const text = await f.text()\n    $('source-title').value = f.name; $('source-origin').value = f.name; $('source-content').value = text; $('source-approve').checked = false; updateSourceSave()\n  })\n  $('avatar-load').addEventListener('click', () => loadAvatars(false))\n  $('avatar-more').addEventListener('click', () => loadAvatars(true))\n  $('avatar-grid').addEventListener('click', (ev) => {\n    const b = ev.target.closest('[data-avatar]'); if (!b) return\n    const a = S.avatars.find((x) => x.id === b.dataset.avatar); if (!a) return\n    S.settings = { ...S.settings, avatarId: a.id, avatarType: a.type || 'avatar', avatarName: a.name, voiceId: a.voiceId || S.settings.voiceId, consent: false }\n    syncSettingsForm(); renderSettings()\n  })\n  $('voice-id').addEventListener('input', (ev) => { S.settings = { ...S.settings, voiceId: ev.target.value, consent: false }; $('avatar-confirm').checked = false; renderSettings() })\n  $('avatar-confirm').addEventListener('change', (ev) => { S.settings = { ...S.settings, consent: ev.target.checked } })\n  $('daily-limit').addEventListener('input', (ev) => { S.settings = { ...S.settings, maxDailyJobs: Number(ev.target.value) } })\n  $('settings-save').addEventListener('click', saveSettings)\n\n  document.addEventListener('click', async (ev) => {\n    const t = ev.target\n    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderTabs(); return }\n    const go = t.closest('[data-goto]'); if (go) { S.tab = go.dataset.goto; renderTabs(); window.scrollTo(0, 0); return }\n    if (t.closest('[data-refresh]')) { load(); return }\n    if (t.closest('[data-focus-keywords]')) { $('keywords').focus(); return }\n    const close = t.closest('[data-close]'); if (close) { S[close.dataset.close] = ''; renderMessages(); return }\n    const topic = t.closest('[data-topic]'); if (topic) { $('keywords').value = topic.dataset.topic; S.requestId = null; renderCreate(); return }\n    const sel = t.closest('[data-select-job]'); if (sel) { S.selectedId = sel.dataset.selectJob; renderCreate(); renderHistory(); return }\n    const cp = t.closest('[data-copy-prompt]')\n    if (cp) {\n      const job = S.data.jobs.find((j) => j.id === cp.dataset.copyPrompt)\n      try { await navigator.clipboard.writeText(job.prompt); S.success = '복사했습니다.' } catch (e) { S.error = '복사 권한이 없습니다. 내용을 직접 선택해 복사해 주세요.' }\n      renderMessages()\n    }\n  })\n  document.addEventListener('change', (ev) => {\n    const a = ev.target.closest('[data-approve]')\n    if (a) act({ action: 'approval', id: a.dataset.approve, approved: a.checked }, '자료 사용 상태를 변경했습니다.')\n  })\n\n  // ── 로그인 ──\n  function showLogin() {\n    $('login-view').hidden = false; $('studio-view').hidden = true; $('logout-btn').hidden = true\n  }\n  function showStudio() {\n    $('login-view').hidden = true; $('studio-view').hidden = false; $('logout-btn').hidden = false\n  }\n  async function doLogin() {\n    let id = $('li-id').value.trim()\n    const pw = $('li-pw').value\n    if (!id || !pw) { $('login-msg').textContent = '아이디와 비밀번호를 입력해 주세요.'; return }\n    if (!id.includes('@')) id += '@aptsquare.app'\n    $('login-msg').textContent = '로그인 중…'\n    const { error } = await sbc.auth.signInWithPassword({ email: id, password: pw })\n    if (error) { $('login-msg').textContent = '아이디 또는 비밀번호를 확인해 주세요.'; return }\n    $('login-msg').textContent = ''\n    showStudio(); load()\n  }\n  $('login-btn').addEventListener('click', doLogin)\n  $('li-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin() })\n  $('logout-btn').addEventListener('click', async () => { await sbc.auth.signOut(); location.reload() })\n\n  buildProviders()\n  renderAll()\n  sbc.auth.getSession().then(({ data: { session } }) => {\n    if (session) { showStudio(); load() } else showLogin()\n  })\n})()\n","config.js":"// 영상 제작 작업실 설정\n// STUDIO_API: 비워 두면 같은 주소의 /api/studio 로 요청합니다 (deploy/worker.js 로 배포하면 비워 두면 됨).\n//   화면을 다른 곳에 올리고 API 만 Worker 로 쓸 때만 Worker 주소를 넣으세요.\nwindow.STUDIO_CONFIG = {\n  STUDIO_API: '',\n  SUPABASE_URL: 'https://gndktayoicegyqyllybk.supabase.co',\n  SUPABASE_KEY: 'sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE',\n}\n"}

// 아파트스퀘어 영상 제작 작업실 API
// 화면: ../index.html  ·  테이블: ../db/schema.sql
//
// 배포: `node build.mjs` 로 화면까지 합친 deploy/worker.js 를 만들고, 그 파일을 Cloudflare Worker 에 붙여넣는다.
//   (화면 + API 가 Worker 주소 하나에서 동작. 이 원본 파일만 올리면 API 만 동작)
// 환경변수(Worker → Settings → Variables and Secrets, 모두 Secret 권장):
//   SUPABASE_URL           = https://gndktayoicegyqyllybk.supabase.co
//   SUPABASE_SERVICE_ROLE  = (Supabase service_role 키)
//   STUDIO_ENC_KEY         = (아무 긴 비밀문자열 — API 키 암호화용. 바꾸면 저장된 키를 다시 등록해야 함)
//
// 흐름(한 번의 advance 요청 = 한 단계):
//   0 자료 검색 → 1 대본 작성(Claude) → 2 Claude 검수 → 3 OpenAI 검수 → 4 판정(미통과 시 최대 2회 수정)
//   → 5 HeyGen 제작 요청 → 6 렌더링 확인 → 7 완료
// 서버가 강제하는 규칙: 관리자만 접근 · 승인 자료 필수 · 아바타 사용 동의 필수 · 하루 접수 제한 ·
//   인용문이 원문에 실제로 있어야 함 · 양쪽 검수 4항목 90점 이상 + 지적 0건 · 중복 제작 방지.

const PROMPT_VERSION = 'studio-v1'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_REVISIONS = 2
const ACTIVE = ['queued', 'drafting', 'reviewing', 'revising', 'submitting', 'rendering']
const DEFAULT_SETTINGS = {
  avatarId: '', avatarType: 'avatar', voiceId: 'fdd91d5eb0654e45a8b216b3f2c86eca',
  avatarName: '조현식 이사', consent: false, consentAt: '', maxDailyJobs: 5,
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    // 화면 파일(deploy/worker.js 로 빌드했을 때만 포함): /api 가 아닌 GET 요청은 화면을 돌려준다
    const path = new URL(request.url).pathname
    if (typeof STATIC_FILES !== 'undefined' && request.method === 'GET' && !path.startsWith('/api')) return serveStatic(path)
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) throw new HttpError(500, '서버 환경변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE)가 설정되지 않았습니다.')
      const user = await requireAdmin(request, env)
      if (request.method === 'GET') return json(await state(env))
      if (request.method !== 'POST') throw new HttpError(405, 'GET 또는 POST 만 지원합니다.')
      let body
      try { body = await request.json() } catch (e) { throw new HttpError(400, '요청 형식이 올바르지 않습니다.') }
      const handler = ACTIONS[body && body.action]
      if (!handler) throw new HttpError(400, '알 수 없는 요청입니다.')
      return json(await handler(env, body, user))
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.log('[studio] error', e && e.stack || e)
      return json({ error: String((e && e.message) || e) }, status)
    }
  },
}

// ─────────────────────────── 요청 처리 ───────────────────────────
const ACTIONS = {
  // API 키 확인(save=false: 모델 목록만) / 저장(save=true)
  async connection(env, { provider, key, model, save }) {
    if (!['claude', 'openai', 'heygen'].includes(provider)) throw new HttpError(400, '알 수 없는 서비스입니다.')
    let apiKey = String(key || '').trim()
    if (!apiKey) apiKey = await getKey(env, provider, false)
    if (!apiKey) throw new HttpError(400, 'API 키를 입력해 주세요.')
    const models = await listModels(provider, apiKey)
    if (!save) return { models }
    if (provider !== 'heygen') {
      if (!model) throw new HttpError(400, '사용할 모델을 선택해 주세요.')
      if (!models.some((m) => m.id === model)) throw new HttpError(400, '이 API 키로 사용할 수 없는 모델입니다.')
    }
    const { cipher, iv } = await encrypt(env, apiKey)
    await sb(env, 'studio_secrets?on_conflict=provider', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { provider, cipher, iv, model: provider === 'heygen' ? '' : model, checked_at: now(), updated_at: now() },
    })
    return { ok: true }
  },

  async disconnect(env, { provider }) {
    await sb(env, 'studio_secrets?provider=eq.' + encodeURIComponent(provider), { method: 'DELETE', prefer: 'return=minimal' })
    return { ok: true }
  },

  // HeyGen 개인 아바타 목록 (token = 다음 페이지 위치)
  async avatars(env, { token }) {
    const key = await getKey(env, 'heygen')
    return listAvatars(key, token)
  },

  async settings(env, { settings }) {
    const s = settings || {}
    const avatarId = String(s.avatarId || '').trim()
    const voiceId = String(s.voiceId || '').trim()
    if (!avatarId || !voiceId) throw new HttpError(400, '아바타와 음성을 선택해 주세요.')
    const max = Math.round(Number(s.maxDailyJobs))
    if (!(max >= 1 && max <= 20)) throw new HttpError(400, '하루 최대 제작 접수 건수는 1~20 사이로 입력해 주세요.')
    const prev = await getSettings(env)
    const consent = s.consent === true
    const data = {
      avatarId, voiceId, maxDailyJobs: max, consent,
      avatarType: s.avatarType === 'talking_photo' ? 'talking_photo' : 'avatar',
      avatarName: String(s.avatarName || DEFAULT_SETTINGS.avatarName).slice(0, 80),
      consentAt: consent ? (prev.consent && prev.avatarId === avatarId && prev.voiceId === voiceId && prev.consentAt ? prev.consentAt : now()) : '',
    }
    await sb(env, 'studio_settings?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { id: 1, data, updated_at: now() },
    })
    return state(env)
  },

  async source(env, { source }, user) {
    const s = source || {}
    const title = String(s.title || '').trim()
    const provenance = String(s.provenance || '').trim()
    const content = String(s.content || '').trim()
    if (title.length < 2 || title.length > 150) throw new HttpError(400, '자료 제목은 2~150자로 입력해 주세요.')
    if (provenance.length < 2 || provenance.length > 500) throw new HttpError(400, '출처·작성일·버전을 입력해 주세요.')
    if (content.length < 30 || content.length > 60000) throw new HttpError(400, '자료 본문은 30자 이상 60,000자 이하로 입력해 주세요.')
    await sb(env, 'studio_sources', {
      method: 'POST', prefer: 'return=minimal',
      body: { title, provenance, content, approved: s.approved === true, created_by: user.id },
    })
    return state(env)
  },

  async approval(env, { id, approved }) {
    await sb(env, 'studio_sources?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', prefer: 'return=minimal', body: { approved: approved === true },
    })
    return state(env)
  },

  async create(env, { requestId, input }, user) {
    const rid = String(requestId || '').trim()
    if (rid.length < 8 || rid.length > 80) throw new HttpError(400, '요청 번호가 올바르지 않습니다.')
    // 같은 요청 번호가 이미 접수됐으면 새로 만들지 않고 그 작업을 돌려준다(중복 클릭·재전송 방지)
    const dup = await sb(env, 'studio_jobs?select=*&request_id=eq.' + encodeURIComponent(rid))
    if (dup.length) return { job: toJob(dup[0]) }

    const inp = validateInput(input)
    const st = await state(env, { raw: true })
    const missing = readinessProblems(st)
    if (missing.length) throw new HttpError(400, '제작 전 확인이 필요합니다: ' + missing.join(' / '))
    if (st.jobs.some((j) => ACTIVE.includes(j.status))) throw new HttpError(409, '진행 중인 제작이 끝난 뒤 새 영상을 시작할 수 있습니다.')
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const todayCount = st.jobs.filter((j) => new Date(j.created_at) >= today).length
    if (todayCount >= st.settings.maxDailyJobs) throw new HttpError(429, `오늘(UTC) 제작 접수 한도 ${st.settings.maxDailyJobs}건을 모두 사용했습니다.`)

    const models = { claude: st.secrets.claude.model, openai: st.secrets.openai.model }
    const memory = memoryFrom(st.jobs)
    const rows = await sb(env, 'studio_jobs', {
      method: 'POST', prefer: 'return=representation',
      body: {
        request_id: rid, status: 'queued', step: 0, revision: 0, input: inp, created_by: user.id,
        data: { models, memory, promptVersion: PROMPT_VERSION, events: [ev('제작 요청 접수 · 승인 자료 검색 대기')] },
      },
    })
    return { job: toJob(rows[0]) }
  },

  // 진행 중인 작업을 한 단계 진행한다(화면이 주기적으로 호출)
  async advance(env, { id }) {
    const rows = await sb(env, 'studio_jobs?select=*&id=eq.' + encodeURIComponent(id))
    if (!rows.length) throw new HttpError(404, '작업을 찾을 수 없습니다.')
    let row = rows[0]
    if (!ACTIVE.includes(row.status)) return { job: toJob(row) }
    // 동시에 두 창이 같은 단계를 처리하지 않도록 잠금 (최대 3분)
    const locked = await sb(env, `studio_jobs?id=eq.${row.id}&or=(locked_until.is.null,locked_until.lt.${encodeURIComponent('"' + now() + '"')})`, {
      method: 'PATCH', prefer: 'return=representation',
      body: { locked_until: new Date(Date.now() + 180000).toISOString() },
    })
    if (!locked.length) return { job: toJob(row) }
    row = locked[0]
    const job = { id: row.id, status: row.status, step: row.step, revision: row.revision, input: row.input, data: row.data || {} }
    job.data.events = job.data.events || []
    try {
      await runStep(env, job)
    } catch (e) {
      const msg = String((e && e.message) || e)
      job.data.events.push(ev('오류: ' + msg))
      job.data.error = msg
      job.status = 'failed'
    }
    const saved = await sb(env, 'studio_jobs?id=eq.' + row.id, {
      method: 'PATCH', prefer: 'return=representation',
      body: { status: job.status, step: job.step, revision: job.revision, data: job.data, locked_until: null },
    })
    return { job: toJob(saved[0]) }
  },
}

// ─────────────────────────── 제작 파이프라인 ───────────────────────────
async function runStep(env, job) {
  const d = job.data
  const st = await state(env, { raw: true })

  // 0) 승인 자료 검색
  if (job.step === 0) {
    const approved = st.sourcesFull.filter((s) => s.approved)
    const picked = retrieve(approved, job.input.keywords)
    if (!picked.length) {
      job.status = 'held'
      d.error = '키워드와 관련된 승인 자료를 찾지 못해 제작하지 않았습니다. 브랜드 자료실에 근거 자료를 등록·승인해 주세요.'
      d.events.push(ev('자료 검색: 관련 근거 없음 → 자동 보류'))
      return
    }
    d.context = picked
    const ids = [...new Set(picked.map((p) => p.sourceId))]
    d.sources = ids.map((sid) => ({ id: sid, title: (approved.find((s) => s.id === sid) || {}).title || '' }))
    d.events.push(ev(`자료 검색: 승인 자료 ${ids.length}개에서 근거 단락 ${picked.length}개 확보`))
    job.step = 1; job.status = 'drafting'
    return
  }

  const claudeKey = await getKey(env, 'claude')
  const openaiKey = await getKey(env, 'openai')

  // 1) 대본·장면 작성
  if (job.step === 1) {
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), draftUser(job, d), PLAN_SCHEMA)
    applyPlan(job, plan, st)
    d.events.push(ev(`대본 작성 완료: 장면 ${plan.scenes.length}개 · Claude ${d.models.claude}`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 2) Claude 독립 검수
  if (job.step === 2) {
    d.claude = await callClaude(claudeKey, d.models.claude, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA)
    d.claude = normReview(d.claude)
    d.events.push(ev(`Claude 검수: ${passes(d.claude) ? '통과' : '미통과'} (근거 ${d.claude.grounding} · 브랜드 ${d.claude.brand} · 전달 ${d.claude.clarity} · 제작 ${d.claude.production})`))
    job.step = 3
    return
  }

  // 3) OpenAI 독립 검수
  if (job.step === 3) {
    d.openai = normReview(await callOpenAI(openaiKey, d.models.openai, reviewSystem(), reviewUser(job, d), REVIEW_SCHEMA))
    d.events.push(ev(`OpenAI 검수: ${passes(d.openai) ? '통과' : '미통과'} (근거 ${d.openai.grounding} · 브랜드 ${d.openai.brand} · 전달 ${d.openai.clarity} · 제작 ${d.openai.production})`))
    job.step = 4
    return
  }

  // 4) 판정 → 통과 / 수정 / 보류
  if (job.step === 4 && job.status !== 'revising') {
    const issues = allIssues(d)
    if (!issues.length) {
      d.events.push(ev('교차 검수 통과: 양쪽 4항목 90점 이상 · 지적 0건 · 인용 원문 일치'))
      job.step = 5; job.status = 'submitting'
    } else if (job.revision < MAX_REVISIONS) {
      d.pendingIssues = issues
      d.events.push(ev(`검수 미통과(지적 ${issues.length}건) → 자동 수정 ${job.revision + 1}/${MAX_REVISIONS}`))
      job.status = 'revising'
    } else {
      job.status = 'held'
      d.error = `수정 ${MAX_REVISIONS}회 후에도 검수 기준을 통과하지 못해 자동 보류했습니다. 영상은 제작하지 않았습니다.`
      d.events.push(ev('검수 기준 미통과 → 자동 보류 (HeyGen 제작 요청 안 함)'))
    }
    return
  }

  // 4-수정) 지적 사항을 반영해 대본 수정 → 다시 양쪽 검수
  if (job.status === 'revising') {
    const plan = await callClaude(claudeKey, d.models.claude, draftSystem(), reviseUser(job, d), PLAN_SCHEMA)
    job.revision += 1
    applyPlan(job, plan, st)
    d.claude = null; d.openai = null; d.pendingIssues = []
    d.events.push(ev(`자동 수정 ${job.revision}/${MAX_REVISIONS} 완료 → 재검수`))
    job.step = 2; job.status = 'reviewing'
    return
  }

  // 5) HeyGen 제작 요청 (중복 제작 방지: 요청 전에 '시도함'을 먼저 저장)
  if (job.step === 5) {
    if (!st.settings.consent || !st.settings.avatarId || !st.settings.voiceId) throw new Error('아바타 사용 동의·아바타·음성 설정이 필요합니다.')
    if (allIssues(d).length) throw new Error('검수 통과 기록이 없어 제작을 요청하지 않았습니다.')
    if (d.submitAttempted && !d.videoId) {
      job.status = 'uncertain'
      d.error = '이전 제작 요청의 결과를 확인하지 못했습니다. 중복 비용을 막기 위해 자동 재요청하지 않았습니다. HeyGen 대시보드에서 영상 생성 여부를 확인해 주세요.'
      d.events.push(ev('제작 요청 결과 불명 → 중복 방지로 중단'))
      return
    }
    d.submitAttempted = true
    await sb(env, 'studio_jobs?id=eq.' + job.id, { method: 'PATCH', prefer: 'return=minimal', body: { data: d } }).catch(() => {})
    const heygenKey = await getKey(env, 'heygen')
    let res
    try {
      res = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: { 'X-Api-Key': heygenKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(heygenPayload(job, st.settings)),
      })
    } catch (e) {
      job.status = 'uncertain'
      d.error = 'HeyGen 제작 요청 중 연결이 끊겨 결과를 확인하지 못했습니다. 중복 비용을 막기 위해 재요청하지 않았습니다. HeyGen 대시보드를 확인해 주세요.'
      d.events.push(ev('제작 요청 연결 오류 → 중복 방지로 중단'))
      return
    }
    const out = await res.json().catch(() => ({}))
    const videoId = out && out.data && out.data.video_id
    if (!res.ok || !videoId) {
      job.status = 'failed'
      d.error = 'HeyGen 제작 요청 실패: ' + apiError(out, res.status)
      d.events.push(ev(d.error))
      return
    }
    d.videoId = videoId
    d.events.push(ev(`HeyGen 제작 접수 (video_id ${videoId})`))
    job.step = 6; job.status = 'rendering'
    return
  }

  // 6) 렌더링 상태 확인
  if (job.step === 6) {
    const heygenKey = await getKey(env, 'heygen')
    const res = await fetch('https://api.heygen.com/v1/video_status.get?video_id=' + encodeURIComponent(d.videoId), {
      headers: { 'X-Api-Key': heygenKey, accept: 'application/json' },
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HeyGen 상태 확인 실패: ' + apiError(out, res.status))
    const v = out.data || {}
    if (v.status === 'completed' && v.video_url) {
      d.videoUrl = v.video_url
      d.actualSeconds = v.duration ? Math.round(Number(v.duration)) : null
      d.events.push(ev(`영상 생성 완료${d.actualSeconds ? ` · 실제 길이 ${d.actualSeconds}초` : ''}`))
      job.step = 7; job.status = 'rendered'
    } else if (v.status === 'failed') {
      job.status = 'failed'
      d.error = 'HeyGen 영상 생성 실패: ' + ((v.error && (v.error.message || v.error.detail || v.error.code)) || '원인 미상')
      d.events.push(ev(d.error))
    }
  }
}

// 새 대본을 저장하고, 인용문이 원문에 실제로 있는지 서버에서 검사한다
function applyPlan(job, plan, st) {
  const d = job.data
  const byId = Object.fromEntries(st.sourcesFull.map((s) => [s.id, s]))
  const problems = []
  if (!plan || !Array.isArray(plan.scenes)) throw new Error('대본 형식이 올바르지 않습니다.')
  plan.title = String(plan.title || job.input.keywords).slice(0, 120)
  plan.blockers = (plan.blockers || []).map(String).filter(Boolean)
  if (plan.scenes.length < 2 || plan.scenes.length > 16) problems.push(`장면 수는 2~16개여야 합니다(현재 ${plan.scenes.length}개).`)
  plan.scenes.forEach((s, i) => {
    s.seconds = Math.max(1, Math.min(120, Math.round(Number(s.seconds) || 0)))
    s.narration = String(s.narration || '').slice(0, 1600)
    s.onScreen = String(s.onScreen || '').slice(0, 100)
    s.visual = String(s.visual || '').slice(0, 500)
    s.citations = Array.isArray(s.citations) ? s.citations : []
    if (!s.narration) problems.push(`장면 ${i + 1}: 발화 문장이 비어 있습니다.`)
    if (!s.citations.length) problems.push(`장면 ${i + 1}: 원문 근거가 없습니다.`)
    s.citations.forEach((c, k) => {
      const src = byId[c.sourceId]
      if (!src || !src.approved) problems.push(`장면 ${i + 1} 근거 ${k + 1}: 승인된 자료가 아닙니다.`)
      else if (String(c.quote || '').length < 12 || !norm(src.content).includes(norm(c.quote))) problems.push(`장면 ${i + 1} 근거 ${k + 1}: 인용문이 원문과 일치하지 않습니다.`)
    })
  })
  const total = plan.scenes.reduce((a, s) => a + s.seconds, 0)
  if (Math.abs(total - job.input.seconds) > Math.max(15, job.input.seconds * 0.25)) problems.push(`장면 길이 합계(${total}초)가 목표 ${job.input.seconds}초와 크게 다릅니다.`)
  d.plan = plan
  d.groundingIssues = problems
  d.prompt = heygenPrompt(job, plan)
}

function allIssues(d) {
  const out = []
  ;(d.groundingIssues || []).forEach((x) => out.push('[서버 근거 검사] ' + x))
  ;((d.plan && d.plan.blockers) || []).forEach((x) => out.push('[대본 작성 중단 사유] ' + x))
  if (!passes(d.claude)) out.push(...reviewIssues('Claude', d.claude))
  if (!passes(d.openai)) out.push(...reviewIssues('OpenAI', d.openai))
  return out
}
function reviewIssues(name, r) {
  if (!r) return [`[${name}] 검수 결과 없음`]
  const low = ['grounding', 'brand', 'clarity', 'production'].filter((k) => r[k] < 90).map((k) => `${k} ${r[k]}점`)
  return [...(r.issues || []).map((x) => `[${name}] ${x}`), ...(low.length ? [`[${name}] 90점 미만: ${low.join(', ')}`] : []), ...(!r.pass ? [`[${name}] 통과 판정 아님`] : [])]
}
function passes(r) {
  return !!r && r.pass === true && Array.isArray(r.issues) && r.issues.length === 0 &&
    [r.grounding, r.brand, r.clarity, r.production].every((x) => Number(x) >= 90)
}
function normReview(r) {
  const n = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)))
  return { pass: r.pass === true, grounding: n(r.grounding), brand: n(r.brand), clarity: n(r.clarity), production: n(r.production), issues: (r.issues || []).map((x) => String(x).slice(0, 1000)).slice(0, 20) }
}

// ─────────────────────────── 프롬프트 ───────────────────────────
function draftSystem() {
  return [
    '당신은 아파트 보수공사 감리 전문회사 "아파트스퀘어"의 영상 대본 작가입니다.',
    '발표자는 아파트스퀘어 조현식 이사(AI 아바타)이며, 1인칭 존댓말로 시청자에게 직접 설명합니다.',
    '규칙:',
    '1. 사실·수치·서비스 내용은 제공된 [승인 자료] 단락에서만 가져옵니다. 자료에 없는 사실, 수치, 사례, 약속을 만들지 마세요.',
    '2. 모든 장면에 citations 를 1개 이상 달고, quote 는 해당 자료 원문에서 12자 이상을 글자 그대로 복사합니다(띄어쓰기 포함, 요약·수정 금지). sourceId 는 자료의 id 를 그대로 씁니다.',
    '3. 자료가 "계획/목표/기획"이라고 표시한 내용은 현재 제공 중인 실적처럼 말하지 말고 계획으로 표현합니다.',
    '4. 장면 seconds 합계가 목표 길이에 가깝게 합니다. 한국어 발화는 1초에 약 4~5글자로 계산합니다.',
    '5. onScreen 은 화면 자막(짧은 핵심 문구, 30자 이내), visual 은 화면 구성 지시입니다.',
    '6. 근거가 부족해 목표 길이·주제를 정직하게 채울 수 없으면 blockers 에 이유를 적습니다(억지로 채우지 않음).',
    '7. 과장·단정적 효과 보장·타사 비방·확인되지 않은 법적 판단은 쓰지 않습니다.',
  ].join('\n')
}
function contextBlock(d) {
  return (d.context || []).map((c, i) => `<자료 단락 ${i + 1} id="${c.sourceId}" 제목="${c.title}" 출처="${c.provenance}">\n${c.text}\n</자료 단락>`).join('\n\n')
}
function briefBlock(job) {
  const i = job.input
  return `[이번 영상]\n키워드: ${i.keywords}\n시청 대상: ${i.audience}\n목표 길이: ${i.seconds}초\n화면 비율: ${i.ratio === '9:16' ? '세로형 9:16(쇼츠)' : '가로형 16:9'}`
}
function draftUser(job, d) {
  const mem = (d.memory || []).length ? `\n\n[지난 제작 형식 참고(사실은 가져오지 말 것)]\n${d.memory.join('\n')}` : ''
  return `${briefBlock(job)}${mem}\n\n[승인 자료]\n${contextBlock(d)}\n\n위 규칙에 따라 영상 제목과 장면별 대본을 작성하세요.`
}
function reviseUser(job, d) {
  return `${draftUser(job, d)}\n\n[직전 대본]\n${JSON.stringify(d.plan)}\n\n[검수 지적 사항 — 모두 해결하세요]\n${(d.pendingIssues || []).map((x) => '- ' + x).join('\n')}\n\n지적 사항을 반영해 대본 전체를 다시 작성하세요. 해결할 수 없으면 blockers 에 이유를 적으세요.`
}
function reviewSystem() {
  return [
    '당신은 아파트스퀘어 영상 대본의 독립 검수자입니다. 작성자와 별개로 엄격하게 평가합니다.',
    '각 항목을 0~100점으로 채점합니다:',
    '- grounding: 모든 주장·수치가 [승인 자료]로 뒷받침되는가. 자료에 없는 사실이 하나라도 있으면 60점 이하.',
    '- brand: 아파트스퀘어(감리 전문, 신뢰·정확성)와 발표자(조현식 이사) 어조에 맞고 과장·보장·비방이 없는가.',
    '- clarity: 시청 대상이 이해하기 쉽고 논리적 비약 없이 전달되는가.',
    '- production: HeyGen 아바타 영상으로 바로 제작 가능한가(장면 길이 합계, 발화량, 자막 길이, 화면 지시).',
    'issues 에는 반드시 고쳐야 하는 중대 지적만 한국어로 적습니다(없으면 빈 배열). 사소한 취향은 적지 않습니다.',
    'pass 는 네 항목이 모두 90점 이상이고 issues 가 비어 있을 때만 true 입니다.',
  ].join('\n')
}
function reviewUser(job, d) {
  return `${briefBlock(job)}\n\n[승인 자료]\n${contextBlock(d)}\n\n[검수 대상 대본]\n${JSON.stringify(d.plan)}\n\n[HeyGen 에 전달할 프롬프트]\n${d.prompt}\n\n위 대본과 프롬프트를 평가하세요.`
}
function heygenPrompt(job, plan) {
  const i = job.input
  const lines = [
    `# ${plan.title}`,
    `발표자: 아파트스퀘어 조현식 이사 (등록된 전용 아바타·음성 사용)`,
    `시청 대상: ${i.audience} · 목표 ${i.seconds}초 · ${i.ratio === '9:16' ? '세로형 1080×1920' : '가로형 1920×1080'} · 자막 켜기`,
    `브랜드 지시: 차분하고 신뢰감 있는 전문가 어조, 과장 표현·효과 보장 금지, 아파트스퀘어 브랜드 컬러(레드 #DC3042, 네이비 #181C35) 사용`,
    '',
  ]
  plan.scenes.forEach((s, k) => {
    lines.push(`## 장면 ${k + 1} (${s.seconds}초)`)
    lines.push(`자막: ${s.onScreen}`)
    lines.push(`화면: ${s.visual}`)
    lines.push(`대사: ${s.narration}`)
    lines.push('')
  })
  return lines.join('\n').trim()
}
function heygenPayload(job, settings) {
  const plan = job.data.plan
  const character = settings.avatarType === 'talking_photo'
    ? { type: 'talking_photo', talking_photo_id: settings.avatarId }
    : { type: 'avatar', avatar_id: settings.avatarId, avatar_style: 'normal' }
  return {
    title: `[아파트스퀘어] ${plan.title}`.slice(0, 120),
    caption: true,
    dimension: job.input.ratio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
    video_inputs: plan.scenes.map((s) => ({
      character,
      voice: { type: 'text', input_text: s.narration, voice_id: settings.voiceId },
    })),
  }
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    grounding: { type: 'integer' },
    brand: { type: 'integer' },
    clarity: { type: 'integer' },
    production: { type: 'integer' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'grounding', 'brand', 'clarity', 'production', 'issues'],
  additionalProperties: false,
}
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          seconds: { type: 'integer' },
          narration: { type: 'string' },
          onScreen: { type: 'string' },
          visual: { type: 'string' },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: { sourceId: { type: 'string' }, quote: { type: 'string' }, claim: { type: 'string' } },
              required: ['sourceId', 'quote', 'claim'],
              additionalProperties: false,
            },
          },
        },
        required: ['seconds', 'narration', 'onScreen', 'visual', 'citations'],
        additionalProperties: false,
      },
    },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'scenes', 'blockers'],
  additionalProperties: false,
}

// ─────────────────────────── 외부 API ───────────────────────────
async function callClaude(key, model, system, user, schema) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 16000, system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Claude 요청 실패: ' + apiError(out, res.status))
  if (out.stop_reason === 'refusal') throw new Error('Claude 가 요청 처리를 거절했습니다.')
  if (out.stop_reason === 'max_tokens') throw new Error('Claude 응답이 길이 제한으로 잘렸습니다.')
  const text = (out.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  try { return JSON.parse(text) } catch (e) { throw new Error('Claude 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
}

async function callOpenAI(key, model, system, user, schema) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: 'review', strict: true, schema } },
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('OpenAI 요청 실패: ' + apiError(out, res.status))
  const msg = (out.choices && out.choices[0] && out.choices[0].message) || {}
  if (msg.refusal) throw new Error('OpenAI 가 요청 처리를 거절했습니다: ' + msg.refusal)
  try { return JSON.parse(msg.content || '') } catch (e) { throw new Error('OpenAI 응답을 해석하지 못했습니다(구조화 출력을 지원하는 모델인지 확인해 주세요).') }
}

async function listModels(provider, key) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new HttpError(400, 'Claude 인증 실패: ' + apiError(out, res.status))
    return (out.data || []).map((m) => ({ id: m.id, name: m.display_name ? `${m.display_name} (${m.id})` : m.id }))
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: 'Bearer ' + key } })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new HttpError(400, 'OpenAI 인증 실패: ' + apiError(out, res.status))
    const skip = /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|davinci|babbage|instruct|codex)/i
    return (out.data || []).map((m) => m.id).filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !skip.test(id))
      .sort().reverse().map((id) => ({ id, name: id }))
  }
  const res = await fetch('https://api.heygen.com/v2/user/remaining_quota', { headers: { 'X-Api-Key': key, accept: 'application/json' } })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || (out && out.error)) throw new HttpError(400, 'HeyGen 인증 실패: ' + apiError(out, res.status))
  return []
}

// HeyGen 개인 아바타: 아바타 그룹(내 아바타) → 그룹별 룩. 실패하면 전체 목록에서 내 사진 아바타로 대체.
async function listAvatars(key, token) {
  const h = { 'X-Api-Key': key, accept: 'application/json' }
  const PAGE = 4
  const start = Math.max(0, parseInt(token || '0', 10) || 0)
  const gres = await fetch('https://api.heygen.com/v2/avatar_group.list?include_public=false', { headers: h })
  const gout = await gres.json().catch(() => ({}))
  const groups = (gout.data && (gout.data.avatar_group_list || gout.data.avatar_groups)) || null
  if (gres.ok && Array.isArray(groups)) {
    const avatars = []
    for (const g of groups.slice(start, start + PAGE)) {
      const r = await fetch(`https://api.heygen.com/v2/avatar_group/${encodeURIComponent(g.id)}/avatars`, { headers: h })
      const o = await r.json().catch(() => ({}))
      const list = (o.data && (o.data.avatar_list || o.data.avatars)) || []
      const photo = /photo/i.test(String(g.group_type || g.type || ''))
      for (const a of list) {
        avatars.push({
          id: a.id || a.avatar_id || a.talking_photo_id,
          name: a.name || a.avatar_name || g.name || '이름 없음',
          preview: a.image_url || a.preview_image_url || a.preview_url || g.preview_image || '',
          status: String(a.status || 'completed').toLowerCase() === 'completed' ? 'completed' : String(a.status || '').toLowerCase(),
          voiceId: a.default_voice_id || a.voice_id || g.default_voice_id || '',
          type: photo || a.talking_photo_id ? 'talking_photo' : 'avatar',
        })
      }
    }
    const next = start + PAGE < groups.length ? String(start + PAGE) : ''
    return { avatars: avatars.filter((a) => a.id), nextToken: next }
  }
  // 대체 경로: /v2/avatars 의 talking_photos(계정에 올린 사진 아바타)
  const res = await fetch('https://api.heygen.com/v2/avatars', { headers: h })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new HttpError(400, 'HeyGen 아바타 조회 실패: ' + apiError(out, res.status))
  const all = ((out.data && out.data.talking_photos) || []).map((t) => ({
    id: t.talking_photo_id, name: t.talking_photo_name || '사진 아바타', preview: t.preview_image_url || '',
    status: 'completed', voiceId: '', type: 'talking_photo',
  }))
  return { avatars: all.slice(start, start + 24), nextToken: start + 24 < all.length ? String(start + 24) : '' }
}

// ─────────────────────────── 자료 검색 ───────────────────────────
// 승인 자료를 단락으로 나눠 키워드(단어 + 한글 2글자 조각) 겹침으로 점수를 매긴다.
function retrieve(sources, keywords) {
  const terms = String(keywords).split(/[\s,·/]+/).map((t) => t.trim()).filter((t) => t.length >= 2)
  const grams = new Set()
  terms.forEach((t) => { for (let i = 0; i < t.length - 1; i++) grams.add(t.slice(i, i + 2)) })
  const chunks = []
  for (const s of sources) {
    const paras = String(s.content).split(/\n\s*\n/)
    let buf = ''
    const flush = () => { if (buf.trim()) chunks.push({ sourceId: s.id, title: s.title, provenance: s.provenance, text: buf.trim() }); buf = '' }
    for (const p of paras) {
      if ((buf + '\n\n' + p).length > 900 && buf) flush()
      if (p.length > 900) { for (let i = 0; i < p.length; i += 800) { buf = p.slice(i, i + 900); flush() } } else buf = buf ? buf + '\n\n' + p : p
    }
    flush()
  }
  for (const c of chunks) {
    let score = 0
    for (const t of terms) score += (c.text.split(t).length - 1) * 5 + (c.title.includes(t) ? 3 : 0)
    for (const g of grams) if (c.text.includes(g)) score += 1
    c.score = score
  }
  const hits = chunks.filter((c) => c.score >= 3).sort((a, b) => b.score - a.score)
  const out = []
  let size = 0
  for (const c of hits) {
    if (out.length >= 12 || size + c.text.length > 12000) break
    out.push({ sourceId: c.sourceId, title: c.title, provenance: c.provenance, text: c.text })
    size += c.text.length
  }
  return out
}

// 완료된 영상의 형식(장면 수·발화량·길이)만 다음 대본 참고용으로 요약 — 사실은 전달하지 않음
function memoryFrom(jobs) {
  return jobs.filter((j) => j.status === 'rendered' && j.data && j.data.plan).slice(0, 5).map((j) => {
    const p = j.data.plan
    const chars = p.scenes.reduce((a, s) => a + s.narration.length, 0)
    return `목표 ${j.input.seconds}초 · ${j.input.ratio} · ${j.input.audience}: 검수 통과 장면 ${p.scenes.length}개, 발화 ${chars}자${j.data.actualSeconds ? `, 실제 ${j.data.actualSeconds}초` : ''}`
  })
}

// ─────────────────────────── 상태 조회 ───────────────────────────
async function state(env, opt = {}) {
  const [secrets, settingsRows, sources, jobs] = await Promise.all([
    sb(env, 'studio_secrets?select=provider,model,checked_at'),
    sb(env, 'studio_settings?select=data&id=eq.1'),
    sb(env, 'studio_sources?select=*&order=created_at.desc'),
    sb(env, 'studio_jobs?select=*&order=created_at.desc&limit=50'),
  ])
  const sec = {}
  for (const p of ['claude', 'openai', 'heygen']) {
    const r = secrets.find((x) => x.provider === p)
    sec[p] = { configured: !!r, model: (r && r.model) || '', checkedAt: (r && r.checked_at) || '' }
  }
  const settings = { ...DEFAULT_SETTINGS, ...((settingsRows[0] && settingsRows[0].data) || {}) }
  const readiness = {
    claude: sec.claude.configured && !!sec.claude.model,
    openai: sec.openai.configured && !!sec.openai.model,
    heygen: sec.heygen.configured,
  }
  if (opt.raw) return { secrets: sec, readiness, settings, sourcesFull: sources, sources, jobs }
  return {
    connections: sec, readiness, settings,
    sources: sources.map((s) => ({ id: s.id, title: s.title, provenance: s.provenance, content: s.content, approved: s.approved ? 1 : 0, created: s.created_at })),
    jobs: jobs.map(toJob),
    learningCount: jobs.filter((j) => j.status === 'rendered').length,
  }
}
function readinessProblems(st) {
  const out = []
  if (!st.readiness.claude) out.push('Claude 연결')
  if (!st.readiness.openai) out.push('OpenAI 연결')
  if (!st.readiness.heygen) out.push('HeyGen 연결')
  if (!st.settings.avatarId || !st.settings.voiceId) out.push('아바타·음성 설정')
  if (!st.settings.consent) out.push('아바타 사용 동의')
  if (!st.sourcesFull.some((s) => s.approved)) out.push('승인된 브랜드 자료')
  return out
}
function toJob(r) {
  const d = r.data || {}
  return {
    id: r.id, created: r.created_at, status: r.status, step: r.step, revision: r.revision, input: r.input,
    plan: d.plan || null, prompt: d.prompt || '', claude: d.claude || null, openai: d.openai || null,
    videoUrl: d.videoUrl || '', actualSeconds: d.actualSeconds || null, error: d.error || '',
    events: d.events || [], sources: d.sources || [], memory: d.memory || [],
    models: d.models || { claude: '', openai: '' }, promptVersion: d.promptVersion || PROMPT_VERSION,
  }
}
function validateInput(i) {
  i = i || {}
  const keywords = String(i.keywords || '').trim()
  const audience = String(i.audience || '').trim()
  const seconds = Number(i.seconds)
  if (keywords.length < 2 || keywords.length > 1000) throw new HttpError(400, '영상 주제 키워드를 2자 이상 입력해 주세요.')
  if (audience.length < 2 || audience.length > 200) throw new HttpError(400, '시청 대상을 선택해 주세요.')
  if (![30, 60, 90, 120, 180, 300].includes(seconds)) throw new HttpError(400, '목표 영상 길이가 올바르지 않습니다.')
  if (!['16:9', '9:16'].includes(i.ratio)) throw new HttpError(400, '화면 비율이 올바르지 않습니다.')
  return { keywords, audience, seconds, ratio: i.ratio }
}
async function getSettings(env) {
  const rows = await sb(env, 'studio_settings?select=data&id=eq.1')
  return { ...DEFAULT_SETTINGS, ...((rows[0] && rows[0].data) || {}) }
}

// ─────────────────────────── 인증 · 저장 · 암호화 ───────────────────────────
async function requireAdmin(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, '로그인이 필요합니다.')
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_SERVICE_ROLE, authorization: 'Bearer ' + token } })
  if (!r.ok) throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.')
  const user = await r.json()
  const prof = await sb(env, 'profiles?select=role&id=eq.' + user.id)
  if (!prof.length || prof[0].role !== 'admin') throw new HttpError(403, '관리자 계정만 사용할 수 있는 비공개 작업실입니다.')
  return user
}

async function sb(env, path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (prefer) headers.prefer = prefer
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  if (!r.ok) {
    if (/studio_/.test(text) && /does not exist|schema cache/.test(text)) throw new HttpError(500, '작업실 테이블이 없습니다. db/schema.sql 을 먼저 실행해 주세요.')
    throw new Error('DB 오류(' + r.status + '): ' + text.slice(0, 300))
  }
  return text ? JSON.parse(text) : null
}

async function getKey(env, provider, required = true) {
  const rows = await sb(env, 'studio_secrets?select=cipher,iv&provider=eq.' + provider)
  if (!rows.length) {
    if (required) throw new HttpError(400, `${provider === 'claude' ? 'Claude' : provider === 'openai' ? 'OpenAI' : 'HeyGen'} API 연결을 먼저 저장해 주세요.`)
    return ''
  }
  return decrypt(env, rows[0].cipher, rows[0].iv)
}
async function aesKey(env) {
  if (!env.STUDIO_ENC_KEY) throw new HttpError(500, '서버 암호화 키(STUDIO_ENC_KEY)가 설정되지 않았습니다.')
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.STUDIO_ENC_KEY))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text))
  return { cipher: b64(new Uint8Array(buf)), iv: b64(iv) }
}
async function decrypt(env, cipher, iv) {
  try {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(cipher))
    return new TextDecoder().decode(buf)
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(500, '저장된 API 키를 복호화하지 못했습니다(STUDIO_ENC_KEY 가 바뀌었다면 키를 다시 저장해 주세요).')
  }
}

// ─────────────────────────── 공통 ───────────────────────────
function serveStatic(path) {
  const name = path === '/' || path === '' ? 'index.html' : path.replace(/^\/+/, '')
  const body = STATIC_FILES[name]
  if (body == null) return new Response('Not found', { status: 404 })
  const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html'
  return new Response(body, { headers: { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-cache' } })
}
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } })
}
function now() { return new Date().toISOString() }
function ev(text) { return { time: now(), text } }
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim() }
function apiError(out, status) {
  const e = out && (out.error || out.message)
  const m = typeof e === 'string' ? e : e && (e.message || e.detail || e.code)
  return (m ? String(m) : 'HTTP ' + status).slice(0, 300)
}
function b64(bytes) { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b) }); return btoa(s) }
function unb64(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)) }
