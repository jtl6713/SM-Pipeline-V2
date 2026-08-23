@echo off
cd /d %~dp0
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
set PORT=3350
python app.py
pause
