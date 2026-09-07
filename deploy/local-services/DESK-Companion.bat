@echo off
setlocal
set "COMPANION=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Invoke-DeskCompanion.ps1"
echo Autonomous service desk local companion. Probe public /health; restart/deploy only when mode is infra+.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%COMPANION%" %*
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
