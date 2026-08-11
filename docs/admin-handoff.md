# 아파트스퀘어 관리자 대시보드 — 인수인계 문서

> 서비스운영팀(Claude Code 작업)이 **영업 대시보드에 이 관리자 대시보드를 통합**하기 위한 안내서입니다.
> 이 문서 + 아래 2개 파일만 있으면 이 대시보드가 어떻게 돌아가는지 전부 파악할 수 있습니다.

---

## 1. 이게 뭔가요

**아파트스퀘어 관리자 대시보드**입니다. 입주민·감리사용 앱(아파트스퀘어)의 **뒷단(백오피스)**으로,
회원 승인·단지 배정·공지·감리일지·현장사진·일정·리플렛 등 **앱에 보이는 모든 콘텐츠를 여기서 관리**합니다.

- 배포 주소: `https://<배포도메인>/admin/`  (예: `https://arecm.workers.dev/admin/`)
- 접속: **관리자 계정으로 로그인** (profiles.role = 'admin' 인 계정만)

## 2. 파일 구성 (딱 2개)

| 파일 | 역할 |
|---|---|
| `admin/index.html` | 대시보드 본체 — HTML·CSS·JS 전부 인라인 (약 1,900줄, 자체 완결) |
| `js/stages.js` | 공법·공정 단계 정의 (`STAGE_SETS`) — 단지 관리에서 사용. `../js/stages.js`로 참조 |

> 그 외 의존성 없음. 외부 라이브러리는 **Supabase JS (CDN)** 하나뿐이고 파일 안에서 `<script>`로 불러옵니다.

## 3. Supabase 연결

```
URL : https://gndktayoicegyqyllybk.supabase.co
KEY : sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE   ← 공개용(publishable) 키. 노출돼도 안전(RLS로 보호)
```

- 이 키는 **anon/publishable 키**라 코드에 그대로 있어도 됩니다. (service_role 같은 비밀키 아님)
- 권한은 **RLS + `is_admin()`** 로 통제. `is_admin()` = `profiles.role = 'admin'` 인지 검사.
- 즉 로그인한 계정이 admin이 아니면 데이터가 안 보이고 수정도 막힙니다. (`gate()` 함수가 문지기)

## 4. 사용하는 DB 테이블 (14개)

`profiles`(회원·역할), `apartments`(단지), `notices`(공지), `reports`(감리일지),
`field_updates`(현장 사진·글), `schedules`(일정), `manager_forms`(소장 작성지),
`chat_messages`(채팅), `contracts`(계약서), `surveys`(만족도), `cases`(우수 사례),
`credentials`(인증서), `leaflets`(리플렛), `dong_progress`(동별 진행).

> 스키마·RLS 정의는 우리 저장소 `backend/*.sql`(migration 파일들)에 있습니다. 새 기능으로 **테이블/컬럼을 추가하려면 이 SQL도 같이 손봐야** 합니다.

## 5. 대시보드 구조 (메뉴 = 섹션 = 함수)

좌측 사이드바 메뉴(`<a data-sec="XXX">`)를 누르면 해당 섹션(`<section id="sec-XXX">`)이 보입니다.
각 섹션의 데이터는 같은 이름의 테이블에서 오고, `renderXXX()` / `loadXXXAdmin()` 함수가 그립니다.

| 메뉴 | data-sec | 테이블 | 주요 함수(검색 키워드) |
|---|---|---|---|
| 대시보드(요약) | `overview` | 여러 개 | `renderOverview`, `renderPending` |
| 회원 관리 | `members` | profiles | `renderMembers`, `approve`, `saveMember`, `deleteMember` |
| 단지 관리 | `apts` | apartments, dong_progress | `renderApts`, `saveApt`, `deleteApt`, `methodOpts`/`stageOpts` |
| 공지사항 | `notices` | notices | `renderNotices`, `addNotice` |
| 감리일지 | `reports` | reports | `renderReports` |
| 현장 현황 | `field` | field_updates | `renderField`, `fieldRowHtml`, `deleteField` |
| 공사 일정 | `schedules` | schedules | 일정 관리 함수 |
| 소장님 작성지 | `mgrforms` | manager_forms | 소장 폼 함수 |
| 채팅 | `chat` | chat_messages | `loadChatAdmin`, `startChatPoll` |
| 계약서 | `contract` | contracts | `loadContractsAdmin` |
| 만족도 | `survey` | surveys | `loadSurveysAdmin` |
| 우수 사례 | `cases` | cases | `renderCases` |
| 인증·이력 | `creds` | credentials | `renderCredsAdmin`, `addCredential` |
| 리플렛 | `leaflets` | leaflets | `renderLeafletsAdmin`, `addLeaflet` |

