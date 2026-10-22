# gamri-ai — 공사감리일지 AI 보강 Edge Function

감리원이 작성한 점검 원문을 **공식 양식(작업사항·특기사항·지적사항) 문장**으로 다듬습니다.
서버(이 함수)에서 Claude API를 호출하므로 **API 키가 앱(브라우저)에 노출되지 않습니다.**
비상주 감리 대행 업무기준(쓰는 동사·금지 동사·완료부위만 판정·사실 날조 금지)을 시스템 프롬프트로 강제합니다.

## 동작
- 입력(POST JSON): `{ content, meta:{site,builder,worktype,date,weather,round,dongs,insp}, photoCount }`
- 출력(JSON): `{ ok:true, work:[...], teukgi:[...], jijeok:[...] }`  (실패 시 `{ ok:false, error }`)
- 콘솔 **감리일지 보기 → ✨ AI 보강** 버튼이 이 함수를 호출하고, 결과를 감리원이 검토·수정한 뒤 PDF로 만듭니다.

## 배포 (둘 중 하나)

### A) CLI
```bash
# 1) Claude API 키를 secret으로 등록 (브라우저에 노출 안 됨)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# 2) 함수 배포
supabase functions deploy gamri-ai
```

### B) Supabase 대시보드
1. **Edge Functions → Deploy a new function** → 이름 `gamri-ai` → `index.ts` 내용 붙여넣기
2. **Project Settings → Edge Functions → Secrets** (또는 함수의 Secrets 탭)에
   `ANTHROPIC_API_KEY = sk-ant-...` 추가

## 모델 바꾸기 (비용)
기본값은 `claude-opus-5-5`. 더 저렴하게 쓰려면 secret으로 모델을 지정하세요.
```bash
supabase secrets set GAMRI_AI_MODEL=claude-sonnet-5-5   # 또는 claude-haiku-5-5
```

## 메모
- 함수는 로그인된 콘솔 사용자(JWT)만 호출합니다(Supabase 기본 verify_jwt).
- 호출당 Claude API 토큰 비용이 발생합니다(감리일지 1건 보강 ≈ 짧은 호출 1회).
