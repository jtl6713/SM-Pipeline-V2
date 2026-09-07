@echo off
setlocal EnableExtensions
title SYNC Local Git Checkout - SM-Pipeline-V2

rem Keep the local SM-Pipeline-V2 checkout on origin/main.
rem This updates source control only. It does not deploy or restart live services.

set "REPO=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2"

echo.
echo ========================================
echo  SYNC Local Git Checkout
echo ========================================
echo.

if not exist "%REPO%\.git\" (
  echo FAIL - Git checkout not found:
  echo   %REPO%
  echo.
  pause
  exit /b 1
)

cd /d "%REPO%" || (
  echo FAIL - could not open:
  echo   %REPO%
  echo.
  pause
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo FAIL - git.exe is not on PATH. Install Git for Windows, then retry.
  echo.
  pause
  exit /b 1
)

echo Folder: %CD%
echo.

echo --- git checkout main ---
git checkout main
if errorlevel 1 goto :fail

echo.
echo --- git pull --ff-only origin main ---
git pull --ff-only origin main
if errorlevel 1 goto :fail

echo.
echo --- git status ---
git status

echo.
echo --- current commit ---
git rev-parse --short HEAD
git log -1 --format=%%s

echo.
echo PASS - local checkout is current with origin/main.
echo Reminder: Studio in the browser serves Cloudflare Pages; hard-refresh after Worker/Pages deploys.
echo This script does not copy files into Services\ or restart local listeners.
echo.
pause
exit /b 0

:fail
echo.
echo FAIL - git sync did not complete.
echo If you have local commits or a dirty checkout, resolve those first, then retry.
echo.
pause
exit /b 1
