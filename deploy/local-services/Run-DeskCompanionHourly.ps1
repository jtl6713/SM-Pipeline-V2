<#
.SYNOPSIS
  Unattended hourly keep-alive: public /health, START+VERIFY only when a probe is down.

.DESCRIPTION
  Logs under Deployment Logs\Local Services. Does not STOP healthy services.
  START if a required public /health is down. If origin/main has moved past a
  live .smv2-deployment.json stamp, PLAN+DEPLOY that one service from main
  (picks up merged enhancements and restarts that listener). Never git reset.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [string]$LogDir = 'D:\Content Creation\ChicagoShining Pipeline\Deployment Logs\Local Services',
    [string]$DeskMode = 'infra'
)

$ErrorActionPreference = 'Continue'
$Companion = Join-Path $RepoRoot 'deploy\local-services\Invoke-DeskCompanion.ps1'
if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$log = Join-Path $LogDir ('desk-companion-hourly-' + (Get-Date -Format 'yyyyMMdd') + '.log')

Start-Transcript -Path $log -Append | Out-Null
$exitCode = 0
try {
    Write-Host ("Desk companion hourly {0} mode={1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $DeskMode)
    if (-not (Test-Path -LiteralPath $Companion)) {
        throw "Missing companion: $Companion"
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Companion -RestartDown -DeployDown -DeskMode $DeskMode
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
} catch {
    Write-Host ("Hourly companion failed: " + $_.Exception.Message)
    $exitCode = 1
} finally {
    Write-Host ("Desk companion hourly exit={0}" -f $exitCode)
    Stop-Transcript | Out-Null
}
exit $exitCode
