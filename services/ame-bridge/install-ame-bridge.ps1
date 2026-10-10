$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$example = Join-Path $here 'ame-bridge.example.json'
$local = Join-Path $here 'ame-bridge.local.json'
$launcher = Join-Path $here 'ame-bridge-hidden.vbs'
if (-not (Test-Path -LiteralPath $example)) { throw "Missing $example" }
if (-not (Test-Path -LiteralPath $launcher)) { throw "Missing $launcher" }
if (-not (Test-Path -LiteralPath $local)) {
    Copy-Item -LiteralPath $example -Destination $local
    Write-Output "Created $local"
}

$env:AME_BRIDGE_CONFIG = $local
Push-Location $here
try {
    py -3 -c "import json, os; from pathlib import Path; from ame_bridge.watch import BridgeConfig, ensure_layout; payload = json.loads(Path(os.environ['AME_BRIDGE_CONFIG']).read_text(encoding='utf-8')); root = ensure_layout(BridgeConfig.from_dict(payload).root); print(root)"
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { throw "Could not create the AME bridge folders" }

$taskName = 'SM-Pipeline AME Bridge'
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('//B //Nologo "{0}"' -f $launcher)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Set-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings | Out-Null
    Write-Output "Updated scheduled task: $taskName"
} else {
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Watches Adobe Media Encoder output folders and removes the inbox source copy after a validated encode.' | Out-Null
    Write-Output "Installed scheduled task: $taskName"
}

Start-ScheduledTask -TaskName $taskName
Write-Output "Started $taskName"
