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
        'youtube-uploader-nyc',
        'pipeline-runner',
        'video-compressor',
        'timing-engine',
        'task-organizer'
    )]
    [string]$Service,

    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
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
    }
    'watermark' = @{
        Name = 'Watermark'
        Port = 3011
        Dir = 'Services\Watermark'
        Title = '3 LOC Watermark :3011'
        Kind = 'node'
        File = 'server.js'
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
    'youtube-uploader-nyc' = @{
        Name = 'YouTube Uploader NYC'
        Port = 3342
        Dir = 'Services\youtube-uploader-nyc\service'
        Title = '5b LOC YouTube Uploader NYC :3342'
        Kind = 'node'
        File = 'youtube-upload-service.js'
        ExtraEnv = @{ PORT = '3342' }
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
}

$cfg = $Map[$Service]
$runtime = Join-Path $PipelineRoot $cfg.Dir
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
    $argumentList = if ($cfg.DashB) { @('-B', 'app.py') } else { @('app.py') }
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
if ($cfg.ExtraEnv) {
    foreach ($key in $cfg.ExtraEnv.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, [string]$cfg.ExtraEnv[$key], 'Process')
    }
}

Write-Host ("Starting {0} hidden on port {1}" -f $cfg.Name, $cfg.Port)
try {
    $p = Start-Process -FilePath $filePath -WorkingDirectory $runtime -ArgumentList $argumentList -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
} finally {
    if ($cfg.ExtraEnv) {
        foreach ($key in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
        }
    }
}
if (-not $p) {
    throw "Hidden start failed for $Service"
}
Write-Host ("  pid={0} log={1}" -f $p.Id, $outLog)
exit 0
