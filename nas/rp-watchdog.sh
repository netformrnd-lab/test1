#!/bin/sh
#
# 📌 역방향 프록시 자동복구 — 브랜드 허브
#
#   왜 있나
#     바깥 주소 netformrnd.synology.me:443 로 들어온 요청은 허브(포트 80)로
#     가야 합니다. 그런데 DSM 이 이 설정을 자꾸 8765(허브가 없는 포트)로
#     되돌려서, 바깥에서 허브에 들어오면 404 / HTTP_ERROR 가 납니다.
#     이 스크립트가 몇 분마다 확인해서, 8765 로 돌아가 있으면 자동으로 80 으로
#     되돌리고 nginx 를 새로고침합니다. → 사람이 매번 손댈 필요가 없습니다.
#
#   안전장치
#     · 8765 가 보일 때만 손댑니다 (평소엔 아무것도 안 함)
#     · nginx 설정 검사(nginx -t)가 통과할 때만 새로고침합니다
#       (깨진 설정으로 새로고침해서 웹을 멈추게 하지 않음)
#     · 바로잡을 때마다 로그를 남깁니다: /volume1/web/brand/rp-watchdog.log
#
#   설치 (한 번만)
#     DSM → 제어판 → 작업 스케줄러 → [생성] → 예약된 작업 → 사용자 정의 스크립트
#       · 사용자      : root        ← 꼭 root
#       · 스케줄      : 매일 · 반복 간격 5분  (또는 원하는 주기)
#       · 작업 설정 → 실행 명령:
#             sh /volume1/web/brand/rp-watchdog.sh
#
BAD_PORT="${BAD_PORT:-8765}"            # 틀린 포트 (여기로 가면 허브가 없음)
GOOD_PORT="${GOOD_PORT:-80}"            # 맞는 포트 (허브가 펴지는 곳)
BACKEND_HOST="${BACKEND_HOST:-192.168.0.37}"
JSON="/usr/syno/etc/www/ReverseProxy.json"
LOG="/volume1/web/brand/rp-watchdog.log"

changed=0

# 1) 원본 설정(JSON)에서  "port" : 8765  →  "port" : 80
#    (수입핸들링 등 다른 규칙은 8765 를 안 써서 영향 없음)
if [ -f "$JSON" ] && grep -q "\"port\" : $BAD_PORT" "$JSON" 2>/dev/null; then
    sed -i "s/\"port\" : $BAD_PORT/\"port\" : $GOOD_PORT/g" "$JSON"
    changed=1
fi

# 2) 생성된 nginx 설정에서  192.168.0.37:8765  →  192.168.0.37:80
for f in $(grep -rl "$BACKEND_HOST:$BAD_PORT" /etc/nginx /usr/local/etc/nginx 2>/dev/null); do
    sed -i "s#$BACKEND_HOST:$BAD_PORT#$BACKEND_HOST:$GOOD_PORT#g" "$f"
    changed=1
done

# 3) 바꾼 게 있으면 — 설정이 정상일 때만 새로고침
if [ "$changed" = "1" ]; then
    if nginx -t >/dev/null 2>&1; then
        nginx -s reload >/dev/null 2>&1 \
            || synosystemctl reload nginx >/dev/null 2>&1 \
            || synosystemctl restart nginx >/dev/null 2>&1
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $BAD_PORT → $GOOD_PORT 로 되돌리고 새로고침함" >> "$LOG"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ nginx 설정 검사 실패 — 새로고침 건너뜀" >> "$LOG"
    fi
    # 로그가 너무 커지지 않게 최근 300줄만 보관
    if [ -f "$LOG" ]; then
        tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null
    fi
fi

exit 0
