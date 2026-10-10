param([string]$ConfigPath = (Join-Path $PSScriptRoot 'watchdog.local.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Missing local config: $ConfigPath" }
$taskName = 'SM-Pipeline Local Service Watchdog'
$launcherPath = Join-Path $PSScriptRoot 'watchdog-hidden.vbs'
if (-not (Test-Path -LiteralPath $launcherPath)) { throw "Hidden launcher missing: $launcherPath" }
$fullConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('//B //Nologo "{0}" "{1}"' -f $launcherPath, $fullConfigPath)

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    # IMPORTANT: Do not change the configured Windows account, interactive logon
    # choice, triggers, or other operator settings when switching to hidden mode.
    Set-ScheduledTask -TaskName $taskName -Action $action -ErrorAction Stop | Out-Null
    Write-Output "Updated existing task action to hidden watchdog launcher: $taskName"
} else {
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -StartWhenAvailable
    # Interactive user context can read DPAPI Gmail credentials saved by that user.
    # It also avoids prompting for the Microsoft account password. Task doesn't
    # run when the user signs out or when Windows is asleep.
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Hidden local service checks, bounded restarts, durable Gmail alerts' -ErrorAction Stop | Out-Null
    Write-Output "Installed hidden local watchdog scheduled task: $taskName"
}
