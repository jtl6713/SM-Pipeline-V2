param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = '',
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PipelineRoot 'Source Control\SM-Pipeline-V2'
}

$SourceRoot = Join-Path $RepoRoot 'services\video-compressor'
$RuntimeRoot = Join-Path $PipelineRoot 'Services\Video_Compressor'
$BackupRoot = Join-Path $PipelineRoot 'Deployment Backups\Local Services\video-compressor'
$Port = 3335

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Test-Health {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 4
        return ($r.ok -eq $true -and $r.ffmpeg -eq $true -and $r.ffprobe -eq $true)
    }
    catch {
        return $false
    }
}

Write-Step 'Validate source and prerequisites'
if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
    throw "Video compressor source not found: $SourceRoot`nRun git pull in the source-control checkout first."
}
if (-not (Get-Command python.exe -ErrorAction SilentlyContinue) -and -not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
    throw 'Python was not found on PATH.'
}
if (-not (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)) {
    throw 'ffmpeg.exe was not found on PATH.'
}
if (-not (Get-Command ffprobe.exe -ErrorAction SilentlyContinue)) {
    throw 'ffprobe.exe was not found on PATH.'
}

if (Test-Health) {
    Write-Host "Video Compressor is already healthy on port $Port. No install performed." -ForegroundColor Green
    exit 0
}

$existingListener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($existingListener.Count -gt 0) {
    throw "Port $Port is already in use by another process. No changes were made."
}

Write-Host "Source : $SourceRoot"
Write-Host "Runtime: $RuntimeRoot"
Write-Host "Port   : $Port"

if (-not $Yes) {
    $answer = Read-Host 'Install/update this local service now? Type YES to continue'
    if ($answer -ne 'YES') {
        Write-Host 'Cancelled. No changes made.' -ForegroundColor Yellow
        exit 0
    }
}

if (Test-Path -LiteralPath $RuntimeRoot -PathType Container) {
    Write-Step 'Back up existing runtime folder'
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $BackupRoot $stamp
    New-Item -ItemType Directory -Force -Path $backup | Out-Null
    Get-ChildItem -LiteralPath $RuntimeRoot -Force | ForEach-Object {
        if ($_.Name -ne 'credentials') {
            Copy-Item -LiteralPath $_.FullName -Destination $backup -Recurse -Force
        }
    }
    Write-Host "Backup: $backup" -ForegroundColor Green
    Write-Host 'Local credentials were intentionally not copied into the deployment backup.' -ForegroundColor DarkGray
}

Write-Step 'Install source without runtime artifacts'
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

$runtimePreserve = @('.venv','venv','work','public','credentials')
Get-ChildItem -LiteralPath $RuntimeRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($runtimePreserve -notcontains $_.Name) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

Get-ChildItem -LiteralPath $SourceRoot -Force | ForEach-Object {
    if ($_.Name -in @('README.md','.env.example')) { return }
    Copy-Item -LiteralPath $_.FullName -Destination $RuntimeRoot -Recurse -Force
}

$DriveCredential = Join-Path $RuntimeRoot 'credentials\google-drive-service-account.json'
if (Test-Path -LiteralPath $DriveCredential -PathType Leaf) {
    Write-Host 'PASS - Preserved private Google Drive service-account credential.' -ForegroundColor Green
}
else {
    Write-Warning 'Private Google Drive downloads will remain unavailable until the service-account JSON is installed under runtime credentials.'
}

Write-Step 'Create/update Python virtual environment'
$VenvPython = Join-Path $RuntimeRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
    if (Get-Command py.exe -ErrorAction SilentlyContinue) {
        & py.exe -3 -m venv (Join-Path $RuntimeRoot '.venv')
    }
    else {
        & python.exe -m venv (Join-Path $RuntimeRoot '.venv')
    }
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create Python virtual environment.' }
}

& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'pip upgrade failed.' }
& $VenvPython -m pip install -r (Join-Path $RuntimeRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Step 'Start Video Compressor'
$escapedRoot = $RuntimeRoot.Replace("'","''")
$launcher = @"
`$Host.UI.RawUI.WindowTitle = '7 LOC Video Compressor :3335'
Set-Location -LiteralPath '$escapedRoot'
& '.\start-video-compressor.bat'
"@
$launcherPath = Join-Path $env:TEMP 'start-smv2-video-compressor.ps1'
[System.IO.File]::WriteAllText($launcherPath,$launcher,[System.Text.UTF8Encoding]::new($false))

# Launch PowerShell directly. Passing a multi-word tab title through wt.exe/Start-Process
# is fragile because Windows command-line quoting can cause wt.exe to treat the title as
# the command executable. Direct PowerShell launch is deterministic and matches the
# service's actual runtime requirement.
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-File',('"' + $launcherPath + '"')) | Out-Null

Write-Step 'Verify local health'
$deadline = (Get-Date).AddSeconds(60)
do {
    if (Test-Health) {
        $health = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5
        Write-Host 'PASS local Video Compressor health.' -ForegroundColor Green
        $health | ConvertTo-Json -Depth 4
        Write-Host ''
        Write-Host 'Next safe step: add/verify the permanent Cloudflare route and then run a disposable A1 compression test. CloudConvert remains unchanged.' -ForegroundColor Cyan
        exit 0
    }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

throw "Video Compressor did not become healthy on http://localhost:$Port/health within 60 seconds. CloudConvert/A1 were not changed."
