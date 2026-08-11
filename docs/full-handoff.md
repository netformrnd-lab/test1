# 아파트스퀘어 전체 인수인계 문서

> 아파트·공동주택 보수공사 **감리(監理) 서비스** 전체 코드입니다. **앱(입주민·관리소장·감리사)** + **관리자 대시보드** + **DB(Supabase)** 를 모두 담았습니다.
> 서비스운영팀(Claude Code)이 전체를 유지·수정할 수 있도록 구조·배포·주의사항을 정리했습니다.

---

## 1. 무엇인가

방수·도장·에폭시 아파트 보수공사의 감리를, **관리소장·입주민이 앱에서 직접 확인**하게 만든 서비스.
감리사가 현장을 확인·기록하면 그게 곧바로 단지 앱에 공유됩니다. 운영은 관리자 대시보드에서 합니다.

## 2. 폴더 구조

```
app/
  index.html          입주민·관리소장·감리사 앱 (한 SPA, 로그인 역할에 따라 화면 전환)
  js/
    supabase-app.js   앱 메인 로직 (화면·데이터·채팅·리플렛 등)  ★가장 큼
    app.js            화면 전환(폰 프레임)·해시 라우팅 기초
    stages.js         공법·공정 단계 정의(STAGE_SETS) + 동(棟) 파싱 유틸
  css/app.css         앱 스타일
  admin/index.html    관리자 대시보드 (백오피스)  ← 자세한 건 admin-handoff.md
  assets/             이미지·아이콘·로고
  inspect/            현장 점검 위젯(공개)
  form/               관리소장 작성 폼(공개)
  present/            발표용(앱을 큰 폰으로 iframe)
  manifest.json       PWA(홈 화면 추가)
  privacy.html        개인정보처리방침(공개 · 구글 플레이용)
backend/*.sql         Supabase 테이블·RLS·함수 정의
build-deploy.js       배포 빌드 스크립트
docs/                 문서(이 파일 + admin-handoff.md)
```

## 3. 크게 두 부분

### ⓐ 앱 — `app/index.html` + `app/js/*`
- **한 개의 SPA**. `<section class="screen" id="sNN">` 들이 있고, `window.showScreen('sNN')`으로 전환.
- **로그인 역할(profiles.role)에 따라 자동 라우팅** (`route()` in supabase-app.js):
  - `auditor`(감리사) → 담당 단지 대시보드(s07)
  - `resident`/`manager`(입주민·관리소장) → 우리 단지 홈(s11)
  - 비로그인 → 둘러보기 홈(s04)
- 하단 탭: 입주민 = 홈·현장현황·일정·이야기·채팅 / 감리사 = 홈·일정·리플렛·채팅.
- 로직·문구·데이터는 대부분 `supabase-app.js` 에 있습니다.

### ⓑ 관리자 — `app/admin/index.html`
- **별도 페이지**(`배포주소/admin/`). 자체 완결(HTML·CSS·JS 인라인).
- 회원 승인·단지·공지·감리일지·현장사진·일정·리플렛 관리, 현장 사진 ZIP/준공사진첩 PPT 생성 등.
- **자세한 내부 구조·통합 방법은 같은 폴더의 `admin-handoff.md` 참고.**

## 4. Supabase 연결 (앱·관리자 공통)

```
URL : https://gndktayoicegyqyllybk.supabase.co
KEY : sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE   ← 공개용(publishable). 노출돼도 안전(RLS 보호)
```
- 각 파일 상단에서 `window.supabase.createClient(URL, KEY)` 로 접속.
- 권한은 **RLS + `is_admin()`**(`profiles.role='admin'`)로 통제.
- 테이블: profiles, apartments, notices, reports, field_updates, schedules, manager_forms, chat_messages, contracts, surveys, cases, credentials, leaflets, dong_progress.
- 스키마·정책은 `backend/*.sql`. **표/컬럼을 추가·변경하면 이 SQL도 맞춰야** 앱과 어긋나지 않습니다.

## 5. 배포 방법 (Cloudflare Pages, 드래그 업로드)

```
1) 코드 수정 (app/ 안의 파일)
2) node build-deploy.js          → dist-deploy/ 생성 (no-cache·폰트CDN·캐시버스팅 자동)
3) dist-deploy/ 안의 내용을 zip 하거나 폴더째 Cloudflare Pages에 드래그 업로드
```
- **주의**: zip으로 올릴 땐 `index.html`이 zip **맨 위(root)** 에 오게. (dist-deploy 폴더째 감싸지 않기)
- 서버 불필요(정적). `배포주소/`=앱, `배포주소/admin/`=관리자, `배포주소/present/`=발표용, `배포주소/privacy.html`=개인정보.

## 6. 외부 라이브러리 (전부 CDN, 파일 안 `<script>`로 로드)
- Supabase JS(전역) · PDF.js(감리일지·리플렛 PDF 보기) · JSZip(사진 ZIP) · PptxGenJS(준공사진첩 PPT) · Pretendard 폰트(CDN).

## 7. 수정 워크플로우 (Claude Code 기준)
- 앱 로직 → `app/js/supabase-app.js`, 화면 → `app/index.html`
- 관리자 → `app/admin/index.html`
- 공법·공정 → `app/js/stages.js`
- 고친 뒤 `node build-deploy.js` → 배포.
- **문법 확인**: `node --check app/js/supabase-app.js` / 관리자는 `<script>` 블록을 `new Function()`으로 파싱 체크.

## 8. ⚠️ 주의
- **비밀키 금지**: 코드엔 publishable 키만. `service_role` 등 비밀키는 절대 넣지 말 것(넣으면 DB가 뚫림).
- **라이브 운영 DB**에 붙어 있음 → 테스트는 별도 Supabase 복제본 권장.
- **버전 관리**: 여러 명이 만지면 GitHub(같은 저장소)로 pull/push 하는 게 안전. 파일로 주고받을 땐 **한 번에 한 쪽만** 수정.
