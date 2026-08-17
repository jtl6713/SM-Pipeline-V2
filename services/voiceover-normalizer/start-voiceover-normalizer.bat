@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo ERROR: ffmpeg is not installed or is not on PATH.
  echo Set FFMPEG_PATH to the full ffmpeg.exe path before starting.
  pause
  exit /b 1
)
set PORT=3012
node voiceover-normalizer.js
