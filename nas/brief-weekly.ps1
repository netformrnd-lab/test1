# ═══════════════ 📰 업계 브리핑 — 월요일 자동 올리기 ═══════════════
#
#  사무실 PC(늘 켜져 있는 것) 에서 매주 월요일 아침에 자동으로 돕니다.
#  ① 웹검색 되는 AI 에게 「이번 주 업계 이슈」 를 정리시키고
#  ② 그 결과를 사내망으로 허브(NAS)에 올립니다 → 모든 팀이 봅니다.
#
#  NAS 는 인터넷에 안 나갑니다. 인터넷은 이미 온라인인 이 PC 만 씁니다.
#
#  ── 설정 (아래 네 줄만 채우면 끝) ────────────────────────────────
#  * $BriefKey : NAS 의 data/brief-key.txt 에 적어둔 비밀 열쇠와 똑같이
#  * $AiKey    : 웹을 검색하는 AI 의 API 키 (예: Perplexity — sonar 모델)
#  이 파일에는 열쇠가 들어가니, 이 PC 안에만 두세요 (저장소·공유 금지).
#
#  ── 작업 스케줄러 등록 ───────────────────────────────────────────
#  작업 스케줄러 → 작업 만들기 → 트리거: 매주 월요일 오전 8:40
#   동작: 프로그램 시작 →
#     프로그램:  powershell.exe
#     인수:      -ExecutionPolicy Bypass -File "C:\경로\brief-weekly.ps1"
# ═══════════════════════════════════════════════════════════════════

# ── 설정 ────────────────────────────────────────────────────────────
$HubUrl   = "http://netformrnd.synology.me/brand/brief-in.php"   # 허브 받는 창구
$BriefKey = "여기에-NAS-brief-key.txt-와-같은-비밀열쇠"
$AiKey    = "여기에-웹검색-AI-API-키"
$AiUrl    = "https://api.perplexity.ai/chat/completions"         # Perplexity (웹검색 기본)
$AiModel  = "sonar"                                              # 웹을 검색하는 모델
# (OpenAI 웹검색을 쓰려면 $AiUrl/$AiModel 과 아래 호출부를 그 API 형식으로 바꾸세요)

$Prompt = @"
너는 넷폼알앤디(브랜드 마케팅 · 미디어 콘텐츠 제작)의 주간 업계 브리핑 담당이야.
지난 한 주 동안 우리 업계 — 브랜드 마케팅, 유튜브·인스타·틱톡 등 미디어 콘텐츠,
광고, 숏폼 트렌드, 플랫폼 정책 변화 — 에서 꼭 알아야 할 이슈를 5~7개로 정리해줘.
각 항목은: ① 한 줄 제목 ② 2~3문장 요약 ③ 왜 우리 팀에 중요한지 한 줄 ④ (가능하면) 출처.
맨 끝에 「이번 주 우리 팀이 해볼 것」 3가지를 덧붙여줘.
한국어로, 사내 공유용으로 읽기 쉽게. 반드시 최신 웹 검색 결과를 바탕으로 써줘.
"@

$ErrorActionPreference = "Stop"
try {
    # ① 웹검색 AI 에게 묻기 (OpenAI 호환 chat/completions 형식)
    $aiBody = @{
        model    = $AiModel
        messages = @(@{ role = "user"; content = $Prompt })
    } | ConvertTo-Json -Depth 8
    $aiBytes = [System.Text.Encoding]::UTF8.GetBytes($aiBody)
    $ai = Invoke-RestMethod -Uri $AiUrl -Method Post `
        -Headers @{ Authorization = "Bearer $AiKey" } `
        -ContentType "application/json; charset=utf-8" -Body $aiBytes
    $text = [string]$ai.choices[0].message.content
    if ([string]::IsNullOrWhiteSpace($text)) { throw "AI 가 빈 답을 보냈습니다" }

    # ② 그 주 월요일 날짜 (오늘이 무슨 요일이든 이번 주 월요일로)
    $today  = (Get-Date).Date
    $monday = $today.AddDays( - ((([int]$today.DayOfWeek) + 6) % 7) ).ToString("yyyy-MM-dd")
    $title  = "$((Get-Date).Month)월 업계 브리핑 ($monday)"

    # ③ 허브에 올리기
    $post = @{
        key     = $BriefKey
        title   = $title
        week    = $monday
        body    = $text
        by      = "🤖 자동"
    } | ConvertTo-Json -Depth 8
    $postBytes = [System.Text.Encoding]::UTF8.GetBytes($post)
    $r = Invoke-RestMethod -Uri $HubUrl -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $postBytes

    if ($r.ok) { Write-Host "✅ 올렸습니다 — $monday 주 (rev $($r.rev))" }
    else       { Write-Host "⚠️ 허브가 거절: $($r.error)" }
}
catch {
    Write-Host "❌ 실패: $($_.Exception.Message)"
    exit 1
}
