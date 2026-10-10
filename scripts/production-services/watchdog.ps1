param([string]$ConfigPath = (Join-Path $PSScriptRoot 'watchdog.local.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ConfigPath)) { throw "Missing local config: $ConfigPath. Copy watchdog.example.json and configure actual service names and notification URL." }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$statePath = Join-Path $PSScriptRoot 'watchdog.state.json'
$lockPath = Join-Path $PSScriptRoot 'watchdog.lock'
$lock = $null
try { $lock = [System.IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None') } catch { exit 0 }
try {
  $state = @{}
  if (Test-Path $statePath) {
    $loaded = Get-Content $statePath -Raw | ConvertFrom-Json
    foreach ($p in $loaded.PSObject.Properties) { $state[$p.Name] = $p.Value }
  }
  $max = [Math]::Max(1,[int]$config.maxConsecutiveRestarts)
  $cooldown = [Math]::Max(1,[int]$config.cooldownMinutes)
  $timeout = [Math]::Max(2,[int]$config.httpTimeoutSeconds)
  function Notify([string]$message) {
    Write-Output $message
    if ($config.notificationWebhookUrl) {
      try {
        Invoke-RestMethod -Uri $config.notificationWebhookUrl -Method Post -ContentType 'application/json' -Body (@{text=$message; source='SM-Pipeline local watchdog'; host=$env:COMPUTERNAME} | ConvertTo-Json -Compress) -TimeoutSec 10 | Out-Null
      } catch { Write-Warning "Notification failed: $($_.Exception.Message)" }
    }
  }
  foreach ($item in $config.services) {
    $name = [string]$item.name
    if (-not $name) { continue }
    if (-not $state.ContainsKey($name)) { $state[$name] = [pscustomobject]@{ failures=0; down=$false; lastAttempt=''; exhausted=$false } }
    $s = $state[$name]
    $healthy = $false
    try {
      if ($item.type -eq 'windows-service') {
        $svc = Get-Service -Name $item.serviceName -ErrorAction Stop
        $healthy = $svc.Status -eq 'Running'
      } elseif ($item.type -eq 'http') {
        $response = Invoke-WebRequest -Uri $item.healthUrl -TimeoutSec $timeout -UseBasicParsing
        $healthy = [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400
      } elseif ($item.type -eq 'process') {
        $healthy = @(Get-Process -Name $item.processName -ErrorAction SilentlyContinue).Count -gt 0
      } else { throw "Unknown check type for $name" }
    } catch { $healthy = $false }
    if ($healthy) {
      if ($s.down) { Notify "RECOVERED: $name on $env:COMPUTERNAME is healthy." }
      $s.failures = 0; $s.down = $false; $s.exhausted = $false; $s.lastAttempt = ''
      continue
    }
    if (-not $s.down) { Notify "DOWN: $name on $env:COMPUTERNAME failed health check." }
    $s.down = $true
    if ($s.exhausted -or [int]$s.failures -ge $max) { continue }
    $last = [datetime]::MinValue
    if ($s.lastAttempt) { [void][datetime]::TryParse([string]$s.lastAttempt,[ref]$last) }
    if (([datetime]::UtcNow - $last.ToUniversalTime()).TotalMinutes -lt $cooldown) { continue }
    $s.failures = [int]$s.failures + 1
    $s.lastAttempt = [datetime]::UtcNow.ToString('o')
    try {
      if ($item.type -eq 'windows-service') {
        $svc = Get-Service -Name $item.serviceName -ErrorAction Stop
        if ($svc.Status -eq 'Running') { Restart-Service -Name $item.serviceName -ErrorAction Stop }
        else { Start-Service -Name $item.serviceName -ErrorAction Stop }
      } elseif ($item.restartCommand -and $item.restartWorkingDirectory) {
        $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',[string]$item.restartCommand) -WorkingDirectory ([string]$item.restartWorkingDirectory) -PassThru -WindowStyle Hidden
      } else { throw "No restart command configured for $name" }
      Notify "RESTART ATTEMPT $($s.failures)/$max: $name on $env:COMPUTERNAME."
    } catch { Notify "RESTART FAILED $($s.failures)/$max: $name on $env:COMPUTERNAME - $($_.Exception.Message)" }
    if ([int]$s.failures -ge $max) {
      $s.exhausted = $true
      Notify "ESCALATION: $name reached $max consecutive restart attempts; automatic restart suspended until healthy or manually reset."
    }
  }
  $tmp = "$statePath.tmp"
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $statePath -Force
} finally { if ($lock) { $lock.Dispose() } }
