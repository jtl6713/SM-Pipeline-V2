@echo off
cd /d %~dp0
set PORT=3334
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
python app.py
pause
