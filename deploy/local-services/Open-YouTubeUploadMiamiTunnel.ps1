# Open the named Cloudflare tunnel editor for Miami YouTube uploads.
$TunnelDashboard = 'https://one.dash.cloudflare.com/cbb5651c94e9bd2efc4594dc87229acb/networks/tunnels/f7a22f0f-f760-4e16-a085-3538d22981f1'
Write-Host ''
Write-Host 'Miami YouTube uploader tunnel' -ForegroundColor Cyan
Write-Host 'Public hostname: youtube-upload-miami.chicagoshining.com -> http://localhost:3343'
Write-Host 'DNS (if missing): proxied CNAME youtube-upload-miami -> f7a22f0f-f760-4e16-a085-3538d22981f1.cfargotunnel.com'
Write-Host ''
Start-Process $TunnelDashboard
