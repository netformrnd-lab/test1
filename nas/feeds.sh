#!/bin/sh
#
# 브랜드 채널 새 글 확인하기
#
# 대시보드에 등록해 둔 블로그·카페·유튜브를 NAS 가 대신 돌아보고,
# 새 글이 올라왔는지 미리 받아둡니다.
# 받아둔 내용은 대시보드를 열자마자 바로 보입니다. (기다림 없음)
#
# 아무 파일도 고치거나 지우지 않습니다. 읽어와서 저장만 합니다.
#
# ── 등록하는 법 ────────────────────────────────────────────
# DSM → 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트
#   사용자 : root
#   일정   : 매일 / 반복 30분 (원하시는 간격으로)
#   명령   : sh /volume1/web/brand/feeds.sh
# ───────────────────────────────────────────────────────────

DIR=$(dirname "$0")
cd "$DIR" || exit 1
LOG="$DIR/feeds.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# 방법 1) 웹으로 부르기 — 웹 스테이션이 켜져 있으면 가장 확실합니다.
#         주소가 다르면 아래 URL 만 고쳐주세요.
URL="${URL:-http://localhost/brand/channels.php?action=refreshall}"
OUT=$(wget -q -T 120 -O - "$URL" 2>/dev/null)

# 방법 2) 웹이 안 되면 명령줄 PHP 로 직접 실행합니다.
if [ -z "$OUT" ]; then
    PHP=$(command -v php 2>/dev/null)
    [ -z "$PHP" ] && PHP=$(ls /usr/local/bin/php8* /usr/local/bin/php7* 2>/dev/null | tail -1)
    if [ -n "$PHP" ]; then
        OUT=$("$PHP" "$DIR/channels.php" action=refreshall 2>/dev/null)
    fi
fi

if [ -z "$OUT" ]; then
    log "실패: 채널을 확인하지 못했습니다 (URL=$URL)"
    echo "채널을 확인하지 못했습니다. feeds.log 를 봐주세요."
    exit 1
fi

log "$OUT"
echo "$OUT"

# 기록이 너무 길어지지 않게 마지막 300줄만 남깁니다
if [ -f "$LOG" ]; then
    tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
fi
