param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$Title = '9 LOC Task Organizer :3360'
$candidates = @(
    (Join-Path $PipelineRoot 'Production Start-Stop-Verify Services\_startup_helpers\91-task-organizer-local.ps1'),
    (Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\_startup_helpers\91-task-organizer-local.ps1'),
    (Join-Path $PipelineRoot 'Source Control\Production Start-Stop-Verify Services\_startup_helpers\91-task-organizer-local.ps1')
)

$shortcut = Join-Path $PipelineRoot 'START ChicagoShining Services.lnk'
if (Test-Path -LiteralPath $shortcut -PathType Leaf) {
    $shell = New-Object -ComObject WScript.Shell
    $target = $shell.CreateShortcut($shortcut).TargetPath
    Write-Host "START shortcut target: $target" -ForegroundColor Yellow
    if ($target) {
        $dir = $target
        if (Test-Path -LiteralPath $target -PathType Leaf) { $dir = Split-Path -Parent $target }
        $fromShortcut = Join-Path $dir '_startup_helpers\91-task-organizer-local.ps1'
        $candidates = @($fromShortcut) + $candidates
    }
}

$Helper = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $Helper) {
    throw 'Task Organizer helper not found. Re-run Integrate-TaskOrganizer-StartStopVerify.ps1 first.'
}
if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows Terminal (wt.exe) was not found.'
}

Write-Host "Opening tab from: $Helper" -ForegroundColor Cyan
& wt.exe new-tab --title $Title powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File $Helper
Write-Host 'Tab launched. Activity log opens after http://localhost:3360/health is ready.' -ForegroundColor Green
