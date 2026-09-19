# Add youtube-upload-miami.chicagoshining.com to the named Cloudflare tunnel.
#
# Requires:
#   $env:CLOUDFLARE_API_TOKEN  (Account: Cloudflare Tunnel Edit)
#
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$AccountId = if ($env:CLOUDFLARE_ACCOUNT_ID) { $env:CLOUDFLARE_ACCOUNT_ID } else { 'cbb5651c94e9bd2efc4594dc87229acb' }
$TunnelId = 'f7a22f0f-f760-4e16-a085-3538d22981f1'
$Hostname = 'youtube-upload-miami.chicagoshining.com'
$LocalService = 'http://localhost:3343'
$PublicHealth = "https://$Hostname/health"

function Invoke-CfApi {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    if (-not $env:CLOUDFLARE_API_TOKEN) {
        throw 'CLOUDFLARE_API_TOKEN is not set. Create a token with Cloudflare Tunnel Edit, then run: $env:CLOUDFLARE_API_TOKEN = "<token>"'
    }
    $uri = "https://api.cloudflare.com/client/v4$Path"
    $headers = @{
        Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)"
        'Content-Type' = 'application/json'
    }
    if ($null -ne $Body) {
        $json = ($Body | ConvertTo-Json -Depth 20 -Compress)
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
}

Write-Host ''
Write-Host 'YouTube Uploader Miami tunnel hostname' -ForegroundColor Cyan
Write-Host "Account:  $AccountId"
Write-Host "Tunnel:   $TunnelId"
Write-Host "Hostname: $Hostname -> $LocalService"
Write-Host ''

Write-Host 'Reading current tunnel ingress...' -ForegroundColor Cyan
$tunnelConfig = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/cfd_tunnel/$TunnelId/configurations"
$ingress = @()
if ($tunnelConfig.result.config.ingress) {
    $ingress = @($tunnelConfig.result.config.ingress)
}

$filtered = @()
foreach ($rule in $ingress) {
    if ($rule.hostname -and [string]$rule.hostname -eq $Hostname) { continue }
    if (-not $rule.hostname -and [string]$rule.service -match '^http_status:') { continue }
    $filtered += $rule
}
$filtered += @{
    hostname = $Hostname
    service = $LocalService
    originRequest = @{}
}
$filtered += @{ service = 'http_status:404' }

Write-Host 'Writing tunnel ingress...' -ForegroundColor Cyan
$result = Invoke-CfApi -Method PUT -Path "/accounts/$AccountId/cfd_tunnel/$TunnelId/configurations" -Body @{
    config = @{ ingress = $filtered }
}
if (-not $result.success) {
    throw ("Cloudflare tunnel update failed: " + ($result | ConvertTo-Json -Compress))
}
Write-Host 'PASS tunnel ingress updated.' -ForegroundColor Green

Write-Host ''
Write-Host 'Waiting for public /health (up to 3 minutes)...' -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri $PublicHealth -UseBasicParsing -TimeoutSec 10
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
            Write-Host "PASS public health HTTP $($r.StatusCode)" -ForegroundColor Green
            Write-Host $r.Content
            exit 0
        }
    } catch {
        Start-Sleep -Seconds 5
    }
}

Write-Host "WARN public route not reachable yet: $PublicHealth" -ForegroundColor Yellow
Write-Host 'Confirm the Miami uploader is listening on :3343, then retry VERIFY.' -ForegroundColor Yellow
exit 1
