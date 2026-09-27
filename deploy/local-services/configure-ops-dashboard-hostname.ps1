# Point ops.chicagoshining.com at the Ops Dashboard (:3361).
# Also restore watermark.chicagoshining.com -> :3011 when ops accidentally stole that origin.
#
# Requires:
#   $env:CLOUDFLARE_API_TOKEN  (Account: Cloudflare Tunnel Edit)
#
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$AccountId = if ($env:CLOUDFLARE_ACCOUNT_ID) { $env:CLOUDFLARE_ACCOUNT_ID } else { 'cbb5651c94e9bd2efc4594dc87229acb' }
$TunnelId = 'f7a22f0f-f760-4e16-a085-3538d22981f1'

$Desired = @(
    @{ Hostname = 'ops.chicagoshining.com'; LocalService = 'http://localhost:3361'; HealthPath = '/health'; ExpectService = 'ops' },
    @{ Hostname = 'watermark.chicagoshining.com'; LocalService = 'http://localhost:3011'; HealthPath = '/health'; ExpectService = 'watermark' }
)

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
Write-Host 'Cloudflare Tunnel — Ops Dashboard + Watermark hostnames' -ForegroundColor Cyan
Write-Host "Account:  $AccountId"
Write-Host "Tunnel:   $TunnelId"
foreach ($row in $Desired) {
    Write-Host ("  {0} -> {1}" -f $row.Hostname, $row.LocalService)
}
Write-Host ''

Write-Host 'Reading current tunnel ingress...' -ForegroundColor Cyan
$tunnelConfig = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/cfd_tunnel/$TunnelId/configurations"
$ingress = @()
if ($tunnelConfig.result.config.ingress) {
    $ingress = @($tunnelConfig.result.config.ingress)
}

$wanted = @{}
foreach ($row in $Desired) { $wanted[[string]$row.Hostname] = [string]$row.LocalService }

$filtered = @()
foreach ($rule in $ingress) {
    $hostName = if ($rule.hostname) { [string]$rule.hostname } else { '' }
    if ($hostName -and $wanted.ContainsKey($hostName)) { continue }
    if (-not $hostName -and [string]$rule.service -match '^http_status:') { continue }
    $filtered += $rule
}
foreach ($row in $Desired) {
    $filtered += @{
        hostname = [string]$row.Hostname
        service = [string]$row.LocalService
        originRequest = @{}
    }
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

Write-Host 'Ensuring DNS CNAMEs...' -ForegroundColor Cyan
$zone = Invoke-CfApi -Method GET -Path '/zones?name=chicagoshining.com'
$zoneId = [string]$zone.result[0].id
$target = "$TunnelId.cfargotunnel.com"
foreach ($row in $Desired) {
    $Hostname = [string]$row.Hostname
    $existing = Invoke-CfApi -Method GET -Path "/zones/$zoneId/dns_records?name=$Hostname"
    $dnsBody = @{
        type = 'CNAME'
        name = $Hostname
        content = $target
        proxied = $true
        ttl = 1
    }
    if ($existing.result -and $existing.result.Count -gt 0) {
        $recordId = [string]$existing.result[0].id
        $dnsResult = Invoke-CfApi -Method PUT -Path "/zones/$zoneId/dns_records/$recordId" -Body $dnsBody
    } else {
        $dnsResult = Invoke-CfApi -Method POST -Path "/zones/$zoneId/dns_records" -Body $dnsBody
    }
    if (-not $dnsResult.success) {
        throw ("Cloudflare DNS update failed for ${Hostname}: " + ($dnsResult | ConvertTo-Json -Compress))
    }
    Write-Host "PASS DNS CNAME $Hostname -> $target" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Waiting for public /health (up to 3 minutes)...' -ForegroundColor Cyan
Write-Host 'Ops needs Services\ops-dashboard listening on :3361. Watermark needs :3011.' -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes(3)
$pending = [System.Collections.Generic.HashSet[string]]::new()
foreach ($row in $Desired) { [void]$pending.Add([string]$row.Hostname) }
while ((Get-Date) -lt $deadline -and $pending.Count -gt 0) {
    foreach ($row in @($Desired)) {
        $Hostname = [string]$row.Hostname
        if (-not $pending.Contains($Hostname)) { continue }
        try {
            $r = Invoke-WebRequest -Uri ("https://{0}{1}" -f $Hostname, $row.HealthPath) -UseBasicParsing -TimeoutSec 10
            if ($r.StatusCode -eq 200 -and $r.Content -match [regex]::Escape([string]$row.ExpectService)) {
                Write-Host "PASS public health $Hostname" -ForegroundColor Green
                [void]$pending.Remove($Hostname)
            }
        } catch {
            # keep waiting
        }
    }
    if ($pending.Count -gt 0) { Start-Sleep -Seconds 5 }
}
if ($pending.Count -gt 0) {
    Write-Host ("WAITING_FOR_LOCAL_LISTENER: " + (($pending | Sort-Object) -join ', ')) -ForegroundColor Yellow
    Write-Host 'Tunnel ingress is fixed. Start the missing local services, then re-check /health.' -ForegroundColor Yellow
    exit 0
}
Write-Host 'PASS all public health checks.' -ForegroundColor Green
