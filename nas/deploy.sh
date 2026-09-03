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

# 이 스크립트 자체의 새 버전이 받아져 있으면 먼저 교체하고, 새 버전으로 다시 실행합니다.
# (실행 중인 파일을 바로 덮어쓰면 위험하므로 다음 실행 때 교체하는 방식입니다)
if [ -f "$TARGET/deploy.sh.new" ]; then
    if mv "$TARGET/deploy.sh.new" "$TARGET/deploy.sh"; then
        log "갱신: deploy.sh — 새 버전으로 다시 실행합니다"
        exec sh "$TARGET/deploy.sh"
    fi
fi

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

# 받아올 파일 목록을 manifest.txt 에서 읽습니다.
# 새 파일이 생겨도 이 스크립트를 고칠 필요가 없습니다.
# 목록을 못 받으면 아래 기본 목록을 씁니다.
TAB=$(printf '\t')
if wget -q -T 30 -O "$TMP/manifest.txt" "$BASE/nas/manifest.txt" 2>/dev/null &&
   grep -q "$TAB" "$TMP/manifest.txt"; then
    log "목록 파일 사용"
    while IFS="$TAB" read -r name remote marker; do
        case "$name" in ''|'#'*) continue;; esac
        case "$name" in */*|*\\*) continue;; esac      # 폴더 이동 금지
        [ -z "$remote" ] && continue
        update_file "$name" "$remote" "$marker" || failed=1
    done < "$TMP/manifest.txt"
    rm -f "$TMP/manifest.txt"
else
    log "목록 파일을 못 받아 기본 목록을 씁니다"
    update_file "brand.html" "brand.html"   "</html>"    || failed=1
    update_file "load.php"   "nas/load.php" "<?php"      || failed=1
    update_file "save.php"   "nas/save.php" "<?php"      || failed=1
    update_file "files.php"  "nas/files.php" "<?php"     || failed=1
    update_file "metrics.php" "nas/metrics.php" "<?php"   || failed=1
    update_file "inquiries.php" "nas/inquiries.php" "<?php" || failed=1
    update_file "nasfiles.php" "nas/nasfiles.php" "<?php" || failed=1
    update_file "nasscan.php" "nas/nasscan.php" "<?php"  || failed=1
    update_file "doctext.php" "nas/doctext.php" "<?php"  || failed=1
    update_file "channels.php" "nas/channels.php" "<?php" || failed=1
    update_file "presence.php" "nas/presence.php" "<?php" || failed=1
    update_file "ai.php"       "nas/ai.php"       "<?php" || failed=1
    update_file "scan.sh"      "nas/scan.sh"      "ROOT="  || failed=1
    update_file "feeds.sh"     "nas/feeds.sh"     "URL="   || failed=1
    update_file "config.sample.php" "nas/config.sample.php" "<?php" || failed=1
fi

# 문의 기록 시트가 연결돼 있으면 함께 갱신합니다.
# (연결이 없으면 아무 일도 하지 않고, 실패해도 파일 갱신에는 영향을 주지 않습니다)
if [ -f "$TARGET/data/inquiries-source.json" ]; then
    if wget -q -T 60 -O "$TMP/sync.out" "http://localhost/brand/inquiries.php?action=sync" 2>/dev/null; then
        if grep -q '"ok":true' "$TMP/sync.out"; then
            log "문의 기록 갱신 완료"
        else
            log "문의 기록 갱신 실패: $(head -c 200 "$TMP/sync.out")"
        fi
    else
        log "문의 기록 갱신 실패: 요청을 보내지 못했습니다"
    fi
    rm -f "$TMP/sync.out"
fi

# 다음 실행 때 적용할 새 deploy.sh 를 미리 받아둡니다
if wget -q -T 30 -O "$TMP/deploy.sh" "$BASE/nas/deploy.sh" 2>/dev/null; then
    if grep -q 'update_file' "$TMP/deploy.sh" && ! cmp -s "$TMP/deploy.sh" "$TARGET/deploy.sh"; then
        mv "$TMP/deploy.sh" "$TARGET/deploy.sh.new"
        log "새 deploy.sh 준비됨 (다음 실행 때 적용)"
    fi
fi
rm -f "$TMP/deploy.sh"

rmdir "$TMP" 2>/dev/null

# 로그가 너무 커지지 않게 최근 200줄만 보관
if [ -f "$LOG" ]; then
    tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $failed
