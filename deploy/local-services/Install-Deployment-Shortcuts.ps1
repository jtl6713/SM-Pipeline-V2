param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Join-Path $PipelineRoot 'Source Control\SM-Pipeline-V2'
$DeployScript = Join-Path $RepoRoot 'deploy\local-services\Deploy-SMService.ps1'
$SyncScript = Join-Path $RepoRoot 'deploy\local-services\SYNC-Git-Main.bat'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$LegacyToolsRoot = Join-Path $PipelineRoot 'Production Start-Stop-Verify Services'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchiveRoot = Join-Path $ToolsRoot ('_legacy_archive\' + $Stamp)

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Write-Pass([string]$Text) {
    Write-Host "PASS: $Text" -ForegroundColor Green
}

function Write-Skip([string]$Text) {
    Write-Host "SKIP: $Text" -ForegroundColor DarkGray
}

function Resolve-ToolsRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in @($ToolsRoot, $LegacyToolsRoot)) {
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            $roots.Add((Resolve-Path -LiteralPath $candidate).Path)
        }
    }
    return @($roots | Select-Object -Unique)
}

function Move-ToArchive([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    if ($WhatIf) {
        Write-Host "WHATIF archive: $Path" -ForegroundColor Yellow
        return $true
    }
    New-Item -ItemType Directory -Force -Path $ArchiveRoot | Out-Null
    $name = Split-Path -Leaf $Path
    $dest = Join-Path $ArchiveRoot $name
    if (Test-Path -LiteralPath $dest) {
        $dest = Join-Path $ArchiveRoot ($Stamp + '_' + $name)
    }
    Move-Item -LiteralPath $Path -Destination $dest -Force
    Write-Host "Archived: $name" -ForegroundColor Yellow
    return $true
}

function Remove-TreeSafe([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    if ($WhatIf) {
        Write-Host "WHATIF delete: $Path" -ForegroundColor Yellow
        return $true
    }
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "Deleted: $Path" -ForegroundColor Yellow
    return $true
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    if ($WhatIf) {
        Write-Host "WHATIF write: $Path" -ForegroundColor Yellow
        return
    }
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Write-AsciiFile([string]$Path, [string]$Text) {
    if ($WhatIf) {
        Write-Host "WHATIF write: $Path" -ForegroundColor Yellow
        return
    }
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.Encoding]::ASCII)
}

function New-Shortcut([string]$LinkPath, [string]$TargetPath, [string]$Arguments = '', [string]$WorkingDirectory = '', [string]$Description = '') {
    if (-not (Test-Path -LiteralPath $TargetPath)) {
        Write-Skip "shortcut target missing: $TargetPath"
        return
    }
    if ($WhatIf) {
        Write-Host "WHATIF shortcut: $LinkPath -> $TargetPath $Arguments" -ForegroundColor Yellow
        return
    }
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($LinkPath)
    $sc.TargetPath = $TargetPath
    $sc.Arguments = $Arguments
    if ($WorkingDirectory) { $sc.WorkingDirectory = $WorkingDirectory }
    if ($Description) { $sc.Description = $Description }
    $sc.Save()
    Write-Pass (Split-Path -Leaf $LinkPath)
}

Write-Step 'Preflight'
if (-not (Test-Path -LiteralPath $DeployScript -PathType Leaf)) {
    throw "Deployment script not found. Pull GitHub main first:`n$DeployScript"
}
if (-not (Test-Path -LiteralPath $ToolsRoot -PathType Container)) {
    throw "Production Start-Stop-Verify Services folder not found:`n$ToolsRoot"
}
$toolRoots = Resolve-ToolsRoots
Write-Pass "Tools root: $ToolsRoot"
if ($toolRoots.Count -gt 1) {
    Write-Pass "Also updating legacy junction/copy: $($toolRoots -join '; ')"
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

$runnerBat = @'
@echo off
setlocal
set "DEPLOYER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Deploy-SMService.ps1"
echo Deploy pipeline-runner from GitHub main. VERIFY health is not enough.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEPLOYER%" -Service pipeline-runner
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Pipeline runner deploy failed. A dirty Git checkout blocks Deploy-SMService.
if "%RC%"=="0" echo Confirm https://pipeline.chicagoshining.com/stages lists clip_poster.
pause
exit /b %RC%
'@

$syncBat = @'
@echo off
setlocal
set "SYNC=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\SYNC-Git-Main.bat"
if not exist "%SYNC%" (
  echo FAIL - sync script not found. Pull GitHub main in SM-Pipeline-V2 first:
  echo   %SYNC%
  echo.
  pause
  exit /b 1
)
call "%SYNC%"
exit /b %ERRORLEVEL%
'@

$installBat = @'
@echo off
setlocal
set "INSTALLER=D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Install-Deployment-Shortcuts.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
'@

Write-Step 'Install operator launchers into Start-Stop-Verify folder(s)'
$launcherFiles = @{
    'DEPLOY Local Service.bat' = $deployBat
    'PLAN Local Service Deployment.bat' = $planBat
    'ROLLBACK Local Service.bat' = $rollbackBat
    'DEPLOY Pipeline Runner.bat' = $runnerBat
    'SYNC Local Git Checkout.bat' = $syncBat
    'INSTALL Operator Shortcuts.bat' = $installBat
}
foreach ($root in $toolRoots) {
    foreach ($name in $launcherFiles.Keys) {
        Write-AsciiFile (Join-Path $root $name) $launcherFiles[$name]
    }
    Write-Pass "Launchers written under $root"
}

Write-Step 'Archive unused / one-time / superseded Start-Stop-Verify files'
$legacyNames = @(
    'README-FOUR-SERVICE-STARTUP.txt',
    'README-PORT-GUARD-FIX.txt',
    'README-YOUTUBE-UPLOADER-STARTUP-UPDATE.txt',
    'README - OAuth Hardened Verify Services.txt',
    'PLAN Local Service Deployment.txt',
    'Apply-Remotion-Renderer-Path-Update.ps1',
    'create-production-shortcuts.ps1'
)
$archived = 0
foreach ($root in $toolRoots) {
    foreach ($name in $legacyNames) {
        $path = Join-Path $root $name
        if (Move-ToArchive $path) { $archived++ }
    }
}
if ($archived -eq 0) {
    Write-Skip 'No listed legacy files were present'
} else {
    Write-Pass "Archived $archived file(s) under $ArchiveRoot"
}

Write-Step 'Remove pipeline-root waste'
$pytestCache = Join-Path $PipelineRoot '.pytest_cache'
if (Remove-TreeSafe $pytestCache) {
    Write-Pass 'Removed .pytest_cache from pipeline root'
} else {
    Write-Skip '.pytest_cache not present'
}

$oneTimeFolder = Join-Path $PipelineRoot 'Complete DB and Google Asset Refresh'
if (Test-Path -LiteralPath $oneTimeFolder -PathType Container) {
    $pipelineArchive = Join-Path $PipelineRoot ('_legacy_archive\' + $Stamp)
    if ($WhatIf) {
        Write-Host "WHATIF archive one-time folder: $oneTimeFolder" -ForegroundColor Yellow
    } else {
        New-Item -ItemType Directory -Force -Path $pipelineArchive | Out-Null
        Move-Item -LiteralPath $oneTimeFolder -Destination (Join-Path $pipelineArchive 'Complete DB and Google Asset Refresh') -Force
        Write-Pass "Archived one-time folder to $pipelineArchive"
    }
} else {
    Write-Skip 'Complete DB and Google Asset Refresh not present'
}

Write-Step 'Create / refresh ChicagoShining Pipeline root shortcuts'
# Preserve existing START / STOP / VERIFY targets (they may be wt.exe with tab args).
# Only create them when missing, pointing at the canonical Start-Stop-Verify scripts.
$startBat = Join-Path $ToolsRoot 'start-chicagoshining-local-services.bat'
$stopBat = Join-Path $ToolsRoot 'stop-chicagoshining-local-services.bat'
$verifyHardenedBat = Join-Path $ToolsRoot 'VERIFY CHICAGOSHINING SERVICES - OAUTH HARDENED.bat'
$verifyBat = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.bat'
$verifyTarget = if (Test-Path -LiteralPath $verifyHardenedBat) { $verifyHardenedBat } else { $verifyBat }

$rootShortcuts = @(
    @{ Name = 'START ChicagoShining Services.lnk'; Target = $startBat; PreserveIfExists = $true; Description = 'Start all local ChicagoShining services' },
    @{ Name = 'STOP ChicagoShining Services.lnk'; Target = $stopBat; PreserveIfExists = $true; Description = 'Stop all local ChicagoShining services' },
    @{ Name = 'VERIFY ChicagoShining Services.lnk'; Target = $verifyTarget; PreserveIfExists = $true; Description = 'Verify local + public service health' },
    @{ Name = 'SYNC Local Git Checkout.lnk'; Target = (Join-Path $ToolsRoot 'SYNC Local Git Checkout.bat'); PreserveIfExists = $false; Description = 'Fast-forward SM-Pipeline-V2 to origin/main' },
    @{ Name = 'PLAN Local Service Deployment.lnk'; Target = (Join-Path $ToolsRoot 'PLAN Local Service Deployment.bat'); PreserveIfExists = $false; Description = 'Read-only deployment plan from GitHub main' },
    @{ Name = 'DEPLOY Local Service.lnk'; Target = (Join-Path $ToolsRoot 'DEPLOY Local Service.bat'); PreserveIfExists = $false; Description = 'Deploy one approved service from GitHub main' },
    @{ Name = 'DEPLOY Pipeline Runner.lnk'; Target = (Join-Path $ToolsRoot 'DEPLOY Pipeline Runner.bat'); PreserveIfExists = $false; Description = 'Deploy pipeline-runner only' },
    @{ Name = 'ROLLBACK Local Service.lnk'; Target = (Join-Path $ToolsRoot 'ROLLBACK Local Service.bat'); PreserveIfExists = $false; Description = 'Rollback the latest local service deployment' }
)

foreach ($item in $rootShortcuts) {
    $linkPath = Join-Path $PipelineRoot $item.Name
    if ($item.PreserveIfExists -and (Test-Path -LiteralPath $linkPath)) {
        Write-Skip "kept existing $($item.Name)"
        continue
    }
    $workDir = Split-Path -Parent $item.Target
    New-Shortcut -LinkPath $linkPath -TargetPath $item.Target -WorkingDirectory $workDir -Description $item.Description
}

# Keep a folder shortcut into the operator tools root.
$toolsFolderLink = Join-Path $PipelineRoot 'Production Start-Stop-Verify Services.lnk'
New-Shortcut -LinkPath $toolsFolderLink -TargetPath $ToolsRoot -Description 'Open Production Start-Stop-Verify Services'

# Mirror the new activity shortcuts into the tools folder for discoverability.
Write-Step 'Mirror activity shortcuts inside Start-Stop-Verify folder'
foreach ($item in $rootShortcuts) {
    if ($item.Name -match '^(START|STOP|VERIFY) ') { continue }
    $linkPath = Join-Path $ToolsRoot $item.Name
    $workDir = Split-Path -Parent $item.Target
    New-Shortcut -LinkPath $linkPath -TargetPath $item.Target -WorkingDirectory $workDir -Description $item.Description
}

Write-Host ''
Write-Host 'PASS - operator launchers, cleanup, and pipeline-root shortcuts are ready.' -ForegroundColor Green
Write-Host "Pipeline root: $PipelineRoot"
Write-Host "Tools folder:  $ToolsRoot"
if (Test-Path -LiteralPath $ArchiveRoot) {
    Write-Host "Legacy archive: $ArchiveRoot"
}
Write-Host ''
Write-Host 'Root shortcuts:'
Write-Host '  START / STOP / VERIFY ChicagoShining Services  (existing preserved)'
Write-Host '  SYNC Local Git Checkout'
Write-Host '  PLAN Local Service Deployment'
Write-Host '  DEPLOY Local Service'
Write-Host '  DEPLOY Pipeline Runner'
Write-Host '  ROLLBACK Local Service'
Write-Host '  Production Start-Stop-Verify Services  (folder)'
Write-Host ''
