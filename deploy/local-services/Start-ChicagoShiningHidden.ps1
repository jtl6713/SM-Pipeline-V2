<#
.SYNOPSIS
  Start one Chicago Shining local service with no extra console window.

.DESCRIPTION
  Used by the hourly companion and Deploy-SMService so START/DEPLOY do not
  pile up Windows Terminal tabs. The process stays alive as the listener.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
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
        'ops-dashboard'
    )]
    [string]$Service,

    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [switch]$StopFirst
)

$ErrorActionPreference = 'Stop'
$PortGuard = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\_startup_helpers\00-port-guard.ps1'

$Map = @{
    'frame-extractor' = @{
        Name = 'Frame Extractor'
        Port = 3334
        Dir = 'Services\Frame_Extractor'
        Title = '1 LOC Frame Extractor :3334'
        Kind = 'python'
        File = 'app.py'
        Venv = $true
        ExtraEnv = @{ PORT = '3334' }
    }
    'remotion-renderer' = @{
        Name = 'Remotion Renderer'
        Port = 3333
        Dir = 'Services\Remotion_Renderer'
        Title = '2 LOC Remotion Render :3333'
        Kind = 'node'
        File = 'render-server.js'
        # Must pin PORT: Ops Dashboard children inherit PORT=3361 and Remotion
        # then binds there while Cloudflare Tunnel still targets :3333 (502).
        ExtraEnv = @{ PORT = '3333' }
    }
    'watermark' = @{
        Name = 'Watermark'
        Port = 3011
        Dir = 'Services\Watermark'
        Title = '3 LOC Watermark :3011'
        Kind = 'node'
        File = 'server.js'
        ExtraEnv = @{ PORT = '3011' }
    }
    'voiceover-normalizer' = @{
        Name = 'Voiceover Normalizer'
        Port = 3012
        Dir = 'Services\voiceover-normalizer\service'
        Title = '4 LOC Voiceover Normalizer :3012'
        Kind = 'node'
        File = 'voiceover-normalizer.js'
        ExtraEnv = @{ PORT = '3012' }
    }
    'youtube-uploader' = @{
        Name = 'YouTube Uploader'
        Port = 3340
        Dir = 'Services\youtube-uploader\service'
        Title = '5 LOC YouTube Uploader :3340'
        Kind = 'node'
        File = 'youtube-upload-service.js'
        ExtraEnv = @{ PORT = '3340' }
    }
    'youtube-uploader-la' = @{
        Name = 'YouTube Uploader LA'
        Port = 3341
        Dir = 'Services\youtube-uploader-la\service'
        Title = '5a LOC YouTube Uploader LA :3341'
        Kind = 'node'
        File = 'youtube-upload-service.js'
        ExtraEnv = @{ PORT = '3341' }
    }
    'youtube-uploader-nyc' = @{
        Name = 'YouTube Uploader NYC'
        Port = 3342
        Dir = 'Services\youtube-uploader-nyc\service'
        Title = '5b LOC YouTube Uploader NYC :3342'
        Kind = 'node'
        File = 'youtube-upload-service.js'
        ExtraEnv = @{ PORT = '3342' }
    }
    'youtube-uploader-miami' = @{
        Name = 'YouTube Uploader Miami'
        Port = 3343
        Dir = 'Services\youtube-uploader-miami\service'
        Title = '5c LOC YouTube Uploader Miami :3343'
        Kind = 'node'
        File = 'youtube-upload-service.js'
        ExtraEnv = @{ PORT = '3343' }
    }
    'pipeline-runner' = @{
        Name = 'Pipeline Runner'
        Port = 3350
        Dir = 'Services\pipeline-runner\service'
        Title = '6 LOC Pipeline Runner :3350'
        Kind = 'python'
        File = 'app.py'
        Venv = $true
        DashB = $true
        ExtraEnv = @{ PORT = '3350'; PYTHONDONTWRITEBYTECODE = '1' }
    }
    'video-compressor' = @{
        Name = 'Video Compressor'
        Port = 3335
        Dir = 'Services\Video_Compressor'
        Title = '7 LOC Video Compressor :3335'
        Kind = 'python'
        File = 'app.py'
        Venv = $true
        ExtraEnv = @{ PUBLIC_BASE_URL = 'https://compress.chicagoshining.com' }
    }
    'timing-engine' = @{
        Name = 'Timing Engine'
        Port = 3336
        Dir = 'Services\timing-engine\service'
        Title = '8 LOC Timing Engine :3336'
        Kind = 'python'
        File = 'app.py'
        Venv = $true
        ExtraEnv = @{ PORT = '3336' }
    }
    'task-organizer' = @{
        Name = 'Task Organizer'
        Port = 3360
        Dir = 'Source Control\chicago-shining-task-organizer'
        Title = '9 LOC Task Organizer :3360'
        Kind = 'uvicorn'
    }
    'ops-dashboard' = @{
        Name = 'Ops Dashboard'
        Port = 3361
        Dir = 'Services\ops-dashboard'
        Title = '10 LOC Ops Dashboard :3361'
        Kind = 'node'
        File = 'server.js'
        ExtraEnv = @{ PORT = '3361' }
        SourceFallback = 'services\ops-dashboard'
    }
}

