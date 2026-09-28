# 영상 제작 작업실 (Video Studio)

원본 화면: `https://reelty-ai-video-studio.pour-9320.chatgpt.site/`. 이 사이트의 화면·문구·흐름을 옮겼습니다.

기존 아파트스퀘어 앱(`app/`)과 **분리된 독립 프로젝트**입니다. Cloudflare Worker 하나로 배포합니다.
로그인만 기존 아파트스퀘어 Supabase의 관리자 계정을 함께 씁니다.

```
video-studio/
├─ deploy/worker.js                                   ★ Cloudflare 에 붙여넣을 파일 (화면+API 합본, 자동 생성)
├─ index.html · studio.css · studio.js · config.js   화면 원본
├─ worker/worker.js                                   서버 API 원본
├─ build.mjs                                          원본 → deploy/worker.js 합치기 (node build.mjs)
└─ db/schema.sql                                      Supabase 테이블
```

## 설치 (한 번만)

1. **Supabase**: SQL Editor에서 `db/schema.sql`을 실행합니다.
2. **Cloudflare Worker 만들기**: Workers & Pages → Create → Worker(Hello World) → Deploy 순서로 누른 뒤 **Edit code**를 누릅니다.
   편집기에 있는 내용을 모두 지우고 `deploy/worker.js` 내용 전체를 붙여 넣은 다음 **Deploy**를 누릅니다. Pages가 아니라 Worker로 만들어야 합니다.
3. 그 Worker의 Settings → Variables and Secrets에서 아래 3개를 Secret으로 추가합니다.
   - `SUPABASE_URL` = `https://gndktayoicegyqyllybk.supabase.co`
   - `SUPABASE_SERVICE_ROLE` = Supabase service_role 키
   - `STUDIO_ENC_KEY` = 아무 긴 비밀 문자열. API 키 암호화에 쓰며, 바꾸면 저장된 키를 다시 등록해야 합니다.
4. Worker 주소(`https://이름.계정.workers.dev`)를 열고 관리자 계정으로 로그인합니다. 화면과 API가 이 주소 하나에서 같이 동작합니다.
   **연결 설정** 탭에서 Claude·OpenAI·HeyGen 키를 저장하고, 아바타를 선택한 뒤 사용 동의에 체크하고 저장합니다.
5. **브랜드 자료실**에 근거 자료를 등록하고 "영상 제작 근거로 사용"을 체크합니다.

코드를 고친 뒤에는 `node build.mjs`를 실행해 `deploy/worker.js`를 다시 만들고, Worker에 다시 붙여 넣습니다.

## 제작 흐름

자료 검색 → Claude 대본 작성 → Claude 검수 → OpenAI 검수 → 판정 → HeyGen 제작 요청 → 렌더링 확인

- 판정에서 떨어지면 지적 사항을 반영해 대본을 자동으로 고치고 다시 검수합니다(최대 2회). 그래도 떨어지면 **자동 보류**하고, 영상은 만들지 않으며 비용도 발생하지 않습니다.
- 화면이 열려 있는 동안 1.2초마다 한 단계씩 진행합니다. HeyGen 접수 뒤 렌더링은 창을 닫아도 계속됩니다.

## 서버에서 강제하는 규칙 (화면을 우회해도 적용)

- 관리자(`profiles.role = 'admin'`)만 사용할 수 있습니다.
- API 키는 AES-GCM으로 암호화해 저장하고 화면으로 다시 내려보내지 않습니다. DB 테이블은 RLS가 켜져 있고 정책이 없어서, service_role 키로만 접근됩니다.
- 제작 시작 조건: 3개 서비스 연결, 아바타·음성 설정, 사용 동의, 승인 자료 1개 이상.
- 하루 접수 한도(UTC 기준)가 있고, 진행 중인 작업은 1개로 제한합니다. 같은 요청 번호가 다시 오면 기존 작업을 돌려줍니다.
- 대본의 인용문은 승인 자료 원문과 **글자 그대로** 일치해야 합니다. 서버가 직접 대조하며, 불일치하면 검수 미통과로 처리합니다.
- 통과 조건: Claude와 OpenAI 양쪽 모두 4개 항목(근거·브랜드·전달·제작)이 90점 이상이고 지적이 0건이어야 합니다.
- HeyGen 요청 결과가 불확실하면 자동으로 다시 요청하지 않고 "중복 방지로 중단" 상태로 멈춥니다. 이중 과금을 막기 위한 조치입니다.

## 원본과 다른 점 · 추정 구현

원본 서버 코드는 받지 못했습니다. 받은 것은 화면 번들뿐이라, 아래 항목은 화면에 보이는 계약(API 요청·응답 형식)에 맞춰 새로 구현했습니다.

- 로그인: 원본은 ChatGPT 로그인이었지만, 여기서는 기존 아파트스퀘어 Supabase 관리자 로그인을 씁니다.
- 자료 검색: 키워드 단어와 한글 2글자 조각이 겹치는 정도로 단락을 고르는 방식입니다. 원본의 검색 방식은 알 수 없습니다.
- HeyGen 아바타 목록: `avatar_group.list`로 가져오고, 실패하면 `/v2/avatars`의 사진 아바타 목록을 씁니다. 실제 계정에서 한 번 확인이 필요합니다.
- 대본·검수 프롬프트 문구는 새로 작성했습니다.
- 완성 영상의 화면·발음·자막 품질 자동 검증은 원본과 마찬가지로 제공하지 않습니다.
