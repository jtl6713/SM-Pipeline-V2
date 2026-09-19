<#
.SYNOPSIS
  First-time install / OAuth repair for YouTube Uploader LA local runtime.

.DESCRIPTION
  Copies Git source into Services\youtube-uploader-la\service. After bootstrap,
  run OAuth with the LA Shining Google account and verify channel_id via
  GET /youtube/oauth/status (must be UCVt3nBxRfPuuxxduuxmz9sw, not Miami).
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'

$SourceDir = Join-Path $RepoRoot 'services\youtube-uploader'
$RuntimeDir = Join-Path $PipelineRoot 'Services\youtube-uploader-la\service'
$ChicagoEnv = Join-Path $PipelineRoot 'Services\youtube-uploader\service\.env'
$LaEnv = Join-Path $RuntimeDir '.env'
$HiddenStart = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'

if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "Missing Git source: $SourceDir"
}
if (-not (Test-Path -LiteralPath $ChicagoEnv)) {
    throw "Missing Chicago uploader .env template: $ChicagoEnv"
}

Write-Host ''
Write-Host 'Bootstrap YouTube Uploader LA' -ForegroundColor Cyan
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
    Copy-Item -Force (Join-Path $SourceDir $name) (Join-Path $RuntimeDir $name)
}

if (-not (Test-Path -LiteralPath $LaEnv)) {
    Copy-Item -Force $ChicagoEnv $LaEnv
    (Get-Content -LiteralPath $LaEnv) |
        ForEach-Object { $_ -replace '^PORT=3340', 'PORT=3341' } |
        Set-Content -LiteralPath $LaEnv -Encoding UTF8
    Write-Host 'Seeded LA .env from Chicago uploader (replace GOOGLE_REFRESH_TOKEN after OAuth).' -ForegroundColor Yellow
}

Push-Location $RuntimeDir
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        Write-Host 'Installing npm dependencies...'
        npm install --omit=dev
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Next: authorize LA Shining (not Miami) with both scopes:' -ForegroundColor Yellow
Write-Host "  cd `"$RuntimeDir`""
Write-Host '  node .\youtube-oauth-setup-both-scopes.js'
Write-Host '  # paste printed GOOGLE_REFRESH_TOKEN into .env, restart youtube-uploader-la'
Write-Host ''
Write-Host 'Verify: GET https://youtube-upload-la.chicagoshining.com/youtube/oauth/status'
Write-Host '  channel_id must be UCVt3nBxRfPuuxxduuxmz9sw (LA Shining)'
Write-Host ''

if (-not $SkipStart) {
    & $HiddenStart -Service 'youtube-uploader-la' -StopFirst
}
