# aptsq-sync — 영업일정 ↔ 아파트스퀘어 양방향 연동

POUR 영업일정 앱(Firebase Realtime Database, `test-168a4`)과 아파트스퀘어
(Supabase)의 **일정만** 양쪽에서 서로 보이고, 어느 쪽에서 넣거나 고쳐도 반대쪽에 반영되게 하는 작은 상주 서비스입니다.

기존 하이웍스 휴가 동기화(`sync.js`)와 같은 방식의 Node 브리지예요. 정산·급여·하이웍스 데이터는 **건드리지 않습니다.**

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

## 준비물 (한 번만)

1. **Supabase 마이그레이션 적용** — `backend/migration-schedule-visibility.sql`
   (schedules 에 `source / sync_id / ext_updated_at` 컬럼과 realtime 추가). 이미 하셨으면 넘어가세요.
2. **service_role 키** — Supabase → Project Settings → API → `service_role`
3. **Firebase 서비스계정** — 하이웍스 동기화에서 쓰던 `test-168a4` 서비스계정 그대로 사용

## 실행

```bash
cd backend/aptsq-sync
cp .env.example .env      # 값 채우기 (service_role 키, 서비스계정 경로)
npm install
npm run once              # 먼저 한 번만 당겨와 확인 (점검용)
npm start                 # 상주 = 실시간 양방향 동기화
```

`npm start`는 켜두면 계속 돌면서 양쪽 변경을 실시간으로 주고받습니다.
하이웍스 sync 처럼 서버에 상주시키거나(pm2 등), 크론으로 `npm run once`를 주기 실행해도 됩니다.

## 안전장치

- **루프 방지** — POUR에서 온 건 `source='pour'`로 표시해 되돌려 쓰지 않고, 아파트스퀘어에서 내보낸 객체엔 `_origin:'aptsq'` 표식을 붙여 되돌려 읽지 않습니다.
- **충돌** — 마지막에 바뀐 쪽이 이깁니다(Last-Write-Wins).
- **삭제 반영** — 한 쪽에서 지우면 반대쪽 짝도 지웁니다.
- **비밀키** — `.env`, `service-account.json`은 `.gitignore`로 커밋에서 제외됩니다. 절대 깃/채팅에 올리지 마세요.

## 파일

- `sync.js` — 브리지 본체 (방향 A: POUR→Supabase, 방향 B: Supabase→POUR)
- `mapping.js` — 노드↔category, 필드 변환 규칙 (여기만 고치면 매핑이 바뀝니다)
