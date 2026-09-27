# Add / repair ops.chicagoshining.com on the existing named Cloudflare tunnel.
#
# Tunnel is remotely managed (cloudflared Windows service uses --token).
# Prefer the API script when CLOUDFLARE_API_TOKEN is set — that also restores
# watermark.chicagoshining.com -> :3011 if ops accidentally pointed at watermark.

Write-Host ''
Write-Host 'Cloudflare Tunnel — Ops Dashboard hostname' -ForegroundColor Cyan
Write-Host '  ops.chicagoshining.com  ->  http://localhost:3361' -ForegroundColor Green
Write-Host 'Require Cloudflare Access (your email only) and DASHBOARD_TOKEN in Services\ops-dashboard\.env' -ForegroundColor Yellow
Write-Host ''

$configure = Join-Path $PSScriptRoot 'configure-ops-dashboard-hostname.ps1'
if ($env:CLOUDFLARE_API_TOKEN -and (Test-Path -LiteralPath $configure)) {
    Write-Host 'CLOUDFLARE_API_TOKEN set — running configure-ops-dashboard-hostname.ps1' -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $configure
    exit $LASTEXITCODE
}

Write-Host 'No CLOUDFLARE_API_TOKEN in this shell. Opening the Zero Trust tunnel editor.' -ForegroundColor Yellow
Write-Host 'Set Public Hostname ops.chicagoshining.com -> http://localhost:3361' -ForegroundColor Yellow
Write-Host 'Also confirm watermark.chicagoshining.com -> http://localhost:3011' -ForegroundColor Yellow
Start-Process 'https://one.dash.cloudflare.com/cbb5651c94e9bd2efc4594dc87229acb/networks/tunnels/f7a22f0f-f760-4e16-a085-3538d22981f1'
