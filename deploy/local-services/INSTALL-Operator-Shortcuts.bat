@echo off
setlocal
echo.
echo Install / refresh ChicagoShining Pipeline operator shortcuts and
echo archive unused Start-Stop-Verify legacy files.
echo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Deployment-Shortcuts.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo FAIL - installer did not complete.
pause
exit /b %RC%
