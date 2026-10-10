<#
.SYNOPSIS
  Start every mapped local listener that is down, with no extra console window.
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2'
)

$ErrorActionPreference = 'Stop'
$Hidden = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'
if (-not (Test-Path -LiteralPath $Hidden)) {
    throw "Missing hidden starter: $Hidden"
}

$order = @(
    'frame-extractor',
    'remotion-renderer',
    'watermark',
    'voiceover-normalizer',
    'youtube-uploader',
    'youtube-uploader-la',
    'youtube-uploader-nyc',
    'youtube-uploader-miami',
    'pipeline-runner',
    'video-compressor',
    'timing-engine',
    'task-organizer',
    'ame-bridge',
    'ops-dashboard'
)

function Test-PortListening([int]$Port) {
    return (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0)
}

$ports = @{
    'frame-extractor' = 3334
    'remotion-renderer' = 3333
    'watermark' = 3011
    'voiceover-normalizer' = 3012
    'youtube-uploader' = 3340
    'youtube-uploader-la' = 3341
    'youtube-uploader-nyc' = 3342
    'youtube-uploader-miami' = 3343
    'pipeline-runner' = 3350
    'video-compressor' = 3335
    'timing-engine' = 3336
    'task-organizer' = 3360
    'ame-bridge' = 3344
    'ops-dashboard' = 3361
}

$optionalUntilPresent = @{
    'youtube-uploader-la' = 'Services\youtube-uploader-la\service\youtube-upload-service.js'
    'youtube-uploader-nyc' = 'Services\youtube-uploader-nyc\service\youtube-upload-service.js'
    'youtube-uploader-miami' = 'Services\youtube-uploader-miami\service\youtube-upload-service.js'
    'timing-engine' = 'Services\timing-engine\service\app.py'
    'task-organizer' = 'Source Control\chicago-shining-task-organizer'
    'ops-dashboard' = 'Source Control\SM-Pipeline-V2\services\ops-dashboard\server.js'
}

$failed = New-Object System.Collections.Generic.List[string]
foreach ($svc in $order) {
    $requiredFile = $optionalUntilPresent[$svc]
    if ($requiredFile) {
        $path = Join-Path $PipelineRoot $requiredFile
        if (-not (Test-Path -LiteralPath $path)) {
            Write-Host "SKIP $svc (runtime not present)" -ForegroundColor DarkGray
            continue
        }
    }
    $port = [int]$ports[$svc]
    if (Test-PortListening $port) {
        Write-Host "OK $svc already listening on $port" -ForegroundColor Green
        continue
    }
    Write-Host "START $svc on $port" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Hidden -Service $svc
    if ($LASTEXITCODE -ne 0) {
        $failed.Add("$svc exit $LASTEXITCODE")
    }
}

if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Host "FAIL $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'Hidden START finished.' -ForegroundColor Green
exit 0
