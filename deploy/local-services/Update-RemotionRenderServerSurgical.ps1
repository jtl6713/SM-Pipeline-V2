# Surgical Remotion update — clip mediaKind inference + Drive watermark + ffprobe path.
# Do NOT run full Deploy-SMService (public/job-assets backup hang).
# Usage (from an elevated or normal PowerShell on the render PC):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Update-RemotionRenderServerSurgical.ps1"

param(
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$ServiceRoot = ''
)

$ErrorActionPreference = "Stop"

if (-not $ServiceRoot) {
    $ServiceRoot = Join-Path $PipelineRoot 'Services\Remotion_Renderer'
}

$src = Join-Path $RepoRoot "services\remotion-renderer\render-server.js"
$dst = Join-Path $ServiceRoot "render-server.js"
if (-not (Test-Path $src)) { throw "Missing source render-server.js: $src" }
if (-not (Test-Path $ServiceRoot)) { throw "Missing Remotion service dir: $ServiceRoot" }

Write-Host "Stopping listeners on port 3333..."
Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        $procId = $_.OwningProcess
        if ($procId -and $procId -gt 0) {
            Write-Host "  Stop-Process -Id $procId"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
Start-Sleep -Seconds 2

Write-Host "Copying:"
Write-Host "  $src"
Write-Host "  -> $dst"
Copy-Item -Force $src $dst

$expected = "2026-10-10-health-first-boot"
if (-not (Select-String -Path $dst -SimpleMatch $expected -Quiet)) {
    throw "Copied render-server.js does not contain SERVICE_VERSION $expected"
}

Write-Host "Starting Remotion in a new window..."
Start-Process -FilePath "node" -ArgumentList "render-server.js" -WorkingDirectory $ServiceRoot

Write-Host "Waiting for /health..."
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:3333/health" -TimeoutSec 2
        if ($health.version -eq $expected) {
            Write-Host "OK version=$($health.version) active=$($health.remotionActiveRenders)"
            $ok = $true
            break
        }
        Write-Host "  still $($health.version) ..."
    } catch {
        Write-Host "  waiting..."
    }
}
if (-not $ok) {
    throw "Remotion did not advertise $expected on http://127.0.0.1:3333/health"
}
Write-Host "Done. Produce heal should requeue CI 239-243 on the next Worker tick."
