@echo off
setlocal
cd /d "%~dp0"
set PYTHONUNBUFFERED=1
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m ame_bridge
) else (
  py -3 -m ame_bridge
)
endlocal
