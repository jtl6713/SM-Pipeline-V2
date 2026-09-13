@echo off
setlocal
set "INSTALLER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Install-OpsDashboard.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
exit /b %ERRORLEVEL%
