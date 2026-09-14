# 아파트스퀘어 — 프로젝트 안내

> 아파트·공동주택 보수공사 **감리(監理) 서비스** 전체 코드입니다.
> **앱(입주민·관리소장·감리사)** + **관리자 대시보드** + **DB(Supabase)** 가 모두 들어 있습니다.
> 이 문서는 "무엇이고, 어떻게 연결돼 있는지" 를 설명합니다. (어떻게 고치는지는 코드를 보면 됩니다)

---

## 1. 무엇인가

방수·도장·에폭시 등 아파트 보수공사의 **감리**를, 관리소장·입주민이 **앱에서 직접 확인**하게 만든 서비스.
감리사가 현장을 확인·기록하면 그게 곧바로 단지 앱에 공유됩니다. 운영은 관리자 대시보드에서 합니다.

세 종류의 사용자:
- **입주민 / 관리소장** — 우리 단지의 감리 진행을 앱에서 봄 (홈·현장현황·일정·이야기·채팅)
- **감리사** — 담당 단지를 관리하고 현장을 기록 (홈·일정·리플렛·채팅)
- **관리자** — 별도 대시보드에서 회원·단지·콘텐츠 전체 운영

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
backend/*.sql         Supabase 테이블·RLS·함수 정의 (DB 구조)
build-deploy.js       배포 빌드 스크립트
docs/                 문서(이 파일 + admin-handoff.md)
```

## 3. 크게 두 부분 — 어떻게 연결되나

**핵심: 앱과 관리자 대시보드는 같은 Supabase DB를 공유합니다.**
관리자가 대시보드에서 넣은 내용이 → 앱에 그대로 보입니다. 감리사가 앱에서 올린 사진이 → 관리자 대시보드에서 관리됩니다.
즉 **DB 테이블이 두 화면을 잇는 다리**입니다.

### ⓐ 앱 — `app/index.html` + `app/js/*`
- **한 개의 SPA**. `<section class="screen" id="sNN">` 화면들이 있고, `window.showScreen('sNN')`으로 전환.
- **로그인 역할(profiles.role)에 따라 자동 라우팅** (`route()` in supabase-app.js):
  - `auditor`(감리사) → 담당 단지 대시보드
  - `resident`/`manager`(입주민·관리소장) → 우리 단지 홈
  - 비로그인 → 둘러보기 홈
- 하단 탭: 입주민 = 홈·현장현황·일정·이야기·채팅 / 감리사 = 홈·일정·리플렛·채팅.
- 로직·문구·데이터는 대부분 `supabase-app.js` 에 있습니다.

### ⓑ 관리자 — `app/admin/index.html`
- **별도 페이지**(`배포주소/admin/`). 자체 완결(HTML·CSS·JS 인라인).
- 회원 승인·단지·공지·감리일지·현장사진·일정·리플렛 관리, 현장 사진 ZIP/준공사진첩 PPT 생성 등.
- **내부 구조는 같은 폴더의 `admin-handoff.md` 에 표로 정리**(메뉴 = 화면 = 함수 = 테이블).

## 4. Supabase 연결 (앱·관리자 공통)

```
URL : https://gndktayoicegyqyllybk.supabase.co
KEY : sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE   ← 공개용(publishable). 노출돼도 안전(RLS 보호)
```
- 각 파일 상단에서 `window.supabase.createClient(URL, KEY)` 로 접속.
- 권한은 **RLS + `is_admin()`**(`profiles.role='admin'`)로 통제. admin이 아니면 관리자 데이터가 안 보이고 수정도 막힘.

### 데이터 테이블 (앱 ↔ 관리자를 잇는 다리)

| 테이블 | 무슨 데이터 | 앱에서 | 관리자에서 |
|---|---|---|---|
| `profiles` | 회원·역할(입주민/관리소장/감리사/관리자) | 로그인 주체 | 회원 승인·역할 배정 |
| `apartments` | 단지 정보(공법·공정·지역) | 우리 단지 표시 | 단지 등록·배정 |
| `notices` | 공지 | 홈 공지 | 공지 작성 |
| `reports` | 감리일지(PDF) | 감리일지 보기 | 일지 업로드 |
| `field_updates` | 현장 사진·글 | 현장현황 | 사진 관리·ZIP·PPT |
| `schedules` | 공사 일정 | 일정 달력 | 일정 등록 |
| `manager_forms` | 관리소장 작성지 | — | 작성지 확인 |
| `chat_messages` | 채팅 | 채팅 탭 | 채팅 응대 |
| `contracts` | 계약서 | — | 계약서 관리 |
| `surveys` | 만족도 | 설문 | 결과 집계 |
| `cases` | 우수 사례 | 둘러보기 | 사례 등록 |
| `credentials` | 인증서·이력 | 회사 소개 | 인증 등록 |
| `leaflets` | 리플렛(이미지·PDF) | 감리사 리플렛 탭 | 리플렛 업로드 |
| `dong_progress` | 동별 진행 | 진행 현황 | 동별 관리 |

> 스키마·정책은 `backend/*.sql`. 처음 세팅할 땐 `backend/migration-SETUP-ALL.sql` 하나로 전체 구성됩니다.

## 5. 배포 방법 (Cloudflare Pages, 드래그 업로드)

```
1) 코드 수정 (app/ 안의 파일)
2) node build-deploy.js          → dist-deploy/ 생성 (no-cache·폰트CDN·캐시버스팅 자동)
3) dist-deploy/ 안의 내용을 zip 하거나 폴더째 Cloudflare Pages에 드래그 업로드
```
- **주의**: zip으로 올릴 땐 `index.html`이 zip **맨 위(root)** 에 오게. (dist-deploy 폴더째 감싸지 않기)
- 서버 불필요(정적). `배포주소/`=앱, `배포주소/admin/`=관리자, `배포주소/present/`=발표용, `배포주소/privacy.html`=개인정보.

## 6. 외부 라이브러리 (전부 CDN, 파일 안 `<script>`로 로드)
Supabase JS(전역) · PDF.js(감리일지·리플렛 PDF 보기) · JSZip(사진 ZIP) · PptxGenJS(준공사진첩 PPT) · Pretendard 폰트(CDN).

## 7. ⚠️ 주의
- **라이브 운영 DB에 붙어 있음** → 실수로 회원·단지를 지우면 실제 데이터가 사라짐. **테스트는 별도 Supabase 복제본** 권장.
- **비밀키 금지**: 코드엔 publishable 키만. `service_role` 등 비밀키는 절대 넣지 말 것(넣으면 DB가 뚫림).
- **DB 구조를 바꾸면** `backend/*.sql`과 앱/관리자 코드가 서로 맞아야 함(테이블·컬럼 이름 일치).
