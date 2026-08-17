param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Join-Path $PipelineRoot 'Source Control\SM-Pipeline-V2'
$DeployScript = Join-Path $RepoRoot 'deploy\local-services\Deploy-SMService.ps1'
$ToolsRoot = Join-Path $PipelineRoot 'Production Start-Stop-Verify Services'

if (-not (Test-Path -LiteralPath $DeployScript -PathType Leaf)) {
    throw "Deployment script not found. Pull GitHub main first:`n$DeployScript"
}
if (-not (Test-Path -LiteralPath $ToolsRoot -PathType Container)) {
    throw "Production Start-Stop-Verify Services folder not found:`n$ToolsRoot"
}

$deployBat = @'
@echo off
setlocal
set "DEPLOYER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Deploy-SMService.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEPLOYER%"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
'@

$planBat = @'
@echo off
setlocal
set "DEPLOYER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Deploy-SMService.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEPLOYER%" -PlanOnly
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
'@

$rollbackBat = @'
@echo off
setlocal
set "DEPLOYER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Deploy-SMService.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEPLOYER%" -RollbackLatest
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
'@

[System.IO.File]::WriteAllText(
    (Join-Path $ToolsRoot 'DEPLOY Local Service.bat'),
    $deployBat,
    [System.Text.Encoding]::ASCII
)
[System.IO.File]::WriteAllText(
    (Join-Path $ToolsRoot 'PLAN Local Service Deployment.bat'),
    $planBat,
    [System.Text.Encoding]::ASCII
)
[System.IO.File]::WriteAllText(
    (Join-Path $ToolsRoot 'ROLLBACK Local Service.bat'),
    $rollbackBat,
    [System.Text.Encoding]::ASCII
)

Write-Host ''
Write-Host 'PASS - local service deployment launchers installed.' -ForegroundColor Green
Write-Host "Folder: $ToolsRoot"
Write-Host ''
Write-Host 'Created:'
Write-Host '  DEPLOY Local Service.bat'
Write-Host '  PLAN Local Service Deployment.bat'
Write-Host '  ROLLBACK Local Service.bat'
Write-Host ''
