#!/bin/bash
# 더블클릭하면 실행됩니다. 터미널에 아무것도 안 쳐도 됩니다.
cd "$(dirname "$0")" || exit 1

# node를 못 찾을 때만 흔한 설치 경로를 뒤에 덧붙인다 (기존 PATH를 덮지 않는다)
if ! command -v node >/dev/null 2>&1; then
  export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
fi

pause_and_exit() { echo ""; echo "  ─ 아무 키나 누르면 창이 닫힙니다 ─"; read -n 1 -s; exit "$1"; }

clear
echo "============================================="
echo "  CRM마케팅팀 AI 오피스 — 인터넷에 올리기"
echo "============================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [!] Node.js를 찾지 못했습니다."
  echo ""
  echo "      https://nodejs.org 에서 왼쪽 LTS 버튼을 눌러"
  echo "      설치한 뒤, 이 파일을 다시 더블클릭하세요."
  echo ""
  echo "      (이미 설치하셨다면 컴퓨터를 한 번 껐다 켜주세요)"
  pause_and_exit 1
fi

NODE_VER="$(node -v 2>/dev/null)"
NODE_MAJOR="$(printf '%s' "$NODE_VER" | sed 's/^v//' | cut -d. -f1)"
case "$NODE_MAJOR" in ''|*[!0-9]*) NODE_MAJOR=0 ;; esac

if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  [!] Node.js 버전이 낮습니다. (지금 $NODE_VER, 22 이상 필요)"
  echo ""
  echo "      https://nodejs.org 에서 왼쪽 LTS 버튼을 눌러"
  echo "      다시 설치한 뒤, 컴퓨터를 껐다 켜고"
  echo "      이 파일을 다시 더블클릭하세요."
  pause_and_exit 1
fi

echo "  Node.js 확인됨: $NODE_VER"
echo ""
echo "---------------------------------------------"
echo "  1/2  Cloudflare 로그인"
echo "---------------------------------------------"
echo "  잠시 후 브라우저가 열립니다."
echo "  파란색 [Allow] 버튼을 눌러주세요."
echo ""
if ! npx --yes wrangler@4.92.0 login; then
  echo ""
  echo "  [!] 로그인을 끝내지 못했습니다. 다시 더블클릭해 주세요."
  pause_and_exit 1
fi

echo ""
echo "---------------------------------------------"
echo "  2/2  올리는 중 (1~2분 걸립니다)"
echo "---------------------------------------------"
echo ""
if ! npx --yes wrangler@4.92.0 deploy; then
  echo ""
  echo "  [!] 올리기에 실패했습니다."
  echo "      위에 나온 빨간 글씨를 복사해서 Claude에게 보여주세요."
  pause_and_exit 1
fi

echo ""
echo "============================================="
echo "  끝났습니다!"
echo ""
echo "  위에 https://crm-ai-office... 로 시작하는"
echo "  주소가 보이면 그게 우리 사무실 주소입니다."
echo "  드래그해서 복사한 뒤 브라우저에 붙여넣어 보세요."
echo "============================================="
pause_and_exit 0
