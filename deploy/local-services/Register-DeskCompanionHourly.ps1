<#
.SYNOPSIS
  Register or remove the hourly desk companion scheduled task.

.DESCRIPTION
  VERIFY every hour. START (existing Windows Terminal playbook) only when a
  public /health probe fails. Requires an interactive logon (PC logged in;
  locked is OK). Does not bounce healthy services.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$TaskName = 'ChicagoShining Desk Companion Hourly'
$Runner = Join-Path $RepoRoot 'deploy\local-services\Run-DeskCompanionHourly.ps1'

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Host "Removed scheduled task: $TaskName"
    exit 0
}

if (-not (Test-Path -LiteralPath $Runner)) {
    throw "Missing hourly runner: $Runner"
}

$arg = '-NoProfile -ExecutionPolicy Bypass -File "' + $Runner + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory (Split-Path -Parent $Runner)
$startAt = (Get-Date).AddMinutes(3)
$trigger = New-ScheduledTaskTrigger -Once -At $startAt -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 25) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'Hourly public /health. START if a probe is down. PLAN+DEPLOY one service when live stamp is behind origin/main.' `
        -Force | Out-Null
} catch {
    Write-Host "Limited principal failed: $($_.Exception.Message)"
    Write-Host 'Retrying via schtasks.exe...'
    $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $Runner + '"'
    $startStamp = $startAt.ToString('HH:mm')
    schtasks.exe /Create /TN $TaskName /SC HOURLY /MO 1 /ST $startStamp /TR $tr /F /IT
    if ($LASTEXITCODE -ne 0) { throw "schtasks create failed: $LASTEXITCODE" }
}

Write-Host "Registered scheduled task: $TaskName"
Write-Host ("Next run: {0}" -f $startAt)
Write-Host 'Runs in this Windows session (locked is OK). Keep the PC on and logged in.'
Write-Host 'Remove with: Register-DeskCompanionHourly.ps1 -Unregister'
