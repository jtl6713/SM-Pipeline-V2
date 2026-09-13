<#
.SYNOPSIS
  Copy Ops Dashboard into Services\, ensure a token, start it hidden, open the local URL.
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [switch]$NoStart,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Source = Join-Path $RepoRoot 'services\ops-dashboard'
$Runtime = Join-Path $PipelineRoot 'Services\ops-dashboard'
$Hidden = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'

if (-not (Test-Path -LiteralPath (Join-Path $Source 'server.js') -PathType Leaf)) {
    throw "Ops Dashboard source missing: $Source"
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
foreach ($name in @('server.js', 'catalog.json', 'README.md', '.env.example')) {
    Copy-Item -LiteralPath (Join-Path $Source $name) -Destination (Join-Path $Runtime $name) -Force
}
$publicSrc = Join-Path $Source 'public'
$publicDst = Join-Path $Runtime 'public'
New-Item -ItemType Directory -Force -Path $publicDst | Out-Null
Copy-Item -LiteralPath (Join-Path $publicSrc 'index.html') -Destination (Join-Path $publicDst 'index.html') -Force

$envPath = Join-Path $Runtime '.env'
$token = ''
if (Test-Path -LiteralPath $envPath -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^DASHBOARD_TOKEN=(.+)$') { $token = $Matches[1].Trim() }
    }
}
if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $envText = @"
PORT=3361
BIND=127.0.0.1
DASHBOARD_TOKEN=$token
PIPELINE_ROOT=$PipelineRoot
REPO_ROOT=$RepoRoot
"@
    [System.IO.File]::WriteAllText($envPath, $envText, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Wrote $envPath with a new DASHBOARD_TOKEN." -ForegroundColor Yellow
} else {
    Write-Host "Kept existing $envPath" -ForegroundColor DarkGray
}

if (-not $NoStart) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Hidden -Service ops-dashboard -StopFirst
    if ($LASTEXITCODE -ne 0) { throw "Hidden start failed, exit $LASTEXITCODE" }
}

$url = "http://127.0.0.1:3361/?token=$token"
Write-Host "Local dashboard: $url" -ForegroundColor Green
Write-Host 'Do not put this URL on the public internet. For remote access, add ops.chicagoshining.com behind Cloudflare Access and keep the token.'
if (-not $NoBrowser) {
    Start-Process $url
}
