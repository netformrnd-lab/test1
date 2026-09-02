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

DIR=$(cd "$(dirname "$0")" && pwd)
LOG="$DIR/feeds.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# 제대로 된 응답인지 확인합니다.
# 주소가 틀리면 웹 스테이션이 자기 안내 페이지를 200 으로 돌려주는데,
# 그걸 성공으로 착각하면 "돌고는 있는데 아무것도 안 되는" 상태가 됩니다.
is_ours() {
    case "$1" in
        *'"mode":"refreshall"'*) return 0 ;;
        *) return 1 ;;
    esac
}

OUT=""

# 방법 1) 명령줄 PHP — 주소를 몰라도 되니 가장 확실합니다.
PHP=$(command -v php 2>/dev/null)
[ -z "$PHP" ] && PHP=$(ls /usr/local/bin/php8* /usr/local/bin/php7* 2>/dev/null | tail -1)
if [ -n "$PHP" ]; then
    TRY=$("$PHP" "$DIR/channels.php" action=refreshall cron=1 2>/dev/null)
    if is_ours "$TRY"; then OUT="$TRY"; else
        log "명령줄 PHP 로는 안 됐습니다 (php=$PHP)"
    fi
fi

# 방법 2) 웹으로 부르기. 이 파일이 있는 폴더 이름으로 주소를 만들어 봅니다.
if [ -z "$OUT" ]; then
    BASENAME=$(basename "$DIR")
    for U in \
        ${URL:+"$URL"} \
        "http://localhost/$BASENAME/channels.php?action=refreshall&cron=1" \
        "http://127.0.0.1/$BASENAME/channels.php?action=refreshall&cron=1" \
        "http://localhost/channels.php?action=refreshall&cron=1"
    do
        TRY=$(wget -q -T 120 -O - "$U" 2>/dev/null)
        if is_ours "$TRY"; then OUT="$TRY"; log "웹으로 성공: $U"; break; fi
        log "이 주소로는 안 됐습니다: $U"
    done
fi

if [ -z "$OUT" ]; then
    log "실패: 채널을 확인하지 못했습니다"
    echo "채널을 확인하지 못했습니다. $LOG 를 봐주세요."
    echo "웹 주소가 다르면 이 파일 위쪽의 URL= 에 직접 넣어주세요."
    exit 1
fi

log "$OUT"
echo "$OUT"

# 기록이 너무 길어지지 않게 마지막 300줄만 남깁니다
if [ -f "$LOG" ]; then
    tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
fi
