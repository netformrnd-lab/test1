#!/bin/sh
#
# 📌 역방향 프록시 자동복구 — 빠른 감시(상주형)
#
#   무엇을 하나
#     rp-watchdog.sh 를 짧은 간격(기본 15초)으로 계속 돌립니다.
#     → netformrnd.synology.me:443 이 8765 로 바뀌면 거의 즉시(≤15초) 80 으로 복구.
#
#   1분짜리 작업(heb)은 그대로 두세요 — 이 상주 감시가 어쩌다 꺼져도
#   1분마다 도는 그 작업이 안전망이 됩니다. (둘이 겹쳐도 문제 없음)
#
#   설치 (한 번만): DSM → 제어판 → 작업 스케줄러 → [생성] → 트리거된 작업
#       → 사용자 정의 스크립트
#     · 이벤트  : 부팅
#     · 사용자  : root
#     · 실행 명령:
#         setsid sh /volume1/web/brand/rp-watchdog-loop.sh </dev/null >> /volume1/web/brand/rp-watchdog-loop.out 2>&1 &
#   만든 뒤 그 작업을 목록에서 선택하고 [실행] 을 누르면 재부팅 없이 바로 켜집니다.
#   (기존 1분짜리 작업의 실행 명령을 위 setsid 줄로 바꿔 데몬 관리자로 써도 됩니다.
#    1분마다 "데몬이 꺼졌으면 다시 켜기"가 되어 재부팅 후에도 자동 복귀합니다.)
#
INTERVAL="${INTERVAL:-15}"                       # 확인 간격(초)
SELF="/volume1/web/brand/rp-watchdog.sh"
PIDF="/tmp/rp-watchdog-loop.pid"

# 이미 돌고 있으면 또 켜지 않음 (중복 실행 방지)
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; then
    exit 0
fi
echo $$ > "$PIDF"
trap 'rm -f "$PIDF"' EXIT INT TERM

# 15초마다 자동복구 스크립트를 돌립니다 (8765 면 80 으로 되돌림, 아니면 아무것도 안 함)
while true; do
    [ -f "$SELF" ] && sh "$SELF"
    sleep "$INTERVAL"
done