$cfg = $Map[$Service]
$runtime = Join-Path $PipelineRoot $cfg.Dir
if (-not (Test-Path -LiteralPath $runtime)) {
    if ($cfg.SourceFallback) {
        $fallback = Join-Path $RepoRoot $cfg.SourceFallback
        if (Test-Path -LiteralPath $fallback) {
            Write-Host "Runtime missing; starting Ops Dashboard from Git checkout: $fallback" -ForegroundColor Yellow
            $runtime = $fallback
        }
    }
}
if (-not (Test-Path -LiteralPath $runtime)) {
    throw "Runtime folder missing for ${Service}: $runtime"
}

if ($StopFirst) {
    if (-not (Test-Path -LiteralPath $PortGuard)) {
        throw "Missing port guard: $PortGuard"
    }
    . $PortGuard
    Stop-ListenerOnPort -Port ([int]$cfg.Port) -ServiceName $cfg.Name
}

$logDir = Join-Path $PipelineRoot 'Deployment Logs\Local Services'
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}
$outLog = Join-Path $logDir ("hidden-" + $Service + ".out.log")
$errLog = Join-Path $logDir ("hidden-" + $Service + ".err.log")

$filePath = $null
$argumentList = @()
if ($cfg.Kind -eq 'node') {
    $filePath = (Get-Command node.exe -ErrorAction Stop).Source
    $argumentList = @($cfg.File)
}
elseif ($cfg.Kind -eq 'python') {
    $filePath = Join-Path $runtime '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $filePath)) { $filePath = (Get-Command python.exe -ErrorAction Stop).Source }
    $argumentList = if ($cfg.ContainsKey('DashB') -and $cfg.DashB) { @('-B', 'app.py') } else { @('app.py') }
}
elseif ($cfg.Kind -eq 'uvicorn') {
    $filePath = Join-Path $runtime '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $filePath)) { $filePath = (Get-Command python.exe -ErrorAction Stop).Source }
    $argumentList = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '3360')
}
else {
    throw "Unsupported start kind $($cfg.Kind)"
}

$saved = @{}
# Always force the service port into the child env. Ops / companion parents often
# carry PORT=3361 (ops-dashboard); Node services that read process.env.PORT would
# otherwise steal the wrong listener (Remotion → 3361, public /health 502).
$extraEnv = @{}
if ($cfg.ContainsKey('ExtraEnv') -and $cfg.ExtraEnv) {
    foreach ($key in $cfg.ExtraEnv.Keys) { $extraEnv[$key] = [string]$cfg.ExtraEnv[$key] }
}
if ($cfg.ContainsKey('Port') -and $cfg.Port) {
    $extraEnv['PORT'] = [string]$cfg.Port
}
if ($extraEnv.Count -gt 0) {
    foreach ($key in $extraEnv.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, [string]$extraEnv[$key], 'Process')
    }
}

Write-Host ("Starting {0} hidden on port {1}" -f $cfg.Name, $cfg.Port)
try {
    # File redirects keep pipes open for the life of the child (do not use
    # in-process stdout readers that get disposed when this script exits).
    $p = Start-Process -FilePath $filePath -WorkingDirectory $runtime -ArgumentList $argumentList -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
} finally {
    if ($extraEnv.Count -gt 0) {
        foreach ($key in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
        }
    }
}
if (-not $p) {
    throw "Hidden start failed for $Service"
}
Write-Host ("  pid={0} log={1}" -f $p.Id, $outLog)

# Do not claim success until the configured port answers /health (or the process dies).
# Ops previously showed exit 0 while Remotion crashed on inherited PORT=3361.
$healthUrl = "http://127.0.0.1:$($cfg.Port)/health"
$healthy = $false
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    if ($p.HasExited) {
        $tail = ''
        if (Test-Path -LiteralPath $errLog) {
            $tail = (Get-Content -LiteralPath $errLog -Tail 30 -ErrorAction SilentlyContinue) -join "`n"
        }
        throw ("{0} exited early (code {1}) before {2}. err log:`n{3}" -f $cfg.Name, $p.ExitCode, $healthUrl, $tail)
    }
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
            $healthy = $true
            break
        }
    } catch {
        # still booting
    }
    Start-Sleep -Milliseconds 400
}

if (-not $healthy) {
    throw ("{0} started (pid {1}) but {2} did not respond within 20s. Check {3}" -f $cfg.Name, $p.Id, $healthUrl, $errLog)
}

Write-Host ("  health ok {0}" -f $healthUrl)
exit 0
