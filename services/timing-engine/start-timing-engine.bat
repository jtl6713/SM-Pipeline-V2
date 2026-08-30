@echo off
cd /d %~dp0
set PORT=3336
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
python app.py
pause
