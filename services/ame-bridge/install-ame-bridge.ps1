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
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed separate logon task: $taskName"
}
Write-Output "AME Bridge starts with START ChicagoShining Services and from the Ops Dashboard. It is not a separate logon task."
