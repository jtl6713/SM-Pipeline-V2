<#
.SYNOPSIS
  First-time install for YouTube Uploader Miami local runtime.

.DESCRIPTION
  Copies Git source into Services\youtube-uploader-miami\service, seeds .env from
  the NYC uploader (same Google OAuth app + shared secret; separate refresh token
  when Miami OAuth is completed), starts hidden on :3343, and optionally patches
  the Cloudflare tunnel when CLOUDFLARE_API_TOKEN is set.
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [switch]$SkipTunnel,
    [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'

$SourceDir = Join-Path $RepoRoot 'services\youtube-uploader'
$RuntimeDir = Join-Path $PipelineRoot 'Services\youtube-uploader-miami\service'
$NycEnv = Join-Path $PipelineRoot 'Services\youtube-uploader-nyc\service\.env'
$MiamiEnv = Join-Path $RuntimeDir '.env'
$HiddenStart = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'
$TunnelScript = Join-Path $RepoRoot 'deploy\local-services\configure-youtube-upload-miami-hostname.ps1'

if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "Missing Git source: $SourceDir"
}
if (-not (Test-Path -LiteralPath $NycEnv)) {
    throw "Missing NYC uploader .env template: $NycEnv"
}

Write-Host ''
Write-Host 'Bootstrap YouTube Uploader Miami' -ForegroundColor Cyan
Write-Host "Runtime: $RuntimeDir"
Write-Host ''

if (-not (Test-Path -LiteralPath $RuntimeDir)) {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
}

$copyNames = @(
    'youtube-upload-service.js',
    'youtube-oauth-setup.js',
    'youtube-oauth-setup-both-scopes.js',
    'package.json',
    'Dockerfile',
    'YouTube_OAuth_Next_Steps.ps1',
    '.gitignore'
)
foreach ($name in $copyNames) {
    $src = Join-Path $SourceDir $name
    if (-not (Test-Path -LiteralPath $src)) { continue }
    Copy-Item -LiteralPath $src -Destination (Join-Path $RuntimeDir $name) -Force
}

foreach ($dirName in @('data', 'tmp')) {
    $dir = Join-Path $RuntimeDir $dirName
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

$envLines = Get-Content -LiteralPath $NycEnv
$nextEnv = foreach ($line in $envLines) {
    if ($line -match '^\s*PORT\s*=') { 'PORT=3343' }
    elseif ($line -match '^\s*YOUTUBE_JOB_STORE\s*=') { 'YOUTUBE_JOB_STORE=./data/youtube-jobs.json' }
    elseif ($line -match '^\s*YOUTUBE_TEMP_DIR\s*=') { 'YOUTUBE_TEMP_DIR=./tmp' }
    else { $line }
}
$nextEnv | Set-Content -LiteralPath $MiamiEnv -Encoding UTF8
Write-Host 'Seeded .env from NYC uploader (PORT=3343, separate data/).' -ForegroundColor Green
Write-Host 'Run Miami OAuth when ready: node youtube-oauth-setup-both-scopes.js' -ForegroundColor Yellow

if (-not $SkipStart) {
    if (-not (Test-Path -LiteralPath $HiddenStart)) {
        throw "Missing hidden starter: $HiddenStart"
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HiddenStart -Service youtube-uploader-miami -StopFirst
    if ($LASTEXITCODE -ne 0) {
        throw "Hidden start failed for youtube-uploader-miami (exit $LASTEXITCODE)"
    }
    Start-Sleep -Seconds 3
    try {
        $local = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3343/health' -TimeoutSec 10
        Write-Host "PASS local health HTTP $($local.StatusCode)" -ForegroundColor Green
    } catch {
        throw "Local health failed after start: $($_.Exception.Message)"
    }
}

if (-not $SkipTunnel -and $env:CLOUDFLARE_API_TOKEN) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TunnelScript
} elseif (-not $SkipTunnel) {
    Write-Host 'CLOUDFLARE_API_TOKEN not set; skipping tunnel patch.' -ForegroundColor Yellow
    Write-Host "Run configure-youtube-upload-miami-hostname.ps1 or the GitHub workflow after setting the token." -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Bootstrap finished.' -ForegroundColor Green
