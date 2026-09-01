#!/bin/sh
#
# NAS 공유폴더 파일 목록 만들기
#
# 폴더를 훑어서 "어떤 파일이 어디 있는지" 목록만 만듭니다.
# 파일을 옮기거나 복사하거나 고치지 않습니다. 읽기만 합니다.
#
# DSM → 제어판 → 작업 스케줄러 에 등록해두면 주기적으로 목록이 갱신됩니다.
#   sh /volume1/web/brand/scan.sh
#

ROOT="${ROOT:-/volume1/넷폼알앤디 공유폴더}"
TARGET="${TARGET:-/volume1/web/brand}"
OUT="$TARGET/data/nasfiles.tsv"
TMP="$OUT.tmp"
LOG="$TARGET/scan.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

if [ ! -d "$ROOT" ]; then
    log "실패: 폴더를 찾을 수 없습니다 — $ROOT"
    echo "폴더를 찾을 수 없습니다: $ROOT"
    exit 1
fi

mkdir -p "$TARGET/data" || { log "실패: data 폴더를 만들 수 없습니다"; exit 1; }

log "시작: $ROOT"
START=$(date +%s)

# 시놀로지가 자동으로 만드는 폴더와 임시 파일은 제외합니다
# 출력 형식: 수정일(탭)크기(탭)전체경로
if find . -maxdepth 0 -printf '' 2>/dev/null; then
    # GNU find — 한 번에 처리해서 빠릅니다
    find "$ROOT" -type f \
        ! -path '*/@eaDir/*' ! -path '*/#recycle/*' \
        ! -name '.DS_Store' ! -name 'Thumbs.db' ! -name '~$*' \
        -printf '%TY-%Tm-%Td\t%s\t%p\n' > "$TMP" 2>/dev/null
else
    # printf 옵션이 없는 경우 — 느리지만 동작합니다
    find "$ROOT" -type f \
        ! -path '*/@eaDir/*' ! -path '*/#recycle/*' \
        ! -name '.DS_Store' ! -name 'Thumbs.db' 2>/dev/null |
    while IFS= read -r f; do
        d=$(date -r "$f" +%Y-%m-%d 2>/dev/null || echo '')
        s=$(stat -c%s "$f" 2>/dev/null || echo 0)
        printf '%s\t%s\t%s\n' "$d" "$s" "$f"
    done > "$TMP"
fi

if [ ! -s "$TMP" ]; then
    log "실패: 찾은 파일이 없습니다 (권한 확인 필요). 기존 목록은 그대로 둡니다."
    rm -f "$TMP"
    exit 1
fi

mv "$TMP" "$OUT"
# 어느 폴더를 훑었는지 남깁니다. 다운로드할 때 이 폴더 안의 파일만 허용합니다.
printf '%s' "$ROOT" > "$TARGET/data/nasroot.txt"
COUNT=$(wc -l < "$OUT" | tr -d ' ')
log "완료: ${COUNT}개 · $(( $(date +%s) - START ))초"

# 로그가 커지지 않게 최근 100줄만 남깁니다
tail -n 100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

echo "완료: ${COUNT}개 파일을 목록에 담았습니다"
