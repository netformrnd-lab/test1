@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   아파트스퀘어 영상 제작실을 시작합니다...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js 가 설치되어 있지 않습니다.
  echo   https://nodejs.org 에서 LTS 버전을 받아 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)
if not exist "설정.txt" (
  echo   설정.txt 가 없습니다. 설정-예시.txt 를 복사해서
  echo   이름을 설정.txt 로 바꾸고 API 키를 채워 주세요.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo   처음 실행이라 준비를 합니다. 1~2분 걸립니다...
  call npm install --omit=dev --no-audit --no-fund
)
node server.mjs
pause
