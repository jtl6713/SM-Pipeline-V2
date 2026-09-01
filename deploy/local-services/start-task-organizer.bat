@echo off
cd /d "%~dp0"
set PORT=3360
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
)
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