> **패턴 규칙**: 섹션 하나 = `sec-XXX` div + `renderXXX/loadXXXAdmin` 함수 + `XXX` 테이블.
> 기능 하나를 빼내려면 이 3개(HTML 섹션 + 함수 + 테이블 접근)만 따라가면 됩니다.

## 6. 배포 방법

- 지금은 **정적 파일**이라, 파일을 웹 호스팅(Cloudflare Pages 등)에 올리면 끝. 서버 불필요.
- `admin/index.html` 과 `js/stages.js` 의 **상대경로(`../js/stages.js`)** 를 유지해야 합니다.
  → 즉 `배포루트/admin/index.html` + `배포루트/js/stages.js` 구조로 두세요.

---

## 7. 통합 시나리오 (서비스운영팀이 하려는 것)

### (A) 영업 대시보드 → "대외보기" 누르면 이 관리자 대시보드 열기

**가장 안전한 방법 = 그냥 링크로 연다.** (복사·중복 없음 → 나중에 갈라질 일 없음)

```html
<!-- 영업 대시보드에 넣을 버튼 -->
<button onclick="window.open('https://<배포도메인>/admin/', '_blank')">대외보기</button>
```

또는 화면 안에 끼워 보이고 싶으면 iframe:

```html
<iframe src="https://<배포도메인>/admin/" style="width:100%;height:100%;border:none"></iframe>
```

- 이 관리자 대시보드는 **로그인이 필요**하므로, 열면 관리자 로그인 화면이 뜹니다. (별도 SSO 연동은 추가 작업)
- 이 방식이면 우리 관리자 대시보드는 **그대로 두고**(원본 1개 유지), 영업 대시보드는 버튼만 추가하면 됩니다.

### (B) 이 대시보드에서 기능 하나를 빼서 영업 대시보드에 넣기

1. `admin/index.html`에서 그 기능의 **섹션(`sec-XXX`)** 과 **함수(`renderXXX` 등)** 를 찾는다 (위 5번 표 참고).
2. 그 섹션 HTML + 관련 함수 + 그 함수가 쓰는 **Supabase 쿼리(`sb.from('XXX')...`)** 를 통째로 복사.
3. 영업 대시보드에서도 **같은 Supabase 클라이언트(위 3번 URL·KEY)** 로 접속하면 동일하게 동작.
4. 그 기능이 admin 전용이면 영업 대시보드 계정도 `is_admin()`을 통과해야 데이터가 보입니다.

> Claude Code에게 이렇게 시키면 됩니다: *"admin/index.html에서 `sec-<메뉴>` 섹션과 `render<메뉴>`·관련 함수를 찾아, 우리 영업 대시보드에 이식해줘. Supabase는 같은 프로젝트(URL·publishable key)를 쓴다."*

---

## 8. ⚠️ 꼭 지킬 것

1. **원본은 하나로.** 관리자 대시보드 전체를 복사해서 두 곳에서 각자 고치면 **버전이 갈라져 충돌**합니다.
   → 통째로 쓰려면 **(A) 링크/iframe**, 일부만 필요하면 **(B) 그 기능만 추출**. 전체 복제는 비권장.
2. **라이브 운영 DB에 붙어 있음.** 테스트하다 회원·단지를 실수로 지우면 실제 데이터가 사라집니다.
   → 테스트는 **별도 Supabase 복제 프로젝트**에서 하는 걸 권장.
3. **기능 추가(새 항목·연동)는 DB도 같이 바뀜.** 새 테이블·컬럼·RLS는 `backend/*.sql`에 반영해야 앱과 어긋나지 않습니다.
4. **누가 언제 수정할지 정하기.** 양쪽 다 Claude Code로 작업하니, 관리자 파일 담당을 한쪽으로 정하면 깔끔합니다.

## 9. 요약

- 넘길 것: `admin/index.html` + `js/stages.js` + 이 문서.
- "대외보기" = 우리 `/admin/`을 **링크로 열기**(제일 안전).
- 기능 이식 = 섹션+함수+쿼리만 추출, **같은 Supabase** 로 접속.
- DB 바꾸는 변경은 우리 쪽과 협의(SQL 동기화).
