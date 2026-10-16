#!/bin/sh
#
# 📌 고정 주소 점검 — 시놀로지 NAS 에서 돌립니다
#
#   무엇을 보나
#     ① 대시보드가 웹 폴더에 제대로 있나
#     ② Web Station 이 그것을 펴 주고 있나 (80 · 443)
#     ③ DDNS 주소(netformrnd.synology.me)가 우리 집 주소를 가리키나
#     ④ 인증서가 그 주소 것으로 잡혀 있나 (https 가 되나)
#     ⑤ 공유기에서 밖에서 들어오는 길이 열려 있나
#     ⑥ 옛 trycloudflare 터널이 아직 돌고 있나
#
#   고치지 않습니다 — <<보고 알려 주기만>> 합니다.
#
#   쓰는 법 (DSM → 제어판 → 터미널 및 SNMP → SSH 켠 뒤)
#     ssh <관리자>@192.168.0.37
#     sudo sh /volume1/web/brand/fixed-url-check.sh
#   또는 이 파일 내용을 그대로 붙여넣어도 됩니다.
#
DDNS="${DDNS:-netformrnd.synology.me}"
WEB="${WEB:-/volume1/web/brand}"
ok()  { printf '  ✅ %s\n' "$1"; }
no()  { printf '  ❌ %s\n' "$1"; }
hm()  { printf '  ⚠️  %s\n' "$1"; }
line(){ printf '\n%s\n' "$1"; }

printf '\n📌 고정 주소 점검 — %s\n' "$(date '+%Y-%m-%d %H:%M')"
printf '   보려는 주소: https://%s/brand/brand.html\n' "$DDNS"

line '① 대시보드 파일'
if [ -f "$WEB/brand.html" ]; then
    ver=$(grep -o "APP_VER = '[^']*'" "$WEB/brand.html" 2>/dev/null | head -1 | sed "s/.*'\(.*\)'/\1/")
    ok "있습니다: $WEB/brand.html  (판 ${ver:-?})"
else
    no "없습니다: $WEB/brand.html"
    hm "먼저 deploy.sh 가 한 번 돌아야 합니다 (DSM → 작업 스케줄러)"
fi

line '② Web Station 이 펴 주나 (NAS 안에서)'
for u in "http://127.0.0.1/brand/brand.html" "https://127.0.0.1/brand/brand.html"; do
    c=$(curl -sk -o /dev/null -m 8 -w '%{http_code}' "$u" 2>/dev/null)
    [ "$c" = "200" ] && ok "$u → 200" || no "$u → ${c:-못 닿음}"
done
if [ "$c" != "200" ]; then
    hm 'Web Station 이 꺼져 있거나 포트가 80/443 이 아닙니다'
    hm 'DSM → 패키지 센터 → Web Station → 실행 중인지, 웹 서비스 포털 확인'
fi

