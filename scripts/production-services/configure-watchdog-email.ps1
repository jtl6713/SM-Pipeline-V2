param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[^\s@]+@[^\s@]+\.[^\s@]+$')][string]$To,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'watchdog.local.json')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Missing watchdog config: $ConfigPath" }
$cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($cfg.PSObject.Properties.Name -contains 'notificationEmailTo') {
    $cfg.notificationEmailTo = $To
} else {
    $cfg | Add-Member -NotePropertyName notificationEmailTo -NotePropertyValue $To
}
Copy-Item -LiteralPath $ConfigPath -Destination "$ConfigPath.bak" -Force
ConvertTo-Json -InputObject $cfg -Depth 15 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
Write-Host "Configured Gmail notification destination: $To"
Write-Host "Kept existing Remotion health and restart settings unchanged."
