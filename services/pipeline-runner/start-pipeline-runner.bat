@echo off
cd /d %~dp0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3350" ^| findstr "LISTENING"') do (
  echo Pipeline Runner is already listening on port 3350 with PID %%P. Stop the existing listener before starting another instance.
  exit /b 1
)
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
set PORT=3350
set PYTHONDONTWRITEBYTECODE=1
python -B app.py
pause
