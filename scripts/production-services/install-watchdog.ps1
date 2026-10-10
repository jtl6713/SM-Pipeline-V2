param([string]$ConfigPath = (Join-Path $PSScriptRoot 'watchdog.local.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ConfigPath)) { throw 'Create watchdog.local.json from watchdog.example.json first.' }
$scriptPath = Join-Path $PSScriptRoot 'watchdog.ps1'
$taskName = 'SM-Pipeline Local Service Watchdog'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}"' -f $scriptPath,$ConfigPath)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Check local rendering services, restart with bounded attempts, and send notifications' -Force | Out-Null
Write-Output "Installed scheduled task: $taskName"
