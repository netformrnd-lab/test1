# 아파트스퀘어 관리자 대시보드 — 구조 안내

> 관리자 대시보드가 **무엇이고, 어떻게 구성돼 있는지** 설명하는 문서입니다.
> (어떻게 고칠지는 코드를 보면 되고, 이 문서는 "어디에 무엇이 있는지" 지도 역할)

---

## 1. 이게 뭔가요

**아파트스퀘어 관리자 대시보드** — 입주민·감리사용 앱의 **뒷단(백오피스)**.
회원 승인·단지 배정·공지·감리일지·현장사진·일정·리플렛 등 **앱에 보이는 모든 콘텐츠를 여기서 관리**합니다.

- 배포 주소: `https://<배포도메인>/admin/`
- 접속: **관리자 계정으로 로그인** (profiles.role = 'admin' 인 계정만)
- 앱과 **같은 Supabase DB**를 공유 → 여기서 넣은 게 앱에 보이고, 앱에서 올라온 게 여기서 관리됨.

## 2. 파일 구성

| 파일 | 역할 |
|---|---|
| `admin/index.html` | 대시보드 본체 — HTML·CSS·JS 전부 인라인 (자체 완결) |
| `js/stages.js` | 공법·공정 단계 정의 (`STAGE_SETS`) — 단지 관리·PPT에서 사용. `../js/stages.js`로 참조 |
| `assets/apartsquare-logo.png` | 준공사진첩 PPT에 넣는 로고. `../assets/apartsquare-logo.png`로 참조 |
| `backend/*.sql` | Supabase 테이블·RLS·함수 정의 (DB 구조) |

> 외부 라이브러리(모두 CDN): **Supabase JS**, **JSZip**(사진 ZIP), **PptxGenJS**(준공사진첩 PPT).
> 배포 구조 `배포루트/admin/index.html` + `배포루트/js/…` + `배포루트/assets/…` 를 유지해야 상대경로가 맞습니다.

## 3. 화면 구성 (메뉴)

- 좌측 사이드바 **카테고리 5개**: 대시보드 · 운영관리 · 현장관리 · 입주민소통 · 홍보자료
- 카테고리를 누르면 콘텐츠 상단에 **탭**이 뜨고, 탭으로 하위 화면 전환.
  - 운영관리: 회원 관리 · 단지 관리
  - 현장관리: 감리일지 · 현장 현황 · 공사 일정 · 소장님 작성지 · 계약서
  - 입주민소통: 공지사항 · 채팅 · 만족도
  - 홍보자료: 우수 사례 · 인증·이력 · 리플렛

### 눈에 띄는 기능
- **현장 사진 다운로드**: 전체/날짜별/공정별 → 날짜·공정 폴더로 정리한 **ZIP**
- **준공사진첩 PPT 자동 생성**: 표지 + 공정 단계별 2×2 사진 슬라이드 (`.pptx`)
- 관리자 비밀번호 변경·재설정, 폰 반응형

## 4. Supabase 연결

```
URL : https://gndktayoicegyqyllybk.supabase.co
KEY : sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE   ← 공개용(publishable). 노출돼도 안전(RLS 보호)
```
- publishable(anon) 키라 코드에 그대로 있어도 됩니다. (service_role 같은 비밀키 아님)
- 권한은 **RLS + `is_admin()`**(`profiles.role='admin'`). admin이 아니면 데이터가 안 보이고 수정도 막힘. (`gate()` 함수가 문지기)

## 5. 대시보드 지도 (메뉴 = 화면 = 함수 = 테이블)

상단 탭(`<button data-sec="XXX">`)을 누르면 해당 화면(`<section id="sec-XXX">`)이 보이고,
그 데이터는 같은 이름의 테이블에서 오며, `renderXXX()` / `loadXXXAdmin()` 함수가 그립니다.

| 메뉴 | data-sec | 테이블 | 주요 함수(검색 키워드) |
|---|---|---|---|
| 대시보드(요약) | `overview` | 여러 개 | `renderOverview`, `renderPending` |
| 회원 관리 | `members` | profiles | `renderMembers`, `approve`, `saveMember`, `deleteMember` |
| 단지 관리 | `apts` | apartments, dong_progress | `renderApts`, `saveApt`, `deleteApt`, `methodOpts`/`stageOpts` |
| 감리일지 | `reports` | reports | `renderReports` |
| 현장 현황 | `field` | field_updates | `renderField`, `fieldRowHtml`, `deleteField` |
| 공사 일정 | `schedules` | schedules | 일정 관리 함수 |
| 소장님 작성지 | `mgrforms` | manager_forms | 소장 폼 함수 |
| 계약서 | `contract` | contracts | `loadContractsAdmin` |
| 공지사항 | `notices` | notices | `renderNotices`, `addNotice` |
| 채팅 | `chat` | chat_messages | `loadChatAdmin`, `startChatPoll` |
| 만족도 | `survey` | surveys | `loadSurveysAdmin` |
| 우수 사례 | `cases` | cases | `renderCases` |
| 인증·이력 | `creds` | credentials | `renderCredsAdmin`, `addCredential` |
| 리플렛 | `leaflets` | leaflets | `renderLeafletsAdmin`, `addLeaflet` |

> **패턴 규칙**: 화면 하나 = `sec-XXX` div + `renderXXX/loadXXXAdmin` 함수 + `XXX` 테이블.
> 이 3개만 따라가면 그 기능이 어디서 오고 어디에 그려지는지 다 보입니다.

## 6. 배포
- **정적 파일**. 웹 호스팅(Cloudflare Pages 등)에 올리면 끝. 서버 불필요.
- `admin/index.html` 과 `js/stages.js` 의 **상대경로(`../js/stages.js`)** 를 유지 → `배포루트/admin/…` + `배포루트/js/…` 구조.

## 7. ⚠️ 주의
- **라이브 운영 DB에 붙어 있음.** 테스트하다 회원·단지를 실수로 지우면 실제 데이터가 사라짐 → **별도 Supabase 복제본**에서 테스트 권장.
- **DB를 바꾸는 변경**(새 테이블·컬럼·RLS)은 `backend/*.sql`에도 반영해야 앱과 어긋나지 않음.
