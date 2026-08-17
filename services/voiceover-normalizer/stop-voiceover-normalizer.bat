@echo off
setlocal
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3012" ^| findstr "LISTENING"') do (
  echo Stopping PID %%a on port 3012...
  taskkill /PID %%a /F >nul 2>nul
)
echo Voiceover normalizer stop command complete.
pause
