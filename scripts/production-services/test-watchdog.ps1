$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("sm-watchdog-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
    Copy-Item (Join-Path $here 'watchdog.ps1') (Join-Path $temp 'watchdog.ps1')
    $configPath = Join-Path $temp 'watchdog.local.json'
    $base = @{
        maxConsecutiveRestarts = 1
        cooldownMinutes = 5
        httpTimeoutSeconds = 2
        notificationEmailTo = 'test@example.invalid'
        notificationWebhookUrl = ''
        services = @(@{name='Test renderer';type='process';processName='definitely_nonexistent_sm_watchdog_020';restartCommand='';restartWorkingDirectory=''})
    }
    $base | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath
    & (Join-Path $temp 'watchdog.ps1') -ConfigPath $configPath
    $state = Get-Content (Join-Path $temp 'watchdog.state.json') -Raw | ConvertFrom-Json
    if (-not $state.'Test renderer'.down) { throw 'Expected down state' }
    if (@($state._pendingNotifications).Count -lt 3) { throw 'Expected persisted DOWN, RESTART FAILED and LIMIT alerts' }
    if (@($state._pendingNotifications | Where-Object { $_.kind -eq 'DOWN' }).Count -ne 1) { throw 'Expected one DOWN event' }
    # Simulate a Gmail sender that succeeds and logs subjects, without network or credentials.
    @'
param([string]$Message,[string]$To,[string]$Subject)
$Subject | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'delivered.txt')
'@ | Set-Content -LiteralPath (Join-Path $temp 'send-watchdog-email.ps1')
    # A real, currently running process gives a healthy service for the next check.
    $base.services[0].processName = 'powershell'
    $base | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath
    & (Join-Path $temp 'watchdog.ps1') -ConfigPath $configPath
    $state = Get-Content (Join-Path $temp 'watchdog.state.json') -Raw | ConvertFrom-Json
    if ($state.'Test renderer'.down -or $state.'Test renderer'.failures -ne 0) { throw 'Recovery state not reset' }
    if (@($state._pendingNotifications).Count -ne 0) { throw 'Successfully delivered notifications were not cleared' }
    $subjects = @(Get-Content (Join-Path $temp 'delivered.txt'))
    foreach ($label in @('DOWN', 'RESTART FAILED', 'RESTART LIMIT', 'RECOVERED')) {
        if (@($subjects | Where-Object { $_ -like "*$label" }).Count -ne 1) { throw "Missing or duplicated event subject: $label" }
    }
    Write-Host 'PASS: queued events survive failed delivery, retry, clear after acknowledgment, and use distinct subjects.'
} finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
