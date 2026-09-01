@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-SMService.ps1" -Service pipeline-runner -Yes
if errorlevel 1 (
  echo Pipeline runner deploy failed.
  exit /b 1
)
echo Confirm https://pipeline.chicagoshining.com/health version is 2026-09-01-clip-poster or newer and /stages lists clip_poster.
endlocal
