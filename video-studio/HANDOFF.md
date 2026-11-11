# 영상 제작 작업실 — 인수인계 (새 Claude 계정에서 이어서 작업하기)

마지막 정리: 2026-11-10 · 작업 브랜치 `claude/bold-mayer-pylpse` (저장소 `netformrnd-lab/test1`)

새 세션을 열면 먼저 이 파일과 `video-studio/README.md` 를 읽고 시작합니다.

## 1. 무엇인가

아파트스퀘어 홍보 영상을 만드는 **독립 작업실**입니다. 아파트스퀘어 앱(`app/`)과는 분리돼 있고, 아파트스퀘어(Supabase) **관리자 계정**으로만 들어갑니다.

흐름: 키워드 입력 → Claude 대본 작성 → Claude 검수(자동 수정 최대 2회) → **"검수 완료 · 제작 대기"에서 멈춤** → 사람이 프롬프트를 확인하고 "영상 제작 시작"을 눌러야만 제작
- 아바타가 필요하면 **HeyGen**(조현식 이사 아바타)
- 아바타 없는 영상은 **Manus**(자료를 스스로 찾아 영상 구성)

## 2. 주소·배포

| 항목 | 내용 |
|---|---|
| 작업실 주소 | **https://video-studio.squarecm.workers.dev/** (Cloudflare Workers 무료 플랜) |
| 자동 배포 | `video-studio/**` 를 고쳐 push 하면 `.github/workflows/deploy-studio-cf.yml` 이 배포 |
| 데이터 | Supabase(`gndktayoicegyqyllybk`) Storage 비공개 버킷 `studio` — settings.json, secrets.json(API 키 AES-GCM 암호화), sources.json, jobs.json, photos.json, hubguide.json, files/, briefs/, pdfcache/ |
| 예전 주소 | Firebase `test-168a4` (`…cloudfunctions.net/studio/`) — 2026-11-09부터 Google 결제 문제로 배포 거절. 사용자가 **비용을 내지 않기로 해서** Cloudflare로 옮김. Firebase 배포 워크플로는 수동 실행만 가능하게 해 둠 |

GitHub Secrets(값은 저장소 설정에만 있음): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`

**API 키 암호화 키는 `SUPABASE_SERVICE_ROLE_KEY` 에서 만듭니다.** 이 값이 바뀌면 작업실에 저장된 Claude·Manus·HeyGen·허브 키를 다시 넣어야 합니다.

## 3. 코드 구조

- `video-studio/worker/worker.js` — 서버 전부(API·제작 단계·프롬프트). Workers 형식 `fetch(request, env)`
- `video-studio/studio.js`, `index.html`, `studio.css` — 화면
- `video-studio/build.mjs` → `deploy/worker.js` (화면·용어사전·로고를 한 파일로 합침)
- `video-studio/terms.json` — 용어 사전·금지어(옛 2026-09-23 브랜드북 규칙은 삭제, 화면 색·서체만 남음)
- `video-studio/cloudflare/wrangler.toml` — Cloudflare 설정
- `video-studio/tools/check.mjs` + `studio-check.yml` — 실제 저장소·허브 상태 점검. push 하거나 수동 실행하면 Actions 로그로 확인
- `video-studio/tools/test/run.sh` — **자체 시험**(외부 API는 가짜 응답, 현재 29개 통과). 고친 뒤 push 전에 꼭 실행

## 4. 연결된 외부 서비스

- **Claude**: 대본 작성·검수, PDF 읽기(`claude-haiku-5-5`, 없으면 설정 모델). OpenAI 교차 검수는 크레딧이 없어서 **꺼 둠**(Claude 단독 검수)
- **Manus API v1**: `POST https://api.manus.ai/v1/tasks`(헤더 `API_KEY`). 메시지 5,000토큰 제한이 있어서 긴 지시서는 `/brief/<작업ID>/<토큰>.txt` 로 올리고 주소만 보냄
- **HeyGen**: 아바타 영상(Video Agent 모드 기본)
- **브랜드 허브(NAS)**: `https://netformrnd.synology.me/brand/studio-feed.php`. 키는 작업실 연결 설정에 암호화 저장(**코드에 키를 넣지 말 것**)
  - `action=brands` → 브랜드별 `톤·가이드`(긴 최신 브랜드 가이드)·자료·문서 목록, `받은때`
  - `action=search&q=` → NAS 내용 검색 `{results:[{name,path,text}]}`
  - `action=file&path=` → 원본 파일
- **브랜드 기준 우선순위**: ① 작업실 자료실에 관리자가 직접 올린 승인 브랜드 자료(제목에 브랜드·소개·가이드·지침, 최신순, 최대 4개) → ② 허브 톤·가이드. 단, 아래 5번의 관리자 지시가 모든 자료보다 우선. 2026-09-23 내장 브랜드북 규칙·금지어는 사용자 요청으로 삭제함(terms.json 에는 화면 색·서체만 남음). NAS를 영상 키워드로 검색해 관련 문서 최대 6개를 원본으로 읽어 근거로 씀. 허브 문서 제목으로도 원본을 찾아 읽음
- **앱 테스트 계정**: 연결 설정의 ‘아파트스퀘어 앱 테스트 계정’(앱 주소 기본값 `https://floral-cherry-6860.squarecm.workers.dev`, 아이디, 비밀번호는 secrets.app 에 암호화 저장). Manus 로 보낼 때만 비공개 지시서(briefs/)에 로그인 정보를 넣어, Manus 가 앱에 로그인해 실제 화면을 녹화해서 앱 장면에 쓰게 함(보기만, 개인정보 흐리게, 계정 노출 금지). 화면용 프롬프트·작업 기록에는 비밀번호를 남기지 않음
- **NAS 검색 결과의 대부분이 POUR·포어스토어 자료** → 다른 브랜드 폴더·본문(POUR/포어/pourstore 등)과 코드 파일은 자동으로 제외

