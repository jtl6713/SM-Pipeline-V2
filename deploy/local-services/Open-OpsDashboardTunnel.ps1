# Add ops.chicagoshining.com to the existing named Cloudflare tunnel.
#
# Tunnel is remotely managed (cloudflared Windows service uses --token).
# Also create a Cloudflare Access app on this hostname before using it from the internet.

Write-Host ''
Write-Host 'Cloudflare Tunnel — Ops Dashboard hostname' -ForegroundColor Cyan
Write-Host '  ops.chicagoshining.com  ->  http://localhost:3361' -ForegroundColor Green
Write-Host 'Require Cloudflare Access (your email only) and DASHBOARD_TOKEN in Services\ops-dashboard\.env' -ForegroundColor Yellow
Write-Host ''
Start-Process 'https://one.dash.cloudflare.com/cbb5651c94e9bd2efc4594dc87229acb/networks/tunnels/f7a22f0f-f760-4e16-a085-3538d22981f1'
