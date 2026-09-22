#!/bin/bash
cd "$(dirname "$0")" || exit 1
echo
echo "  아파트스퀘어 영상 제작실을 시작합니다..."
echo
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js 가 설치되어 있지 않습니다."
  echo "  https://nodejs.org 에서 LTS 버전을 받아 설치한 뒤 다시 실행하세요."
  echo
  read -r -p "엔터를 누르면 닫힙니다."
  exit 1
fi
if [ ! -f "설정.txt" ]; then
  echo "  설정.txt 가 없습니다. 설정-예시.txt 를 복사해서"
  echo "  이름을 설정.txt 로 바꾸고 API 키를 채워 주세요."
  echo
  read -r -p "엔터를 누르면 닫힙니다."
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "  처음 실행이라 준비를 합니다. 1~2분 걸립니다..."
  npm install --omit=dev --no-audit --no-fund
fi
node server.mjs
