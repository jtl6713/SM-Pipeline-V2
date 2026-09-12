@echo off
setlocal EnableExtensions
rem Quality Agent hourly keep-alive. No pause — Task Scheduler would hang.
rem Do not STOP ALL + START ALL. Wrap stock START/VERIFY plus the desk companion.

set "REPO=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2"
set "HOURLY=%REPO%\deploy\local-services\Run-DeskCompanionHourly.ps1"

if not exist "%HOURLY%" (
  echo FAIL - missing hourly runner:
  echo   %HOURLY%
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HOURLY%" %*
exit /b %ERRORLEVEL%
