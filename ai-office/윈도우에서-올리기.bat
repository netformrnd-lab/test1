@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
cls
echo =============================================
echo   CRM마케팅팀 AI 오피스 - 인터넷에 올리기
echo =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] Node.js를 찾지 못했습니다.
  echo.
  echo       https://nodejs.org 에서 왼쪽 LTS 버튼을 눌러
  echo       설치한 뒤, 이 파일을 다시 더블클릭하세요.
  echo.
  echo       ^(이미 설치하셨다면 컴퓨터를 한 번 껐다 켜주세요^)
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo   [!] Node.js 버전이 낮습니다. ^(22 이상 필요^)
  echo.
  echo       https://nodejs.org 에서 왼쪽 LTS 버튼을 눌러
  echo       다시 설치한 뒤, 컴퓨터를 껐다 켜고
  echo       이 파일을 다시 더블클릭하세요.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do echo   Node.js 확인됨: %%v
echo.
echo ---------------------------------------------
echo   1/2  Cloudflare 로그인
echo ---------------------------------------------
echo   잠시 후 브라우저가 열립니다.
echo   파란색 [Allow] 버튼을 눌러주세요.
echo.
call npx --yes wrangler@4.92.0 login
if errorlevel 1 (
  echo.
  echo   [!] 로그인을 끝내지 못했습니다. 다시 더블클릭해 주세요.
  pause
  exit /b 1
)

echo.
echo ---------------------------------------------
echo   2/2  올리는 중 ^(1~2분 걸립니다^)
echo ---------------------------------------------
echo.
call npx --yes wrangler@4.92.0 deploy
if errorlevel 1 (
  echo.
  echo   [!] 올리기에 실패했습니다.
  echo       위에 나온 빨간 글씨를 복사해서 Claude에게 보여주세요.
  pause
  exit /b 1
)

echo.
echo =============================================
echo   끝났습니다!
echo.
echo   위에 https://crm-ai-office... 로 시작하는
echo   주소가 보이면 그게 우리 사무실 주소입니다.
echo   드래그해서 복사한 뒤 브라우저에 붙여넣어 보세요.
echo =============================================
echo.
pause
