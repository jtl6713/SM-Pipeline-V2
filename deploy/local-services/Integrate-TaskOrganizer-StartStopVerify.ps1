param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$Checkout = Join-Path $PipelineRoot 'Source Control\chicago-shining-task-organizer'
$HelperRoot = Join-Path $ToolsRoot '_startup_helpers'
$BackupRoot = Join-Path $ToolsRoot ('_backups\Task_Organizer_StartStopVerify_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$StartBat = Join-Path $ToolsRoot 'start-chicagoshining-local-services.bat'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services-oauth-hardened.ps1'
$Marker = 'SMV2 TASK ORGANIZER MANAGED EXTENSION'
$Port = 3360
$WindowTitle = '9 LOC Task Organizer :3360'

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

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

Write-Step 'Validate current installation'
if (-not (Test-Path -LiteralPath $ToolsRoot -PathType Container)) {
    throw "Start/Stop/Verify folder not found: $ToolsRoot"
}
if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) {
    throw "Task organizer checkout not found: $Checkout"
}
if (-not (Test-Path -LiteralPath (Join-Path $Checkout 'app\main.py') -PathType Leaf)) {
    throw 'Task organizer app\main.py is missing from the checkout.'
}

New-Item -ItemType Directory -Force -Path $HelperRoot | Out-Null

Write-Step 'Install start BAT into the task organizer checkout'
$startBatSource = Join-Path $PSScriptRoot 'start-task-organizer.bat'
Copy-Item -LiteralPath $startBatSource -Destination (Join-Path $Checkout 'start-task-organizer.bat') -Force

Write-Step 'Create managed start/stop helpers'
$startHelper = Join-Path $HelperRoot '91-task-organizer-local.ps1'
$stopHelper = Join-Path $HelperRoot '91-stop-task-organizer.ps1'

$startText = @"
`$ErrorActionPreference = 'Stop'
`$Host.UI.RawUI.WindowTitle = '$WindowTitle'
`$runtime = '$Checkout'

`$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
foreach (`$listener in `$listeners) {
    if (`$listener.OwningProcess) {
        try { & taskkill.exe /PID `$listener.OwningProcess /T /F 2>`$null | Out-Null } catch {}
    }
}
`$deadline = (Get-Date).AddSeconds(15)
do {
    if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt `$deadline)
if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'Port $Port is still in use; Task Organizer was not started.'
}

Set-Location -LiteralPath `$runtime
Write-Host 'Starting Task Organizer on port $Port...' -ForegroundColor Cyan
Write-Host 'Local health: http://localhost:$Port/health' -ForegroundColor Yellow
Write-Host 'Docs: http://localhost:$Port/docs' -ForegroundColor Yellow
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-Command',
    "Start-Sleep -Seconds 4; try { Invoke-RestMethod -Uri 'http://localhost:$Port/health' -TimeoutSec 2 | Out-Null } catch {}; Start-Process 'http://localhost:$Port/docs'"
) | Out-Null
& '.\start-task-organizer.bat'
Write-Host 'Task Organizer stopped.' -ForegroundColor Red
"@

$stopText = @"
`$ErrorActionPreference = 'Stop'
`$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if (`$listeners.Count -eq 0) {
    Write-Host 'Task Organizer :$Port is already stopped.' -ForegroundColor DarkGray
    exit 0
}
foreach (`$listener in `$listeners) {
    if (`$listener.OwningProcess) {
        Write-Host "Stopping Task Organizer process tree PID `$(`$listener.OwningProcess)..." -ForegroundColor Yellow
        try { & taskkill.exe /PID `$listener.OwningProcess /T /F 2>`$null | Out-Null } catch {}
    }
}
`$deadline = (Get-Date).AddSeconds(20)
do {
    if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
        Write-Host 'PASS Task Organizer :$Port stopped.' -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt `$deadline)
throw 'Task Organizer port $Port is still listening after stop attempt.'
"@
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
REM Managed local service #9; docs open at http://localhost:$Port/docs
REM ============================================================
start "" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%HELPER_DIR%\91-task-organizer-local.ps1"

