@echo off
cd /d "%~dp0"
set PORT=3336
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
)
".venv\Scripts\python.exe" app.py
