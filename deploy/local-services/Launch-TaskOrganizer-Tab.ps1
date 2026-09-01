param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$Helper = Join-Path $ToolsRoot '_startup_helpers\91-task-organizer-local.ps1'
$StartBat = Join-Path $ToolsRoot 'start-chicagoshining-local-services.bat'
$Title = '9 LOC Task Organizer :3360'

if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows Terminal (wt.exe) was not found.'
}
if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
    throw "Task Organizer helper not found: $Helper. Run Integrate-TaskOrganizer-StartStopVerify.ps1 first."
}

$wtLine = 'wt.exe new-tab --title "' + $Title + '" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\91-task-organizer-local.ps1"'

if (Test-Path -LiteralPath $StartBat -PathType Leaf) {
    $start = [System.IO.File]::ReadAllText($StartBat)
    $old = 'start "" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0_startup_helpers\91-task-organizer-local.ps1"'
    $oldHelper = 'start "" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "%HELPER_DIR%\91-task-organizer-local.ps1"'
    if ($start.Contains($old)) {
        $start = $start.Replace($old, $wtLine)
        [System.IO.File]::WriteAllText($StartBat, $start, [System.Text.UTF8Encoding]::new($false))
        Write-Host 'Updated central START to open a Windows Terminal tab.' -ForegroundColor Green
    }
    elseif ($start.Contains($oldHelper)) {
        $start = $start.Replace($oldHelper, $wtLine)
        [System.IO.File]::WriteAllText($StartBat, $start, [System.Text.UTF8Encoding]::new($false))
        Write-Host 'Updated central START to open a Windows Terminal tab.' -ForegroundColor Green
    }
    elseif ($start -notmatch '91-task-organizer-local') {
        Write-Host 'Central START does not mention Task Organizer yet; opening the tab anyway.' -ForegroundColor Yellow
    }
}

Write-Host "Opening Windows Terminal tab: $Title" -ForegroundColor Cyan
& wt.exe new-tab --title $Title powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File $Helper
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "wt.exe failed with exit code $LASTEXITCODE"
}
Write-Host 'Tab launched. Docs should open at http://localhost:3360/docs' -ForegroundColor Green
