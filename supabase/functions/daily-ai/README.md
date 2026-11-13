# daily-ai — 시공사 일일보고 규칙 검사 + AI 위험 탐지 (초안)

시공사가 앱에서 일일보고를 제출하면 앱이 이 함수를 `{ report_id }` 로 호출합니다.

1. **규칙 검사 (AI 안 씀, 무료)** — 필수 사진 누락 · 촬영일≠보고일(옛 사진) · 같은 사진 재사용 · 앞 공정 보고 없이 진행
2. **AI 1차** `claude-haiku-5-5` — 사진·메모·공정 순서를 보고 `검토 필요 / 이상 징후 없음 / 판단 불가`
3. **AI 2차** `claude-sonnet-5-5` — 1차에서 `검토 필요`가 나왔을 때만 다시 확인 (오경보 줄이기)
   - Sonnet 5.5 호출에는 서버 측 대체 모델(`fallbacks: "default"`)이 켜져 있음 → 안전 분류기가 거절하면 API가 자동으로 다른 모델로 재시도
4. 결과 저장: `ai_findings`(검토 항목) · `daily_ai`(AI 원문 — 감리원·관리자만)

AI는 판정하지 않습니다. 단정 표현(위반·하자·부적합 등)은 서버에서 한 번 더 걸러 "~로 보임 — 감리원 확인 필요"로 바꿉니다.

## 비용 상한 (secrets 로 조절)
| 이름 | 기본 | 뜻 |
|---|---|---|
| `DAILY_AI_MODEL` | `claude-haiku-5-5` | 1차 모델 |
| `DAILY_AI_MODEL_2ND` | `claude-sonnet-5-5` | 2차 확인 모델 (빈 값이면 2차 안 함) |
| `DAILY_AI_DAILY_CAP` | `20` | 현장당 하루 AI 분석 사진 수 |
| `DAILY_AI_MONTHLY_USD` | `10` | 월 AI 예산(달러). 넘으면 규칙 검사만 하고 `skipped` |

보고 1건당 AI 분석은 최대 6장(필수 촬영 칸 우선). 고정 시스템 프롬프트는 프롬프트 캐싱으로 반복 비용을 줄입니다.
사용량·추정 비용은 `ai_usage_daily` 표에 쌓이고 콘솔 "일일보고" 탭에 표시됩니다.
Anthropic 콘솔에서도 월 지출 한도를 같이 걸어 두세요.

## 배포
```bash
supabase functions deploy daily-ai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # gamri-ai 에 이미 넣었다면 생략
```
대시보드로 배포할 때: Edge Functions → Deploy a new function → 이름 `daily-ai` → `index.ts` 붙여넣기.

## 메모
- 로그인 사용자(JWT)만 호출 가능. 그 현장의 시공사 또는 감리원·관리자만 실행됨.
- 감리원·관리자는 `{ report_id, force: true }` 로 다시 분석할 수 있음.
- 공정 순서표(`STAGE_SETS`)는 `app/js/stages.js` 와 같게 유지해야 함.