"@
    $anchor = 'echo ============================================================\r?\necho STARTUP COMMAND COMPLETED'
    if ($start -match $anchor) {
        $start = [regex]::Replace($start, $anchor, ($block + 'echo ============================================================' + "`r`n" + 'echo STARTUP COMMAND COMPLETED'), 1)
    }
    else {
        $exitAnchor = 'pause\r?\nexit /b 0'
        if ($start -notmatch $exitAnchor) { throw 'Could not find a safe insertion point in the central START BAT.' }
        $start = [regex]::Replace($start, $exitAnchor, ($block + 'pause' + "`r`n" + 'exit /b 0'), 1)
    }
    Write-Utf8NoBom $StartBat $start
    Write-Host 'Added Task Organizer to central START.' -ForegroundColor Green
}
else {
    Write-Host 'Central START already contains Task Organizer integration.' -ForegroundColor DarkGray
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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HELPER_DIR%\91-stop-task-organizer.ps1"
if errorlevel 1 (
  echo WARNING: Task Organizer :$Port did not stop cleanly.
)

"@
    $pauseAnchor = 'pause\r?\nexit /b'
    if ($stop -match $pauseAnchor) {
        $stop = [regex]::Replace($stop, $pauseAnchor, ($stopBlock + 'pause' + "`r`n" + 'exit /b'), 1)
    }
    else {
        $stop += $stopBlock
    }
    Write-Utf8NoBom $stopBat $stop
    Write-Host "Added Task Organizer to central STOP: $stopBat" -ForegroundColor Green
}
else {
    Write-Host 'Central STOP already contains Task Organizer integration.' -ForegroundColor DarkGray
}

Write-Step 'Patch OAuth-hardened VERIFY command'
if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
    throw "OAuth-hardened VERIFY script not found: $VerifyPs1"
}
Backup-File $VerifyPs1
$verify = [System.IO.File]::ReadAllText($VerifyPs1)
if ($verify -notmatch 'Task Organizer local') {
    $needles = @(
        '@{ Name = "Video Compressor local";       Url = "http://localhost:3335/health" }',
        '@{ Name = "YouTube Uploader local";      Url = "http://localhost:3340/health" }'
    )
    $inserted = $false
    foreach ($needle in $needles) {
        if ($verify.Contains($needle)) {
            $replacement = $needle + ',' + "`r`n" + '    @{ Name = "Task Organizer local";         Url = "http://localhost:' + $Port + '/health" }'
            $verify = $verify.Replace($needle, $replacement)
            $inserted = $true
            break
        }
    }
    if (-not $inserted) {
        $pattern = '(?m)^(\s*)@\{\s*Name\s*=\s*"YouTube Uploader local";\s*Url\s*=\s*"http://localhost:3340/health"\s*\}(,?)\s*$'
        if ($verify -notmatch $pattern) { throw 'Could not find the local-service array in the hardened verifier.' }
        $verify = [regex]::Replace($verify, $pattern, {
            param($m)
            $m.Value.TrimEnd(',') + ',' + "`r`n" + $m.Groups[1].Value + '@{ Name = "Task Organizer local";         Url = "http://localhost:' + $Port + '/health" }'
        }, 1)
    }
    Write-Utf8NoBom $VerifyPs1 $verify
    Write-Host 'Added Task Organizer local health to hardened VERIFY.' -ForegroundColor Green
}
else {
    Write-Host 'Hardened VERIFY already contains Task Organizer local health.' -ForegroundColor DarkGray
}

Write-Step 'Validate patched files'
$startNow = [System.IO.File]::ReadAllText($StartBat)
$stopNow = [System.IO.File]::ReadAllText($stopBat)
$verifyNow = [System.IO.File]::ReadAllText($VerifyPs1)
if ($startNow -notmatch '91-task-organizer-local.ps1') { throw 'START validation failed.' }
if ($stopNow -notmatch '91-stop-task-organizer.ps1') { throw 'STOP validation failed.' }
if ($verifyNow -notmatch "http://localhost:$Port/health") { throw 'VERIFY validation failed.' }

Write-Host ''
Write-Host 'PASS - Task Organizer is integrated into existing Start / Stop / Verify.' -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Green
Write-Host "Window: $WindowTitle" -ForegroundColor Green
Write-Host "Docs:   http://localhost:$Port/docs" -ForegroundColor Green
Write-Host ''
Write-Host 'Next: run the central START command. A Task Organizer LOC window will open with the others, and /docs will launch.' -ForegroundColor Cyan
