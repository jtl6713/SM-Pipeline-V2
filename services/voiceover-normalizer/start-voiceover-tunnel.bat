@echo off
setlocal
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo ERROR: cloudflared is not installed or is not on PATH.
  pause
  exit /b 1
)
cloudflared tunnel --url http://localhost:3012
