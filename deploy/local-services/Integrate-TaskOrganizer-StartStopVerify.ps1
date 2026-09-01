param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$Checkout = Join-Path $PipelineRoot 'Source Control\chicago-shining-task-organizer'
$Marker = 'SMV2 TASK ORGANIZER MANAGED EXTENSION'
$Port = 3360
$WindowTitle = '9 LOC Task Organizer :3360'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Get-ShortcutTarget([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $shell = New-Object -ComObject WScript.Shell
    $target = $shell.CreateShortcut($Path).TargetPath
    if ([string]::IsNullOrWhiteSpace($target)) { return $null }
    if (Test-Path -LiteralPath $target -PathType Leaf) { return (Split-Path -Parent $target) }
    if (Test-Path -LiteralPath $target -PathType Container) { return $target }
    return $null
}

function Get-ToolsRoots([string]$Root) {
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($name in @(
        'START ChicagoShining Services.lnk',
        'START ChicagoShining Services.bat'
    )) {
        $fromShortcut = Get-ShortcutTarget (Join-Path $Root $name)
        if ($fromShortcut) { $candidates.Add($fromShortcut) }
    }
    foreach ($rel in @(
        'Production Start-Stop-Verify Services',
        'Source Control\Production-Start-Stop-Verify-Services',
        'Source Control\Production Start-Stop-Verify Services'
    )) {
        $path = Join-Path $Root $rel
        if (Test-Path -LiteralPath $path -PathType Container) { $candidates.Add((Resolve-Path -LiteralPath $path).Path) }
    }
    return @($candidates | ForEach-Object { $_.TrimEnd('\') } | Select-Object -Unique)
}

function Find-ControlBat([string]$ToolsRoot, [string]$NamePattern, [string]$ContentPattern) {
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
    $lastStart = [regex]::Matches($Existing, '(?im)^(?:start\s+""\s+powershell\.exe|wt\.exe\s+new-tab).*$')
    if ($lastStart.Count -gt 0) {
        $m = $lastStart[$lastStart.Count - 1]
        $idx = $m.Index + $m.Length
        return $Existing.Substring(0, $idx) + "`r`n" + $Block.TrimEnd() + $Existing.Substring($idx)
    }
    return $Existing.TrimEnd() + "`r`n" + $Block
}

function Backup-File([string]$ToolsRoot, [string]$BackupRoot, [string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $relative = $Path
    if ($Path.StartsWith($ToolsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $Path.Substring($ToolsRoot.Length).TrimStart('\')
    }
    else {
        $relative = Split-Path -Leaf $Path
    }
    $dest = Join-Path $BackupRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

Write-Step 'Validate current installation'
if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) {
    throw "Task organizer checkout not found: $Checkout"
}
if (-not (Test-Path -LiteralPath (Join-Path $Checkout 'app\main.py') -PathType Leaf)) {
    throw 'Task organizer app\main.py is missing from the checkout.'
}

$toolsRoots = @(Get-ToolsRoots $PipelineRoot)
if ($toolsRoots.Count -lt 1) {
    throw "No Start/Stop/Verify folders found under $PipelineRoot"
}
Write-Host 'Will patch these START/STOP folders:' -ForegroundColor Yellow
$toolsRoots | ForEach-Object { Write-Host "  $_" }

Write-Step 'Install start BAT into the task organizer checkout'
$startBatSource = Join-Path $PSScriptRoot 'start-task-organizer.bat'
Copy-Item -LiteralPath $startBatSource -Destination (Join-Path $Checkout 'start-task-organizer.bat') -Force

foreach ($ToolsRoot in $toolsRoots) {
    Write-Step "Patch folder: $ToolsRoot"
    $HelperRoot = Join-Path $ToolsRoot '_startup_helpers'
    $BackupRoot = Join-Path $ToolsRoot ('_backups\Task_Organizer_StartStopVerify_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $StartBat = Join-Path $ToolsRoot 'start-chicagoshining-local-services.bat'
    $VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services-oauth-hardened.ps1'
    New-Item -ItemType Directory -Force -Path $HelperRoot | Out-Null

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

    if (-not (Test-Path -LiteralPath $StartBat -PathType Leaf)) {
        $discovered = Find-ControlBat $ToolsRoot '(?i)start' '3333|3334|3340|3350|3335|3336|local-services|_startup_helpers'
        if (-not $discovered) {
            Write-Host "No START BAT in $ToolsRoot; skipping this folder." -ForegroundColor Yellow
            continue
        }
        $StartBat = $discovered
    }
    Backup-File $ToolsRoot $BackupRoot $StartBat
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
        Write-Host "Added Task Organizer to START: $StartBat" -ForegroundColor Green
    }
    else {
        Write-Host "START already patched: $StartBat" -ForegroundColor DarkGray
    }

    $stopBat = Find-ControlBat $ToolsRoot '(?i)stop' '3333|3334|3340|3350|3335|3336|local-services|_startup_helpers'
    if (-not $stopBat) {
        Write-Host "No STOP BAT in $ToolsRoot; skipping STOP patch." -ForegroundColor Yellow
    }
    else {
        Backup-File $ToolsRoot $BackupRoot $stopBat
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
            Write-Host "Added Task Organizer to STOP: $stopBat" -ForegroundColor Green
        }
        else {
            Write-Host "STOP already patched: $stopBat" -ForegroundColor DarkGray
        }
    }

    if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
        $fallbackVerify = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
        if (Test-Path -LiteralPath $fallbackVerify -PathType Leaf) { $VerifyPs1 = $fallbackVerify }
    }
    if (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf) {
        Backup-File $ToolsRoot $BackupRoot $VerifyPs1
        $verify = [System.IO.File]::ReadAllText($VerifyPs1)
        if ($verify -notmatch 'Task Organizer local') {
            $runnerPattern = '(?m)^(.*(?:Pipeline Runner local|Video Compressor local|YouTube Uploader local|Timing Engine local).*http://localhost:\d+/health.*)$'
            if ($verify -match $runnerPattern) {
                $line = $Matches[1]
                $newLine = ($line -replace 'Pipeline Runner local|Video Compressor local|YouTube Uploader local|Timing Engine local', 'Task Organizer local') -replace 'http://localhost:\d+/health', ("http://localhost:{0}/health" -f $Port)
                $verify = $verify.Replace($line, $line + "`r`n" + $newLine)
                Write-Utf8NoBom $VerifyPs1 $verify
                Write-Host "Added Task Organizer to VERIFY: $VerifyPs1" -ForegroundColor Green
            }
            else {
                Write-Host "Could not patch verifier in $ToolsRoot" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "VERIFY already patched: $VerifyPs1" -ForegroundColor DarkGray
        }
    }

    $startNow = [System.IO.File]::ReadAllText($StartBat)
    if ($startNow -notmatch '91-task-organizer-local.ps1') { throw "START validation failed: $StartBat" }
}

Write-Host ''
Write-Host 'PASS - Task Organizer is integrated into every Start/Stop folder that was found.' -ForegroundColor Green
Write-Host "Window: $WindowTitle" -ForegroundColor Green
Write-Host "Docs:   http://localhost:$Port/docs (opens only after /health is ready)" -ForegroundColor Green
Write-Host ''
Write-Host 'Next: STOP ALL, then START ALL from the pipeline-root shortcuts.' -ForegroundColor Cyan
