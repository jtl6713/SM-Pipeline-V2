$ErrorActionPreference = "Stop"
$svc = "D:\Content Creation\ChicagoShining Pipeline\Services\youtube-uploader\service"
Set-Location $svc

Write-Host "Current helper scope lines:" -ForegroundColor Cyan
Select-String -Path ".\youtube-oauth-setup.js" -Pattern "youtube\.upload|youtube\.readonly" | ForEach-Object { $_.Line }

Write-Host ""
Write-Host "Run the corrected helper with:" -ForegroundColor Yellow
Write-Host "node .\youtube-oauth-setup-both-scopes.js"
Write-Host ""
Write-Host "After authorization, replace ONLY GOOGLE_REFRESH_TOKEN= in .env with the newly printed refresh token."
Write-Host "Then restart the YouTube uploader service."
