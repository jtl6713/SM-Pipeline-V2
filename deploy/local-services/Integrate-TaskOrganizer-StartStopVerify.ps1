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
$openDocsHelper = Join-Path $HelperRoot '91-open-task-organizer-docs.ps1'

$openDocsText = @"
`$ErrorActionPreference = 'Continue'
`$healthUrl = 'http://localhost:$Port/health'
`$docsUrl = 'http://localhost:$Port/docs'
`$deadline = (Get-Date).AddSeconds(90)
do {
    try {
        `$health = Invoke-RestMethod -Uri `$healthUrl -TimeoutSec 2
        if (`$health.ok -eq `$true) {
            Start-Process `$docsUrl
            exit 0
        }
    } catch {}
    Start-Sleep -Seconds 1
} while ((Get-Date) -lt `$deadline)
Write-Host 'Task Organizer /health did not become ready within 90 seconds; docs were not opened.' -ForegroundColor Yellow
exit 1
"@

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
Write-Host 'Docs open after /health is ready (up to 90 seconds).' -ForegroundColor Yellow
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', '$($openDocsHelper.Replace("'","''"))'
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
Write-Utf8NoBom $openDocsHelper $openDocsText
Write-Utf8NoBom $startHelper $startText
Write-Utf8NoBom $stopHelper $stopText

function Find-ControlBat([string]$NamePattern, [string]$ContentPattern) {
    $hits = @(Get-ChildItem -LiteralPath $ToolsRoot -File -Filter '*.bat' -ErrorAction Stop |
        Where-Object { $_.Name -match $NamePattern -and ([System.IO.File]::ReadAllText($_.FullName) -match $ContentPattern) })
    if ($hits.Count -lt 1) { return $null }
    return ($hits | Sort-Object @{ Expression = { if ($_.Name -match '(?i)^start|^stop') { 0 } else { 1 } } }, Name | Select-Object -First 1).FullName
}

function Insert-BeforePauseOrAppend([string]$Existing, [string]$Block) {
    $pausePattern = '(?im)^\s*pause\s*$'
    if ($Existing -match $pausePattern) {
        return [regex]::Replace($Existing, $pausePattern, ($Block.TrimEnd() + "`r`n`r`npause"), 1)
    }
    $completedPattern = '(?im)^\s*echo\s+STARTUP COMMAND COMPLETED\s*$'
    if ($Existing -match $completedPattern) {
        return [regex]::Replace($Existing, $completedPattern, ($Block.TrimEnd() + "`r`n`r`necho STARTUP COMMAND COMPLETED"), 1)
    }
    $lastStart = [regex]::Matches($Existing, '(?im)^start\s+""\s+powershell\.exe.*$')
    if ($lastStart.Count -gt 0) {
        $m = $lastStart[$lastStart.Count - 1]
        $idx = $m.Index + $m.Length
        return $Existing.Substring(0, $idx) + "`r`n" + $Block.TrimEnd() + $Existing.Substring($idx)
    }
    return $Existing.TrimEnd() + "`r`n" + $Block
}

Write-Step 'Patch central START command'
if (-not (Test-Path -LiteralPath $StartBat -PathType Leaf)) {
    $discovered = Find-ControlBat '(?i)start' '3333|3334|3340|3350|3335|3336|local-services|_startup_helpers'
    if (-not $discovered) { throw "Central START BAT not found: $StartBat" }
    $StartBat = $discovered
    Write-Host "Using discovered START BAT: $StartBat" -ForegroundColor DarkGray
}
Backup-File $StartBat
$start = [System.IO.File]::ReadAllText($StartBat)
if ($start -notmatch [regex]::Escape($Marker)) {
    $block = @"

REM ============================================================
REM $Marker
REM Managed local service #9; docs open at http://localhost:$Port/docs
REM ============================================================
wt.exe new-tab --title "9 LOC Task Organizer :3360" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\91-task-organizer-local.ps1"

"@
    $start = Insert-BeforePauseOrAppend $start $block
    Write-Utf8NoBom $StartBat $start
    Write-Host "Added Task Organizer to central START: $StartBat" -ForegroundColor Green
}
else {
    Write-Host 'Central START already contains Task Organizer integration.' -ForegroundColor DarkGray
}

Write-Step 'Patch central STOP command'
$stopBat = Find-ControlBat '(?i)stop' '3333|3334|3340|3350|3335|3336|local-services|_startup_helpers'
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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\91-stop-task-organizer.ps1"
if errorlevel 1 (
  echo WARNING: Task Organizer :$Port did not stop cleanly.
)

"@
    $stop = Insert-BeforePauseOrAppend $stop $stopBlock
    Write-Utf8NoBom $stopBat $stop
    Write-Host "Added Task Organizer to central STOP: $stopBat" -ForegroundColor Green
}
else {
    Write-Host 'Central STOP already contains Task Organizer integration.' -ForegroundColor DarkGray
}

Write-Step 'Patch VERIFY command'
if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
    $fallbackVerify = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
    if (Test-Path -LiteralPath $fallbackVerify -PathType Leaf) {
        $VerifyPs1 = $fallbackVerify
        Write-Host "Using verifier: $VerifyPs1" -ForegroundColor DarkGray
    }
    else {
        throw "VERIFY script not found: $VerifyPs1"
    }
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
        $runnerPattern = '(?m)^(.*(?:Pipeline Runner local|Video Compressor local|YouTube Uploader local).*http://localhost:\d+/health.*)$'
        if ($verify -notmatch $runnerPattern) { throw 'Could not find the local-service array in the hardened verifier.' }
        $line = $Matches[1]
        $newLine = ($line -replace 'Pipeline Runner local|Video Compressor local|YouTube Uploader local', 'Task Organizer local') -replace 'http://localhost:\d+/health', ("http://localhost:{0}/health" -f $Port)
        $verify = $verify.Replace($line, $line + "`r`n" + $newLine)
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
