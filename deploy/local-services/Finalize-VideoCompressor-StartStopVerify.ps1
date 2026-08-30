param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$RuntimeRoot = Join-Path $PipelineRoot 'Services\Video_Compressor'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
$HelperRoot = Join-Path $ToolsRoot '_startup_helpers'
$BackupRoot = Join-Path $ToolsRoot ('_backups\Video_Compressor_Finalize_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$Marker = 'SMV2 VIDEO COMPRESSOR MANAGED EXTENSION'

function Backup-File([string]$Path) {
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupRoot (Split-Path $Path -Leaf)) -Force
}
function Write-Utf8NoBom([string]$Path,[string]$Text) {
    [System.IO.File]::WriteAllText($Path,$Text,[System.Text.UTF8Encoding]::new($false))
}
function Read-All([string]$Path) { [System.IO.File]::ReadAllText($Path) }

Write-Host 'Validate live Video Compressor' -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri 'http://localhost:3335/health' -TimeoutSec 5
if ($health.ok -ne $true -or $health.ffmpeg -ne $true -or $health.ffprobe -ne $true) {
    throw 'Video Compressor is not healthy on localhost:3335.'
}
Write-Host 'PASS - Video Compressor local health.' -ForegroundColor Green

if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) { throw "Live verifier not found: $VerifyPs1" }
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'start-video-compressor.bat') -PathType Leaf)) { throw 'Video Compressor runtime startup BAT is missing.' }
New-Item -ItemType Directory -Force -Path $HelperRoot | Out-Null

