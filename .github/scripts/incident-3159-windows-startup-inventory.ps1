$ErrorActionPreference='Stop'
$pattern='(?i)chicago.?shining|pipeline.?runner|remotion|ops.?dashboard|cloudflared|voiceover.?normaliz|sm.?pipeline|watermark|media.?transfer|youtube.?upload'
try {
  $os=Get-CimInstance Win32_OperatingSystem
  Write-Output ('STARTUP3159_BOOT='+([DateTimeOffset]$os.LastBootUpTime).ToUniversalTime().ToString('o'))
  function AccountKind([string]$v){
    if($v -match '^(LocalSystem|NT AUTHORITY\\SYSTEM|SYSTEM|S-1-5-18)$'){return 'System'}
    if($v -match 'LocalService|LOCAL SERVICE|S-1-5-19'){return 'LocalService'}
    if($v -match 'NetworkService|NETWORK SERVICE|S-1-5-20'){return 'NetworkService'}
    if($v -match '^NT SERVICE\\'){return 'VirtualServiceAccount'}
    if(-not $v){return 'Unknown'}
    return 'NamedAccount'
  }
  $services=@(Get-CimInstance Win32_Service | Where-Object {("$($_.Name) $($_.DisplayName) $($_.PathName)") -match $pattern} | ForEach-Object {
    @{name=$_.Name;display=$_.DisplayName;mode=$_.StartMode;state=$_.State;account=(AccountKind $_.StartName)}
  })
  Write-Output ('STARTUP3159_SERVICES='+ (ConvertTo-Json -InputObject $services -Compress -Depth 5))
  $tasks=@(Get-ScheduledTask | Where-Object {
    $name=$_.TaskName+' '+$_.TaskPath
    $actions=($_.Actions | ForEach-Object {"$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)"}) -join ' '
    ($name+' '+$actions) -match $pattern
  } | ForEach-Object {
    $t=$_
    $triggers=@($t.Triggers | ForEach-Object {@{type=$_.CimClass.CimClassName;enabled=$_.Enabled}})
    @{name=$t.TaskName;path=$t.TaskPath;state=[string]$t.State;enabled=$t.Settings.Enabled;logon_type=[string]$t.Principal.LogonType;account=(AccountKind $t.Principal.UserId);run_level=[string]$t.Principal.RunLevel;triggers=$triggers;restart_count=$t.Settings.RestartCount}
  })
  Write-Output ('STARTUP3159_TASKS='+ (ConvertTo-Json -InputObject $tasks -Compress -Depth 6))
  $startup=@(Get-CimInstance Win32_StartupCommand | Where-Object {("$($_.Name) $($_.Command)") -match $pattern} | ForEach-Object {@{name=$_.Name;location=$_.Location;account=(AccountKind $_.User)}})
  Write-Output ('STARTUP3159_LOGIN_COMMANDS='+ (ConvertTo-Json -InputObject $startup -Compress -Depth 5))
  Write-Output 'STARTUP3159_PROOF=PASS_READONLY'
} catch {throw 'startup3159_inventory_failed'}
