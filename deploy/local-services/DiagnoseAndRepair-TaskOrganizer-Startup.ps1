param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$Checkout = Join-Path $PipelineRoot 'Source Control\chicago-shining-task-organizer'
$Title = '9 LOC Task Organizer :3360'
$Port = 3360
$Marker = 'SMV2 TASK ORGANIZER MANAGED EXTENSION'

function Write-Step([string]$Text) { Write-Host ''; Write-Host $Text -ForegroundColor Cyan }
function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Get-Lnk([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $shell = New-Object -ComObject WScript.Shell
    return $shell.CreateShortcut($Path)
}

function Get-HelperText([string]$HelperPath) {
    $openDocs = Join-Path (Split-Path $HelperPath -Parent) '09-open-task-organizer-docs.ps1'
    $openDocsEsc = $openDocs.Replace("'", "''")
    Write-Utf8NoBom $openDocs @"
`$ErrorActionPreference = 'Continue'
`$deadline = (Get-Date).AddSeconds(90)
do {
    try {
        `$health = Invoke-RestMethod -Uri 'http://localhost:$Port/health' -TimeoutSec 2
        if (`$health.ok -eq `$true) { Start-Process 'http://localhost:$Port/docs'; exit 0 }
    } catch {}
    Start-Sleep -Seconds 1
} while ((Get-Date) -lt `$deadline)
exit 1
"@
    return @"
`$ErrorActionPreference = 'Stop'
`$Host.UI.RawUI.WindowTitle = '$Title'
`$runtime = '$Checkout'
`$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
foreach (`$listener in `$listeners) {
    if (`$listener.OwningProcess) { try { & taskkill.exe /PID `$listener.OwningProcess /T /F 2>`$null | Out-Null } catch {} }
}
Set-Location -LiteralPath `$runtime
Write-Host 'Starting Task Organizer on port $Port...' -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','$openDocsEsc') | Out-Null
& '.\start-task-organizer.bat'
"@
}

function Get-StopHelperText {
    return @"
`$ErrorActionPreference = 'Stop'
`$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if (`$listeners.Count -eq 0) { Write-Host 'Task Organizer :$Port already stopped.'; exit 0 }
foreach (`$listener in `$listeners) {
    if (`$listener.OwningProcess) { try { & taskkill.exe /PID `$listener.OwningProcess /T /F 2>`$null | Out-Null } catch {} }
}
exit 0
"@
}

function Clone-EightLine([string]$Line) {
    $copy = $Line
    $copy = $copy -replace '8 LOC Timing Engine :3336', $Title
    $copy = $copy -replace '8 LOC Timing Engine', $Title
    $copy = $copy -replace '08-timing-engine-local\.ps1', '09-task-organizer-local.ps1'
    $copy = $copy -replace '08-stop-timing-engine\.ps1', '09-stop-task-organizer.ps1'
    $copy = $copy -replace '90-video-compressor-local\.ps1', '09-task-organizer-local.ps1'
    $copy = $copy -replace '90-stop-video-compressor\.ps1', '09-stop-task-organizer.ps1'
    $copy = $copy -replace 'timing-engine-local\.ps1', '09-task-organizer-local.ps1'
    $copy = $copy -replace ':3336', ':3360'
    $copy = $copy -replace '3336', '3360'
    $copy = $copy -replace 'timing-engine', 'task-organizer'
    $copy = $copy -replace 'Timing Engine', 'Task Organizer'
    return $copy
}

Write-Step 'Shortcut targets (this is what START/STOP/VERIFY actually run)'
$startLnk = Get-Lnk (Join-Path $PipelineRoot 'START ChicagoShining Services.lnk')
$stopLnk = Get-Lnk (Join-Path $PipelineRoot 'STOP ChicagoShining Services.lnk')
$verifyLnk = Get-Lnk (Join-Path $PipelineRoot 'VERIFY ChicagoShining Services.lnk')
foreach ($pair in @(
    @{ Name = 'START'; Lnk = $startLnk },
    @{ Name = 'STOP'; Lnk = $stopLnk },
    @{ Name = 'VERIFY'; Lnk = $verifyLnk }
)) {
    if (-not $pair.Lnk) { Write-Host "$($pair.Name) shortcut missing"; continue }
    Write-Host "$($pair.Name) Target : $($pair.Lnk.TargetPath)"
    Write-Host "$($pair.Name) Args   : $($pair.Lnk.Arguments)"
    Write-Host "$($pair.Name) WorkDir: $($pair.Lnk.WorkingDirectory)"
}

$startBatSource = Join-Path $PSScriptRoot 'start-task-organizer.bat'
if (Test-Path -LiteralPath $startBatSource) {
    Copy-Item -LiteralPath $startBatSource -Destination (Join-Path $Checkout 'start-task-organizer.bat') -Force
}

Write-Step 'Patch every Start/Stop folder and clone the exact tab-8 launch line'
$folders = New-Object System.Collections.Generic.List[string]
foreach ($lnk in @($startLnk, $stopLnk)) {
    if (-not $lnk -or -not $lnk.TargetPath) { continue }
    $t = $lnk.TargetPath
    if (Test-Path -LiteralPath $t -PathType Leaf) { $folders.Add((Split-Path -Parent $t)) }
    elseif (Test-Path -LiteralPath $t -PathType Container) { $folders.Add($t) }
}
foreach ($rel in @(
    'Production Start-Stop-Verify Services',
    'Source Control\Production-Start-Stop-Verify-Services'
)) {
    $p = Join-Path $PipelineRoot $rel
    if (Test-Path -LiteralPath $p -PathType Container) { $folders.Add((Resolve-Path $p).Path) }
}
$folders = @($folders | ForEach-Object { $_.TrimEnd('\') } | Select-Object -Unique)
$folders | ForEach-Object { Write-Host "Folder: $_" }

foreach ($folder in $folders) {
    $helpers = Join-Path $folder '_startup_helpers'
    New-Item -ItemType Directory -Force -Path $helpers | Out-Null
    $startHelper = Join-Path $helpers '09-task-organizer-local.ps1'
    $stopHelper = Join-Path $helpers '09-stop-task-organizer.ps1'
    Write-Utf8NoBom $startHelper (Get-HelperText $startHelper)
    Write-Utf8NoBom $stopHelper (Get-StopHelperText)
    # keep 91- names too in case an older patched line remains
    Copy-Item $startHelper (Join-Path $helpers '91-task-organizer-local.ps1') -Force
    Copy-Item $stopHelper (Join-Path $helpers '91-stop-task-organizer.ps1') -Force

    Get-ChildItem -LiteralPath $folder -File | Where-Object { $_.Extension -in '.bat', '.ps1', '.cmd' } | ForEach-Object {
        $text = [System.IO.File]::ReadAllText($_.FullName)
        if ($text -notmatch '3333|3334|3336|3350|8 LOC|timing-engine|06-pipeline') { return }
        Write-Host ''
        Write-Host ("FILE " + $_.FullName) -ForegroundColor Yellow
        $text -split "`r?`n" | Where-Object { $_ -match '3336|8 LOC|timing|wt\.exe|start ""|09-task|91-task' } | ForEach-Object { Write-Host ("  " + $_) }

        if ($_.Name -match '(?i)start' -and $text -notmatch '09-task-organizer-local|91-task-organizer-local') {
            $eight = ($text -split "`r?`n" | Where-Object { $_ -match '3336|8 LOC|timing-engine|08-' } | Select-Object -Last 1)
            if ($eight) {
                $nine = Clone-EightLine $eight
                Write-Host "CLONED START LINE -> $nine" -ForegroundColor Green
                $updated = $text.Replace($eight, $eight + "`r`n" + $nine)
                if ($updated -notmatch [regex]::Escape($Marker)) {
                    $updated = $updated + "`r`nREM $Marker`r`n"
                }
                Write-Utf8NoBom $_.FullName $updated
            }
        }
        if ($_.Name -match '(?i)stop' -and $text -notmatch '09-stop-task-organizer|91-stop-task-organizer|:3360') {
            $eight = ($text -split "`r?`n" | Where-Object { $_ -match '3336|timing-engine|08-stop' } | Select-Object -Last 1)
            if ($eight) {
                $nine = Clone-EightLine $eight
                Write-Host "CLONED STOP LINE -> $nine" -ForegroundColor Green
                Write-Utf8NoBom $_.FullName ($text.Replace($eight, $eight + "`r`n" + $nine))
            }
        }
    }
}

Write-Step 'If START shortcut is wt.exe with baked-in tabs, append tab 9 to the shortcut itself'
if ($startLnk -and $startLnk.TargetPath -match '(?i)wt(\.exe)?$' -and $startLnk.Arguments -match 'new-tab' -and $startLnk.Arguments -notmatch '3360|9 LOC Task Organizer') {
    $helperForShortcut = Join-Path (Split-Path -Parent $startLnk.WorkingDirectory) '_startup_helpers\09-task-organizer-local.ps1'
    if (-not (Test-Path $helperForShortcut)) {
        $helperForShortcut = @(
            (Join-Path $PipelineRoot 'Production Start-Stop-Verify Services\_startup_helpers\09-task-organizer-local.ps1'),
            (Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\_startup_helpers\09-task-organizer-local.ps1')
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    $extra = ' ; new-tab --title "' + $Title + '" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "' + $helperForShortcut + '"'
    $startLnk.Arguments = $startLnk.Arguments.Trim() + $extra
    $startLnk.Save()
    Write-Host 'Appended tab 9 to the START shortcut arguments.' -ForegroundColor Green
    Write-Host $startLnk.Arguments
}
elseif ($startLnk) {
    Write-Host 'START shortcut is not a baked wt.exe tab list (or already has tab 9).' -ForegroundColor DarkGray
}

Write-Step 'Launch tab 9 now'
$now = @(
    (Join-Path $PipelineRoot 'Production Start-Stop-Verify Services\_startup_helpers\09-task-organizer-local.ps1'),
    (Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\_startup_helpers\09-task-organizer-local.ps1')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($now -and (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
    Write-Host "wt.exe new-tab -> $now"
    & wt.exe new-tab --title $Title powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File $now
}

Write-Host ''
Write-Host 'Done. Scroll up: if you do not see a CLONED START LINE or shortcut append, paste this whole output.' -ForegroundColor Cyan
