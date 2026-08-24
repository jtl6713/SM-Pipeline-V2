param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Production Start-Stop-Verify Services'
$RuntimeRoot = Join-Path $PipelineRoot 'Services\Video_Compressor'
$HelperRoot = Join-Path $ToolsRoot '_startup_helpers'
$BackupRoot = Join-Path $ToolsRoot ('_backups\Video_Compressor_StartStopVerify_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$StartBat = Join-Path $ToolsRoot 'start-chicagoshining-local-services.bat'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services-oauth-hardened.ps1'
$Marker = 'SMV2 VIDEO COMPRESSOR MANAGED EXTENSION'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Backup-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $relative = $Path.Substring($ToolsRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Write-Utf8NoBom([string]$Path,[string]$Text) {
    [System.IO.File]::WriteAllText($Path,$Text,[System.Text.UTF8Encoding]::new($false))
}

Write-Step 'Validate current installation'
if (-not (Test-Path -LiteralPath $ToolsRoot -PathType Container)) {
    throw "Start/Stop/Verify folder not found: $ToolsRoot"
}
if (-not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)) {
    throw "Video Compressor runtime not found: $RuntimeRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'start-video-compressor.bat') -PathType Leaf)) {
    throw 'Video Compressor startup BAT is missing from the runtime folder.'
}
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:3335/health' -TimeoutSec 5
    if ($health.ok -ne $true -or $health.ffmpeg -ne $true -or $health.ffprobe -ne $true) {
        throw 'Health payload is not ready.'
    }
    Write-Host 'PASS current Video Compressor health on port 3335.' -ForegroundColor Green
}
catch {
    throw "Video Compressor must be healthy before Start/Stop/Verify integration. $($_.Exception.Message)"
}

New-Item -ItemType Directory -Force -Path $HelperRoot | Out-Null

Write-Step 'Create managed start/stop helpers'
$startHelper = Join-Path $HelperRoot '90-video-compressor-local.ps1'
$stopHelper = Join-Path $HelperRoot '90-stop-video-compressor.ps1'

$startText = @'
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = '7 LOC Video Compressor :3335'
$runtime = 'D:\Content Creation\ChicagoShining Pipeline\Services\Video_Compressor'

