# aptsq-sync — 영업일정 ↔ 아파트스퀘어 양방향 연동

POUR 영업일정 앱(Firebase Realtime Database, `test-168a4`)과 아파트스퀘어
(Supabase)의 **일정만** 양쪽에서 서로 보이고, 어느 쪽에서 넣거나 고쳐도 반대쪽에 반영되게 하는 작은 서비스입니다.

**✅ Firebase 서비스계정/로그인 불필요** — RTDB 권한이 열려 있어(POUR 앱 자체가
로그인 없이 RTDB 를 읽고 쓰는 구조) 데이터베이스 **주소만으로** 접근합니다.
정산·급여·하이웍스 데이터는 **건드리지 않습니다.**

## 어떤 일정이 오가나

| POUR 노드 | 아파트스퀘어 category |
|---|---|
| pt | pt (PT) |
| briefing | bids (현설) |
| sales | sales (영업) |
| seminar | seminar (세미나) |
| personal | personal (개인) |
| meetings | meeting (회의) |
| vacation | vacation (휴가) |
| asq | asq (아스퀘) |

아파트스퀘어의 `work`(공사일정)은 현장 내부용이라 POUR로 내보내지 않습니다.
POUR에서 들어온 일정은 **입주민에게 비공개**(`resident_visible=false`)로 저장돼요.

## 준비물 (딱 하나)

- **Supabase service_role 키** — Supabase → Project Settings → API → `service_role`

그리고 처음 한 번 **`backend/migration-schedule-visibility.sql`** 을 Supabase 에서 실행하세요
(schedules 에 `source / sync_id / ext_updated_at` 컬럼 추가). 이미 하셨으면 넘어가세요.

## 실행

```bash
cd backend/aptsq-sync
cp .env.example .env      # SUPABASE_SERVICE_ROLE_KEY 만 채우면 됨
npm install
npm run once              # 먼저 한 번만 맞춰보기 (점검용)
npm start                 # 상주 = 60초마다 양방향 동기화
```

컴퓨터 없이 돌리려면 GitHub Actions 를 씁니다(`.github/workflows/aptsq-sync.yml`).
Repo → Settings → Secrets 에 **`SUPABASE_SERVICE_ROLE_KEY`** 하나만 넣으면 5분마다 자동 실행돼요.

## 안전장치

- **루프 방지** — POUR에서 온 건 `source='pour'`로 표시해 되돌려 쓰지 않고, 아파트스퀘어에서 내보낸 객체엔 `_origin:'aptsq'` 표식을 붙여 되돌려 읽지 않습니다.
- **삭제 반영** — 한 쪽에서 지우면 반대쪽 짝도 지웁니다.
- **비밀키** — `.env` 는 `.gitignore`로 커밋에서 제외됩니다.

## 파일

- `sync.js` — 브리지 본체 (Firebase RTDB REST ↔ Supabase, 폴링 방식)
- `mapping.js` — 노드↔category, 필드 변환 규칙 (여기만 고치면 매핑이 바뀝니다)
