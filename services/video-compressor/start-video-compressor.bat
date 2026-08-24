@echo off
setlocal
cd /d "%~dp0"
if not defined PUBLIC_BASE_URL set "PUBLIC_BASE_URL=https://compress.chicagoshining.com"
if not defined GOOGLE_DRIVE_CREDENTIALS_FILE set "GOOGLE_DRIVE_CREDENTIALS_FILE=%~dp0credentials\google-drive-service-account.json"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" app.py
) else if exist "venv\Scripts\python.exe" (
  "venv\Scripts\python.exe" app.py
) else (
  python app.py
)
endlocal