$startHelper = Join-Path $HelperRoot '90-video-compressor-local.ps1'
$stopHelper = Join-Path $HelperRoot '90-stop-video-compressor.ps1'
$startText = @'
$ErrorActionPreference = 'Stop'
$runtime = 'D:\Content Creation\ChicagoShining Pipeline\Services\Video_Compressor'
try {
    $h = Invoke-RestMethod -Uri 'http://localhost:3335/health' -TimeoutSec 3
    if ($h.ok -eq $true) {
        Write-Host 'Video Compressor :3335 is already healthy.' -ForegroundColor Green
        exit 0
    }
} catch {}
if (@(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'Port 3335 is occupied but Video Compressor health is not OK.'
}
Set-Location -LiteralPath $runtime
& '.\start-video-compressor.bat'
'@
$stopText = @'
$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) {
    Write-Host 'Video Compressor :3335 is already stopped.' -ForegroundColor DarkGray
    exit 0
}
foreach ($listener in $listeners) {
    if ($listener.OwningProcess) {
        try { & taskkill.exe /PID $listener.OwningProcess /T /F 2>$null | Out-Null } catch {}
    }
}
$deadline = (Get-Date).AddSeconds(20)
do {
    if (@(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
        Write-Host 'PASS - Video Compressor :3335 stopped.' -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
throw 'Video Compressor port 3335 is still listening after stop attempt.'
'@
Write-Utf8NoBom $startHelper $startText
Write-Utf8NoBom $stopHelper $stopText

Write-Host 'Patch exact live production verifier' -ForegroundColor Cyan
Backup-File $VerifyPs1
$verify = Read-All $VerifyPs1
if ($verify -notmatch 'http://localhost:3335/health') {
    $runnerPattern = '(?m)^(.*Pipeline Runner local.*http://localhost:3350/health.*)$'
    if ($verify -match $runnerPattern) {
        $line = $Matches[1]
        $compressorLine = $line -replace 'Pipeline Runner local','Video Compressor local' -replace 'http://localhost:3350/health','http://localhost:3335/health'
        $verify = $verify.Replace($line,$line + "`r`n" + $compressorLine)
    } else {
        throw 'Could not locate Pipeline Runner local health line in the live verifier.'
    }
}
$verify = $verify.Replace('Six local origins + six permanent named Cloudflare hostnames','Seven local origins + six permanent named Cloudflare hostnames')
$verify = $verify.Replace('SUCCESS: Six local services and all six permanent Cloudflare routes are reachable.','SUCCESS: Seven local services and all six permanent Cloudflare routes are reachable.')
$verify = $verify.Replace('six local origins + six permanent named Cloudflare hostnames','seven local origins + six permanent named Cloudflare hostnames')
$verify = $verify.Replace('six local services and all six permanent Cloudflare routes are reachable.','seven local services and all six permanent Cloudflare routes are reachable.')
Write-Utf8NoBom $VerifyPs1 $verify

Write-Host 'Locate and patch exact production START' -ForegroundColor Cyan
$startCandidates = @(Get-ChildItem -LiteralPath $ToolsRoot -File -Filter '*.bat' | Where-Object {
    $_.Name -match '(?i)start' -and (Read-All $_.FullName) -match '3333|3334|3340|3350|local-services'
})
if ($startCandidates.Count -lt 1) { throw 'Could not locate production START BAT.' }
$startBat = $startCandidates | Sort-Object @{Expression={ if ($_.Name -match '(?i)^start') {0} else {1} }}, Name | Select-Object -First 1
Backup-File $startBat.FullName
$start = Read-All $startBat.FullName
if ($start -notmatch '90-video-compressor-local\.ps1|3335') {
    $block = @'

REM ============================================================
REM SMV2 VIDEO COMPRESSOR MANAGED EXTENSION
REM ============================================================
start "" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\90-video-compressor-local.ps1"
'@
    $pausePattern = '(?im)^\s*pause\s*$'
    if ($start -match $pausePattern) {
        $start = [regex]::Replace($start,$pausePattern,($block + "`r`npause"),1)
    } else {
        $start += $block
    }
    Write-Utf8NoBom $startBat.FullName $start
}

Write-Host 'Locate and patch exact production STOP' -ForegroundColor Cyan
$stopCandidates = @(Get-ChildItem -LiteralPath $ToolsRoot -File -Filter '*.bat' | Where-Object {
    $_.Name -match '(?i)stop' -and (Read-All $_.FullName) -match '3333|3334|3340|3350|local-services'
})
if ($stopCandidates.Count -lt 1) { throw 'Could not locate production STOP BAT.' }
$stopBat = $stopCandidates | Sort-Object @{Expression={ if ($_.Name -match '(?i)^stop') {0} else {1} }}, Name | Select-Object -First 1
Backup-File $stopBat.FullName
$stop = Read-All $stopBat.FullName
if ($stop -notmatch '90-stop-video-compressor\.ps1|3335') {
    $block = @'

REM ============================================================
REM SMV2 VIDEO COMPRESSOR MANAGED EXTENSION
REM ============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\90-stop-video-compressor.ps1"
'@
    $pausePattern = '(?im)^\s*pause\s*$'
    if ($stop -match $pausePattern) {
        $stop = [regex]::Replace($stop,$pausePattern,($block + "`r`npause"),1)
    } else {
        $stop += $block
    }
    Write-Utf8NoBom $stopBat.FullName $stop
}

Write-Host 'Validate exact production START / STOP / VERIFY integration' -ForegroundColor Cyan
$verifyNow = Read-All $VerifyPs1
$startNow = Read-All $startBat.FullName
$stopNow = Read-All $stopBat.FullName
if ($verifyNow -notmatch 'http://localhost:3335/health') { throw 'Verifier patch validation failed.' }
if ($startNow -notmatch '90-video-compressor-local\.ps1|3335') { throw 'START patch validation failed.' }
if ($stopNow -notmatch '90-stop-video-compressor\.ps1|3335') { throw 'STOP patch validation failed.' }

Write-Host ''
Write-Host 'PASS - Exact live Production Start / Stop / Verify integration is present.' -ForegroundColor Green
Write-Host "VERIFY: $VerifyPs1" -ForegroundColor Green
Write-Host ('START: ' + $startBat.FullName) -ForegroundColor Green
Write-Host ('STOP : ' + $stopBat.FullName) -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Green
Write-Host 'The currently running compressor was left running. Public compressor route is not counted until its permanent Cloudflare hostname is live.' -ForegroundColor Yellow