## 5. 사용자가 정한 원칙 (꼭 지킬 것)

- 아파트스퀘어 영상에 **POUR가 나오면 안 됨**
- 브랜드북: 감리는 직접 점검·검사·측정을 하지 않음, 결과를 약속하지 않음, 독자를 직접 부르지 않음, 근거 없는 최상급 표현 금지 등(허브 가이드가 최신 기준)
- **크레딧 낭비 금지**: 항상 제작 직전에 멈추고, 사람이 "영상 제작 시작"을 눌러야 함
- 보류된 대본은 사람이 직접 고치지 않고 **AI가 다시 고치게**("AI가 다시 수정·검수" 버튼)
- Manus는 자료를 스스로 찾게 맡김. 사진만이 아니라 **움직이는 영상**
- **정체 표기 문구 금지**: "…전문감리기관입니다", "공동주택 유지보수 전문감리기관"은 대사·자막·제목·엔딩 어디에도 넣지 않음(금지어 등록). 회사 이름은 "아파트스퀘어"만
- **엔딩·연락처는 전화번호 1600-6069 만**. 홈페이지·문의 링크(aptsquare.net 등) 넣지 않음(금지어 등록). 엔딩은 화이트 카드: 고정 문구 "저렴하다고 좋은 게 아닙니다. 중요한 건 '결과'입니다." + 1600-6069 + 로고
- **현장 장면 = 사람이 사는 기존 아파트의 유지보수 공사**(오래된 외벽 곤돌라 재도장, 기존 옥상 방수, 지하주차장 바닥, 균열 보수, 주민·차량). **신축 현장 금지**(타워크레인·철근·골조·건물 전체 비계·안전망·터파기)
- **앱 장면 = 실제 앱 녹화**(테스트 계정 로그인). 가짜로 따라 그린 앱 화면 금지
- **그래픽은 쓰되 내레이션에 맞는 것만**: 실제 녹화 위 강조 박스·화살표·확대·키네틱 타이포·비교 그래픽은 권장. 내레이션에 없는 단계·흐름도, 의미 없는 아이콘·도형, 빈 화면은 금지
- 앱 장면 메시지는 기능 나열이 아니라 **"회의·전화로 묻고 기다리지 않아도 앱으로 현장을 바로 확인"**하는 효율
- 화면 구석 상시 로고·장면 라벨 금지(로고는 엔딩 카드에서만), 사무실·회의실 장면은 20% 이하
- 화면에 "AI 생성" 표시 넣지 않음, 전환 길이 제한 없음(부드럽게만)
- 내레이션은 라디오·광고 성우 톤이 아닌 **자연스러운 설명 톤**. 30초 영상은 메시지 1개, 단계 건너뛰기 금지
- 비용이 드는 서비스는 쓰지 않음(그래서 Cloudflare 무료 플랜)
- 사진 대량 업로드는 꺼 둠(`PHOTO_UPLOAD_OFF = true`). 일반 영상이 잘 나오면 Supabase에 다시 열 수도 있음
- 커밋·PR에 AI 모델 이름을 넣지 않음

## 6. 남은 일

1. **Manus 결과 영상 가져오기**: v1 GET 응답에 영상 파일이 없어서 v2 메시지(`task.listMessages`) 등을 탐색하는 코드를 넣어 둠. 실제 완성 작업에서 영상 주소가 어디에 오는지 확인해서 확정해야 함(`tools/check.mjs` 출력 "Manus 추가 주소 응답" 참고)
2. **새 주소에서 실제 동작 확인**: 로그인 → 연결 설정(키 유지 여부, 앱 테스트 계정 저장) → 30초 영상 1건 → 제작 기록의 "브랜드 기준(최우선)…", "NAS 검색 … 근거 N건", PDF 근거 확인 → 완성 영상에서 위 5번 원칙(신축 현장·가짜 앱 화면·홈페이지 주소·정체 표기) 어긴 곳 없는지 확인
2-1. **Claude API 크레딧 부족**(2026-11-10 "credit balance is too low") — 사용자가 Anthropic 콘솔에서 충전하거나 새 계정 키로 교체해야 제작 가능. 호출당 글 양이 많으니(허브 가이드 + 브랜드 자료) 필요하면 줄이기 검토
2-2. 2026-11-10 Manus 결과 영상(60초) 피드백: 신축 현장처럼 보임, 앱 메뉴·조치 단계를 맞지 않는 그래픽으로 만듦, 33초쯤 빈 화면, 엔딩에 홈페이지 주소 → 모두 지시서·대본 규칙·검수 기준에 반영함. 다음 영상에서 실제로 고쳐졌는지 확인 필요
3. Cloudflare 무료 플랜의 계산 시간 제한(요청당 10ms)에 걸리는 곳이 있는지 관찰
4. Cloudflare 대시보드의 "stured" Worker는 다른 저장소에 연결돼 빌드가 실패함 → 삭제 권장(사용자가 할 일)
5. 조현식 이사 목소리를 Manus에 쓰는 방법(미정), HeyGen 아바타에 "AI 아바타" 표기 여부(미정)
6. Firebase 프로젝트 `test-168a4` 결제 계정 정리는 POUR→아스퀘 동기화 함수와 관련 있으니 별도로 판단
