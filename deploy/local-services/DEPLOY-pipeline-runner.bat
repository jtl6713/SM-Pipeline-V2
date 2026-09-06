@echo off
setlocal
echo.
echo Deploy pipeline-runner from GitHub main into Services\pipeline-runner\service
echo and restart the :3350 listener. VERIFY health is not enough.
echo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-SMService.ps1" -Service pipeline-runner
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Pipeline runner deploy failed.
  echo If Git checkout has uncommitted changes, commit or stash them first, then retry.
) else (
  echo.
  echo Confirm https://pipeline.chicagoshining.com/stages lists studio_compress.
  echo A pinned SERVICE_VERSION in .env can still say 2026-08-24 after a good deploy.
)
echo.
pause
exit /b %RC%

