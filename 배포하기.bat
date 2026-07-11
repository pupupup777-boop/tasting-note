@echo off
cd /d "%~dp0"
echo.
echo  ============================================
echo    chill-sip 배포 시작 (GitHub push - Vercel)
echo  ============================================
echo.
git add -A
git commit -m "update: %date% %time%"
git push origin main
echo.
if %errorlevel%==0 (
  echo  ============================================
  echo    push 완료! Vercel이 1~2분 내 자동 배포합니다.
  echo    확인: https://vercel.com/dashboard
  echo  ============================================
) else (
  echo  [문제 발생] 위 메시지를 복사해서 Claude에게 보여주세요.
)
echo.
pause