line '③ DDNS 주소가 우리 집 주소를 가리키나'
wan=$(curl -s -m 10 https://api.ipify.org 2>/dev/null \
   || curl -s -m 10 https://ifconfig.me 2>/dev/null)
dns=$(getent hosts "$DDNS" 2>/dev/null | awk '{print $1}' | head -1)
[ -z "$dns" ] && dns=$(nslookup "$DDNS" 2>/dev/null | awk '/^Address: /{print $2}' | tail -1)
printf '   지금 우리 밖 주소(WAN): %s\n' "${wan:-못 알아냄}"
printf '   %s 가 가리키는 곳: %s\n' "$DDNS" "${dns:-못 알아냄}"
if [ -n "$wan" ] && [ "$wan" = "$dns" ]; then
    ok 'DDNS 가 제대로 우리를 가리킵니다'
elif [ -n "$wan" ] && [ -n "$dns" ]; then
    no 'DDNS 가 딴 곳을 가리킵니다 — DSM → 제어판 → 외부 액세스 → DDNS 에서 [지금 업데이트]'
else
    hm '알아내지 못했습니다 (NAS 가 인터넷으로 못 나가는 중일 수 있습니다)'
fi

line '④ 인증서 (https 가 되나 · 언제까지 쓰나)'
cert=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$DDNS" 2>/dev/null \
      | openssl x509 -noout -subject -issuer -enddate 2>/dev/null)
if [ -n "$cert" ]; then
    printf '%s\n' "$cert" | sed 's/^/   /'
    echo "$cert" | grep -q "CN *= *$DDNS" \
      && ok "그 주소 것으로 잡혀 있습니다" \
      || hm "딴 이름 인증서입니다 — DSM → 제어판 → 보안 → 인증서 → [설정] 에서 '시스템 기본 설정' 을 $DDNS 로"

    # ── 📅 <<언제까지 쓰나>> ──────────────────────────────────────
    #  Let's Encrypt 는 90 일짜리입니다. 시놀로지가 보통 만료 30 일 전에
    #  저절로 새로 받아 둡니다 — 다만 그때 <<80 번 포트가 열려 있어야>>
    #  합니다. 닫혀 있으면 조용히 실패하고, 만료일이 되면 경고가 다시
    #  뜹니다. 그래서 남은 날을 세어 미리 알려 줍니다.
    end=$(echo "$cert" | sed -n 's/^notAfter=//p')
    if [ -n "$end" ]; then
        es=$(date -d "$end" +%s 2>/dev/null)
        ns=$(date +%s 2>/dev/null)
        if [ -n "$es" ] && [ -n "$ns" ]; then
            left=$(( (es - ns) / 86400 ))
            printf '   📅 남은 날: %s일  (만료 %s)\n' "$left" "$end"
            if   [ "$left" -lt 0 ];  then no  "이미 만료됐습니다 — 바로 새로 받아야 합니다"
            elif [ "$left" -lt 15 ]; then no  "곧 만료입니다. 저절로 갱신이 안 되고 있는 것 같습니다"
            elif [ "$left" -lt 30 ]; then hm  "갱신할 때가 됐습니다 — 80 번 포트가 열려 있는지 봐 주세요"
            else ok "넉넉합니다 (보통 만료 30일 전에 저절로 갱신됩니다)"
            fi
            if [ "$left" -lt 30 ]; then
                hm "저절로 갱신되려면 <<바깥 80 번 포트>> 가 열려 있어야 합니다 (⑤ 참고)"
            fi
        fi
    fi
else
    hm '인증서를 읽지 못했습니다 (443 이 안 열렸을 수 있습니다)'
fi

line '⑤ 밖에서 들어오는 길 (공유기 포트포워딩)'
if [ -n "$wan" ]; then
    for pt in 443 80; do
        c=$(curl -sk -o /dev/null -m 10 -w '%{http_code}' \
            "https://$DDNS:$pt/brand/brand.html" 2>/dev/null)
        [ "$pt" = "80" ] && c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' \
            "http://$DDNS/brand/brand.html" 2>/dev/null)
        if [ "$c" = "200" ]; then ok "포트 $pt — 밖에서 들어옵니다 (200)"
        else no "포트 $pt — 아직 막혀 있습니다 (${c:-못 닿음})"; fi
    done
    hm 'NAS 안에서 밖 주소로 부르는 것은 공유기에 따라 막히기도 합니다'
    hm '휴대폰 LTE(와이파이 끄고)로 그 주소를 한 번 열어 보시는 것이 가장 확실합니다'
else
    hm '밖 주소를 몰라 건너뜁니다'
fi

line '⑥ 옛 trycloudflare 터널'
if command -v pgrep >/dev/null 2>&1 && pgrep -f cloudflared >/dev/null 2>&1; then
    hm '아직 cloudflared 가 돌고 있습니다 — 고정 주소로 옮긴 뒤에는 꺼 주세요'
    pgrep -af cloudflared 2>/dev/null | head -3 | sed 's/^/     /'
else
    ok '돌고 있지 않습니다 (끊긴 그 주소가 이것 때문입니다)'
fi

line '── 다음에 할 일 ──'
cat <<'TXT'
  ❌ 가 하나도 없으면 끝났습니다. 아래 주소를 직원들에게 알려 주세요.
      https://DDNS주소/brand/brand.html

  ② 가 ❌  → Web Station 을 켜고 80/443 으로 맞춥니다
  ③ 이 ❌  → DSM → 제어판 → 외부 액세스 → DDNS → [지금 업데이트]
  ④ 가 ⚠️  → DSM → 제어판 → 보안 → 인증서 → [설정] 에서
             「시스템 기본 설정」 을 그 주소 인증서로 바꿉니다
             (이미 있는 인증서를 쓰면 됩니다 — 새로 받지 않아도 됩니다)
  ⑤ 가 ❌  → 공유기 설정에서 포트포워딩: 바깥 443 → NAS 내부IP 443
             (공유기 종류를 알려 주시면 그 기종에 맞춰 짚어 드립니다)
TXT
cat <<'TXT'

  📅 이 점검을 <<달마다 저절로>> 돌리려면
     DSM → 제어판 → 작업 스케줄러 → [생성] → 예약된 작업 → 사용자 정의 스크립트
       · 일정: 매달 1일
       · 명령: sh /volume1/web/brand/fixed-url-check.sh
       · 알림: 「스크립트 출력 세부 정보를 통해 실행」 체크 + 메일 주소
     인증서가 저절로 갱신 안 되고 있으면 만료 전에 메일이 옵니다.
TXT
printf '\n'