# Replace any existing listener so the central START command is deterministic.
$listeners = @(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    if ($listener.OwningProcess) {
        try { & taskkill.exe /PID $listener.OwningProcess /T /F 2>$null | Out-Null } catch {}
    }
}
$deadline = (Get-Date).AddSeconds(15)
do {
    if (@(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
if (@(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'Port 3335 is still in use; Video Compressor was not started.'
}

Set-Location -LiteralPath $runtime
Write-Host 'Starting Video Compressor on port 3335...' -ForegroundColor Cyan
Write-Host 'Local health: http://localhost:3335/health' -ForegroundColor Yellow
& '.\start-video-compressor.bat'
Write-Host 'Video Compressor stopped.' -ForegroundColor Red
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
        Write-Host "Stopping Video Compressor process tree PID $($listener.OwningProcess)..." -ForegroundColor Yellow
        try { & taskkill.exe /PID $listener.OwningProcess /T /F 2>$null | Out-Null } catch {}
    }
}
$deadline = (Get-Date).AddSeconds(20)
do {
    if (@(Get-NetTCPConnection -LocalPort 3335 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
        Write-Host 'PASS Video Compressor :3335 stopped.' -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
throw 'Video Compressor port 3335 is still listening after stop attempt.'
'@
Write-Utf8NoBom $startHelper $startText
Write-Utf8NoBom $stopHelper $stopText

Write-Step 'Patch central START command'
if (-not (Test-Path -LiteralPath $StartBat -PathType Leaf)) {
    throw "Central START BAT not found: $StartBat"
}
Backup-File $StartBat
$start = [System.IO.File]::ReadAllText($StartBat)
if ($start -notmatch [regex]::Escape($Marker)) {
    $block = @"

REM ============================================================
REM $Marker
REM Managed local service #7; public route is added separately.
REM ============================================================
start "" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%HELPER_DIR%\90-video-compressor-local.ps1"

"@
    $anchor = 'echo ============================================================\r?\necho STARTUP COMMAND COMPLETED'
    if ($start -match $anchor) {
        $start = [regex]::Replace($start,$anchor,($block + 'echo ============================================================' + "`r`n" + 'echo STARTUP COMMAND COMPLETED'),1)
    }
    else {
        $exitAnchor = 'pause\r?\nexit /b 0'
        if ($start -notmatch $exitAnchor) { throw 'Could not find a safe insertion point in the central START BAT.' }
        $start = [regex]::Replace($start,$exitAnchor,($block + 'pause' + "`r`n" + 'exit /b 0'),1)
    }
    Write-Utf8NoBom $StartBat $start
    Write-Host 'Added Video Compressor to central START.' -ForegroundColor Green
}
else {
    Write-Host 'Central START already contains Video Compressor integration.' -ForegroundColor DarkGray
}

Write-Step 'Patch central STOP command'
$stopCandidates = @(
    Get-ChildItem -LiteralPath $ToolsRoot -File -Filter '*.bat' -ErrorAction Stop |
        Where-Object { $_.Name -match '(?i)stop' }
)
$stopBat = $null
foreach ($candidate in $stopCandidates) {
    $text = [System.IO.File]::ReadAllText($candidate.FullName)
    if ($text -match '3333|3334|3340|local.services') { $stopBat = $candidate.FullName; break }
}
if (-not $stopBat -and $stopCandidates.Count -gt 0) { $stopBat = $stopCandidates[0].FullName }
if (-not $stopBat) {
    throw 'Could not locate the existing central STOP BAT. No partial STOP patch will be guessed.'
}
Backup-File $stopBat
$stop = [System.IO.File]::ReadAllText($stopBat)
if ($stop -notmatch [regex]::Escape($Marker)) {
    $stopBlock = @"

REM ============================================================
REM $Marker
REM ============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HELPER_DIR%\90-stop-video-compressor.ps1"
if errorlevel 1 (
  echo WARNING: Video Compressor :3335 did not stop cleanly.
)

"@
    $pauseAnchor = 'pause\r?\nexit /b'
    if ($stop -match $pauseAnchor) {
        $stop = [regex]::Replace($stop,$pauseAnchor,($stopBlock + 'pause' + "`r`n" + 'exit /b'),1)
    }
    else {
        $stop += $stopBlock
    }
    Write-Utf8NoBom $stopBat $stop
    Write-Host "Added Video Compressor to central STOP: $stopBat" -ForegroundColor Green
}
else {
    Write-Host 'Central STOP already contains Video Compressor integration.' -ForegroundColor DarkGray
}

Write-Step 'Patch OAuth-hardened VERIFY command'
if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
    throw "OAuth-hardened VERIFY script not found: $VerifyPs1"
}
Backup-File $VerifyPs1
$verify = [System.IO.File]::ReadAllText($VerifyPs1)
if ($verify -notmatch 'Video Compressor local') {
    $needle = '@{ Name = "YouTube Uploader local";      Url = "http://localhost:3340/health" }'
    if ($verify.Contains($needle)) {
        $replacement = $needle + ',' + "`r`n" + '    @{ Name = "Video Compressor local";       Url = "http://localhost:3335/health" }'
        $verify = $verify.Replace($needle,$replacement)
    }
    else {
        # Tolerate spacing changes in the current hardened verifier.
        $pattern = '(?m)^(\s*)@\{\s*Name\s*=\s*"YouTube Uploader local";\s*Url\s*=\s*"http://localhost:3340/health"\s*\}(,?)\s*$'
        if ($verify -notmatch $pattern) { throw 'Could not find the local-service array in the hardened verifier.' }
        $verify = [regex]::Replace($verify,$pattern,{ param($m) $m.Value.TrimEnd(',') + ',' + "`r`n" + $m.Groups[1].Value + '@{ Name = "Video Compressor local";       Url = "http://localhost:3335/health" }' },1)
    }
    Write-Utf8NoBom $VerifyPs1 $verify
    Write-Host 'Added mandatory local Video Compressor health to hardened VERIFY.' -ForegroundColor Green
}
else {
    Write-Host 'Hardened VERIFY already contains Video Compressor local health.' -ForegroundColor DarkGray
}

Write-Step 'Validate patched files'
$startNow = [System.IO.File]::ReadAllText($StartBat)
$stopNow = [System.IO.File]::ReadAllText($stopBat)
$verifyNow = [System.IO.File]::ReadAllText($VerifyPs1)
if ($startNow -notmatch '90-video-compressor-local.ps1') { throw 'START validation failed.' }
if ($stopNow -notmatch '90-stop-video-compressor.ps1') { throw 'STOP validation failed.' }
if ($verifyNow -notmatch 'http://localhost:3335/health') { throw 'VERIFY validation failed.' }

Write-Host ''
Write-Host 'PASS - Video Compressor is integrated into existing Start / Stop / Verify.' -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Green
Write-Host 'Public compressor health is intentionally not mandatory yet; it will be added after the permanent Cloudflare hostname is live.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Next: run the central VERIFY BAT while the current compressor is still running.' -ForegroundColor Cyan
