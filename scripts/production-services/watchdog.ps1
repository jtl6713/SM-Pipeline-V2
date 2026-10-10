param([string]$ConfigPath = (Join-Path $PSScriptRoot 'watchdog.local.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Missing watchdog configuration: $ConfigPath" }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$statePath = Join-Path $PSScriptRoot 'watchdog.state.json'
$lockPath = Join-Path $PSScriptRoot 'watchdog.lock'
$lock = $null
try { $lock = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') } catch [System.IO.IOException] { Write-Warning 'Watchdog is already running; skipping overlapping check.'; exit 0 }

try {
    $state = @{}
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($property in $saved.PSObject.Properties) { $state[$property.Name] = $property.Value }
    }
    # Preserve the existing per-service state format and add a durable alert queue.
    if (-not $state.ContainsKey('_pendingNotifications')) { $state['_pendingNotifications'] = @() }

    $max = [Math]::Max(1, [int]$config.maxConsecutiveRestarts)
    $cooldown = [Math]::Max(1, [int]$config.cooldownMinutes)
    $timeout = [Math]::Max(2, [int]$config.httpTimeoutSeconds)

    function Save-State {
        # Persist event and state transition together BEFORE attempting delivery.
        $temp = "$statePath.tmp"
        $json = ConvertTo-Json -InputObject $state -Depth 12
        [System.IO.File]::WriteAllText($temp, $json, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temp -Destination $statePath -Force
    }

    function Queue-Notification([string]$kind, [string]$service, [string]$message) {
        Write-Output $message
        $channels = @()
        if (-not [string]::IsNullOrWhiteSpace([string]$config.notificationEmailTo)) { $channels += 'gmail' }
        if (-not [string]::IsNullOrWhiteSpace([string]$config.notificationWebhookUrl)) { $channels += 'webhook' }
        if ($channels.Count -eq 0) {
            Write-Warning 'No notification channel configured. Event is recorded but no remote alert can be delivered.'
            $channels += 'unconfigured'
        }
        $event = [pscustomobject]@{
            id = [guid]::NewGuid().ToString()
            kind = $kind
            service = $service
            subject = "[ChicagoShining Watchdog] $service $kind"
            message = $message
            createdAt = [datetime]::UtcNow.ToString('o')
            pendingChannels = @($channels)
            attempts = 0
        }
        $state['_pendingNotifications'] = @($state['_pendingNotifications']) + @($event)
        Save-State
    }

    function Flush-Notifications {
        foreach ($event in @($state['_pendingNotifications'])) {
            foreach ($channel in @($event.pendingChannels)) {
                if ($channel -eq 'unconfigured') { continue }
                try {
                    if ($channel -eq 'gmail') {
                        $mailScript = Join-Path $PSScriptRoot 'send-watchdog-email.ps1'
                        if (-not (Test-Path -LiteralPath $mailScript)) { throw "Email sender missing: $mailScript" }
                        & $mailScript -Message ([string]$event.message) -Subject ([string]$event.subject) -To ([string]$config.notificationEmailTo) -ErrorAction Stop
                    } elseif ($channel -eq 'webhook') {
                        $payload = @{ text = [string]$event.message; subject = [string]$event.subject; eventId = [string]$event.id; host = $env:COMPUTERNAME } | ConvertTo-Json -Compress
                        Invoke-RestMethod -Uri $config.notificationWebhookUrl -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 10 -ErrorAction Stop | Out-Null
                    } else {
                        throw "Unexpected notification channel: $channel"
                    }
                    # Checkpoint each successful channel so it will not be sent again on later runs.
                    $event.pendingChannels = @($event.pendingChannels | Where-Object { $_ -ne $channel })
                    Save-State
                    Write-Output "Delivered $channel alert: $($event.subject)"
                } catch {
                    $event.attempts = [int]$event.attempts + 1
                    Save-State
                    Write-Warning "Pending $channel alert will retry on next check: $($event.subject) ($($_.Exception.Message))"
                }
            }
            if (@($event.pendingChannels).Count -eq 0) {
                $eventId = [string]$event.id
                $state['_pendingNotifications'] = @($state['_pendingNotifications'] | Where-Object { $_.id -ne $eventId })
                Save-State
            }
        }
    }

    # Retry prior unsent alerts even when every service currently looks healthy.
    Flush-Notifications
    foreach ($item in @($config.services)) {
        $name = [string]$item.name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        if (-not $state.ContainsKey($name)) {
            $state[$name] = [pscustomobject]@{ failures = 0; down = $false; lastAttempt = ''; exhausted = $false }
            Save-State
        }
        $s = $state[$name]
        $healthy = $false
        try {
            if ($item.type -eq 'windows-service') {
                $healthy = (Get-Service -Name $item.serviceName -ErrorAction Stop).Status -eq 'Running'
            } elseif ($item.type -eq 'http') {
                $response = Invoke-WebRequest -Uri $item.healthUrl -TimeoutSec $timeout -UseBasicParsing -ErrorAction Stop
                $healthy = [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400
                # A JSON /health response with ok:false must not count as healthy.
                if ($healthy -and [string]$response.Headers['Content-Type'] -match 'json') {
                    $healthBody = $response.Content | ConvertFrom-Json -ErrorAction Stop
                    if ($healthBody.PSObject.Properties.Name -contains 'ok') { $healthy = $healthBody.ok -eq $true }
                }
            } elseif ($item.type -eq 'process') {
                $healthy = @(Get-Process -Name $item.processName -ErrorAction SilentlyContinue).Count -gt 0
            } else { throw "Unknown health check type for $name" }
        } catch { $healthy = $false }

        if ($healthy) {
            $wasDown = [bool]$s.down
            $s.failures = 0
            $s.down = $false
            $s.exhausted = $false
            $s.lastAttempt = ''
            if ($wasDown) {
                Queue-Notification 'RECOVERED' $name "RECOVERED: $name on $env:COMPUTERNAME is healthy."
            } else { Save-State }
            continue
        }

        if (-not [bool]$s.down) {
            $s.down = $true
            Queue-Notification 'DOWN' $name "DOWN: $name on $env:COMPUTERNAME failed health check."
        }

        if ([bool]$s.exhausted -or [int]$s.failures -ge $max) { continue }
        $last = [datetime]::MinValue
        if ($s.lastAttempt) { [void][datetime]::TryParse([string]$s.lastAttempt, [ref]$last) }
        if (([datetime]::UtcNow - $last.ToUniversalTime()).TotalMinutes -lt $cooldown) { continue }

        $s.failures = [int]$s.failures + 1
        $s.lastAttempt = [datetime]::UtcNow.ToString('o')
        Save-State
        try {
            if ($item.type -eq 'windows-service') {
                $service = Get-Service -Name $item.serviceName -ErrorAction Stop
                if ($service.Status -eq 'Running') { Restart-Service -Name $item.serviceName -ErrorAction Stop }
                else { Start-Service -Name $item.serviceName -ErrorAction Stop }
            } elseif ($item.restartCommand -and $item.restartWorkingDirectory) {
                $command = [string]$item.restartCommand
                if (-not (Test-Path -LiteralPath $command)) { throw "Restart script missing: $command" }
                $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $command)) -WorkingDirectory ([string]$item.restartWorkingDirectory) -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop
                if ($proc.ExitCode -ne 0) { throw "Restart script returned exit code $($proc.ExitCode)" }
            } else { throw "No restart command configured for $name" }
            Queue-Notification 'RESTART ATTEMPT' $name "RESTART ATTEMPT $($s.failures)/${max}: $name on $env:COMPUTERNAME."
        } catch {
            Queue-Notification 'RESTART FAILED' $name "RESTART FAILED $($s.failures)/${max}: $name on $env:COMPUTERNAME - $($_.Exception.Message)"
        }
        if ([int]$s.failures -ge $max) {
            $s.exhausted = $true
            Save-State
            Queue-Notification 'RESTART LIMIT' $name "ESCALATION: $name reached $max consecutive restart attempts; automatic restart suspended until healthy or manually reset."
        }
    }
    Flush-Notifications
    Save-State
} finally {
    if ($lock) { $lock.Dispose() }
}
