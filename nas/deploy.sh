#!/bin/sh
#
# 브랜드 대시보드 자동 업데이트 스크립트 (시놀로지 NAS용)
#
# GitHub에 올라간 최신 파일을 받아 NAS의 웹 폴더에 반영합니다.
# DSM → 제어판 → 작업 스케줄러 에 등록해두면 사람이 손댈 필요가 없습니다.
#
# 안전장치
#  - 내려받은 파일이 정상인지 검사한 뒤에만 교체합니다 (깨진 파일로 덮어쓰지 않음)
#  - 내용이 바뀐 파일만 교체합니다
#  - data 폴더(입력한 숫자)는 절대 건드리지 않습니다
#

BRANCH="${BRANCH:-refs/heads/claude/ja-brand-dashboard-nas-4lvyrk}"
BASE="${BASE:-https://raw.githubusercontent.com/netformrnd-lab/test1/$BRANCH}"
TARGET="${TARGET:-/volume1/web/brand}"
TMP="$TARGET/.deploy-tmp"
LOG="$TARGET/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

if [ ! -d "$TARGET" ]; then
    echo "대상 폴더가 없습니다: $TARGET"
    exit 1
fi

mkdir -p "$TMP" || exit 1

# 파일명  원격경로  정상여부를_판단할_문구
update_file() {
    name="$1"
    remote="$2"
    marker="$3"

    if ! wget -q -T 30 -O "$TMP/$name" "$BASE/$remote"; then
        log "실패: $name 내려받기 오류 (네트워크 확인)"
        return 1
    fi

    # 정상 파일인지 검사 — 비어 있거나 내용이 이상하면 교체하지 않음
    if [ ! -s "$TMP/$name" ] || ! grep -q "$marker" "$TMP/$name"; then
        log "실패: $name 내용이 올바르지 않아 교체하지 않음"
        rm -f "$TMP/$name"
        return 1
    fi

    # 바뀐 게 없으면 건너뜀
    if [ -f "$TARGET/$name" ] && cmp -s "$TMP/$name" "$TARGET/$name"; then
        rm -f "$TMP/$name"
        return 0
    fi

    mv "$TMP/$name" "$TARGET/$name" || { log "실패: $name 교체 오류 (권한 확인)"; return 1; }
    log "갱신: $name"
    return 0
}

failed=0
update_file "brand.html" "brand.html"   "</html>"    || failed=1
update_file "load.php"   "nas/load.php" "<?php"      || failed=1
update_file "save.php"   "nas/save.php" "<?php"      || failed=1

rmdir "$TMP" 2>/dev/null

# 로그가 너무 커지지 않게 최근 200줄만 보관
if [ -f "$LOG" ]; then
    tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $failed
