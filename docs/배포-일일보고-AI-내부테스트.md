# 시공사 일일보고 + AI — 내부테스트 배포 체크리스트 (초안)

작성 2026-11-13 · 브랜치 `claude/new-session-rgroub`

> ⚠️ 운영과 내부테스트는 **같은 Supabase(DB)** 를 씁니다.
> 아래 SQL은 **새 표만 추가**해서 기존 데이터·화면에는 영향이 없지만,
> 테스트할 때는 **실제 단지가 아닌 '테스트 현장'** 으로 해 주세요. (실제 단지로 하면 그 단지 담당 감리원에게 푸시가 갑니다)

---

## 1. Supabase — SQL 실행 (1번)
- [ ] SQL Editor → `backend/migration-daily-reports.sql` 붙여넣고 Run → `Success` 확인

## 2. AI 켜기 → `docs/AI-켜기.md`
- [ ] Edge Function **`aptsq-ai`** 1개 배포 (`supabase/functions/aptsq-ai/index.ts`)
- [ ] 콘솔 「일일보고·AI」 → 🤖 AI 설정에 API 키 저장 → 연결 테스트

## 3. Supabase — 웹훅 2개 (푸시용, 기존 웹훅과 같은 방식)
Database → Webhooks → Create a new hook → HTTP Request(POST) → URL은 **기존 웹훅과 같은 푸시 워커 주소(`?secret=...` 포함)**
- [ ] 표 **`daily_ai`** · 이벤트 **Insert + Update** → "검토 필요"면 담당 감리원에게 푸시
- [ ] 표 **`ai_findings`** · 이벤트 **Update** → 통보(시공사) · 회신(감리원) · 지연(관리자) 푸시

## 4. Cloudflare — 푸시 워커 코드 갱신
- [ ] 푸시 워커 → Edit code → `cloudflare-push-worker/worker.js` 전체 붙여넣기 → Deploy
  (기존 알림은 그대로, 일일보고 알림만 추가)

## 5. Cloudflare — 웹은 **테스트 워커에만** 배포
- [ ] `node build-deploy.js` → `dist-deploy/` 압축 → **wandering-firefly-test** 에 New deployment
- [ ] 운영 워커(floral-cherry)에는 **아직 올리지 않음**
- 콘솔도 테스트 워커 주소의 `/console/` 로 확인: `https://wandering-firefly-test.squarecm.workers.dev/console/`

## 6. 테스트 순서
1. 콘솔(테스트 주소) → 공사관리에서 **테스트 현장** 하나 만들고, 공법(예: 외벽 재도장)·담당 감리원(본인 테스트 계정) 지정
2. 내부테스트 앱 → 회원가입 → 가입 유형 **"시공사 (현장소장)"** 선택
3. 콘솔 → 회원 → 승인 대기(“시공사로 신청” 표시) → 편집: 역할 **시공사**, 담당 단지 **테스트 현장** → 승인
   (또는 콘솔 **일일보고·AI** 탭 → 시공사 ↔ 현장 배정)
4. 시공사 계정 로그인 → **내 현장** → 📸 오늘 일일보고 → 공종 선택 → 필수 사진 칸 일부만 채우고 제출
5. 감리원 계정 → 푸시 "🔎 시공사 일일보고 검토 필요" 확인 → 단지 → **시공사 일일보고**
   - 자동 점검: "필수 사진 누락" 항목이 떠야 함
   - AI: 안전모 없는 사진 등을 올리면 "검토 필요" 항목
6. 항목 처리: **확인함 → 시공사에 통보/요청** → (시공사 폰에 "📨 감리원 확인 요청" 푸시) → 시공사가 **요청 사항**에서 조치 사진 회신 → (감리원 "↩️ 회신 도착") → **재확인 완료**
7. 다른 항목은 **오경보**로 닫아 보기 → 콘솔 **일일보고·AI** 탭에서 오경보율·처리 시간·AI 비용·사진 용량 확인
8. 감리원 화면 하단 **감리일지 근거 문구 복사** → 문구 확인

## 7. 알아둘 점
- **미확인 재알림(24시간)** 은 `.github/workflows/daily-escalate.yml` (GitHub Actions, 매시) — main 에 합쳐진 뒤부터 자동 실행됩니다. 그 전엔 테스트 시 Actions 탭에서 수동 실행 불가 → main 반영 후 확인.
- AI 결과(`daily_ai`)는 감리원·관리자만 볼 수 있음. 시공사에게는 감리원이 **통보한 항목만** 보임.
- 사진: 앱에서 긴 변 1280px 본 사진 + 400px 썸네일만 올림. 비공개 버킷 `daily-photos`.
- 시공사 계정은 `profiles.apartment_id` 를 쓰지 않고 `apartment_contractors` 로만 현장 배정(입주민 화면이 열리지 않게).
- 날씨 자동 연동은 2단계.

## 8. 되돌리기 (필요 시)
- 웹: 테스트 워커를 이전 배포로 Rollback
- 워커: 이전 코드로 다시 Deploy (새 알림만 빠짐)
- DB: 새 표들은 다른 기능과 연결이 없어 그대로 둬도 무방
