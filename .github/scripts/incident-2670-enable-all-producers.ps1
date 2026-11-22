$ErrorActionPreference = 'Stop'
$path = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $path)) { throw 'runner_env_missing' }

function Read-Setting([string]$name) {
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return '' }
    return ([string]$line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}
function Is-True([string]$name) {
    return ((Read-Setting $name) -match '^(true|yes|1)$')
}

if (-not (Is-True 'PIPELINE_RUNNER_RECOVERY_READ_ONLY')) { throw 'publishing_fence_not_on' }
if (-not (Is-True 'STUDIO_WORKLOAD_GOVERNOR_ENABLED')) { throw 'governor_disabled' }
if (-not (Is-True 'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY')) { throw 'scoped_producers_disabled' }
if ((Read-Setting 'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET') -ne 'recR4EQcshFZ4fNL0') { throw 'unexpected_current_scope' }
if ((Read-Setting 'STUDIO_MAX_PRODUCER_JOBS') -ne '1') { throw 'producer_cap_not_one' }
foreach ($key in @('I1_DURABLE_ENABLED','RENDERING_REVIEW_AUTO_DISPATCH_ENABLED','NATIVE_GALLERY_AUTO_EXECUTE_ENABLED')) {
    if (Is-True $key) { throw "unsafe_consumer_$key" }
}
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $health.ok -or -not $health.recovery_read_only -or -not $health.workload_governor_enabled -or -not $health.recovery_producer_only_enabled -or $health.recovery_producer_scope -ne 'exact_request' -or $health.airtable_activity.any_activity -or $health.i1_durable_jobs) { throw 'live_runner_recovery_fence_mismatch' }

$secret = Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
if (-not $secret) { throw 'runner_secret_missing' }
$workload = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
if (-not $workload.enabled -or $workload.admission_paused -or $workload.database_circuit_open -or $workload.max_jobs -ne 1 -or $workload.active_jobs -ne 0 -or $workload.queued_jobs -ne 0 -or $workload.paused_jobs -ne 0) { throw 'governor_not_quiet' }

$sb = (Read-Setting 'SUPABASE_URL').TrimEnd('/')
$key = Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$rows = @(Invoke-RestMethod -Uri "$sb/rest/v1/production_requests?airtable_record_id=eq.recR4EQcshFZ4fNL0&select=airtable_record_id,production_job,variant_status,variant_manifest&limit=1" -Headers @{apikey=$key; Authorization="Bearer $key"} -TimeoutSec 20)
if ($rows.Count -ne 1) { throw 'canary_request_unavailable' }
$canary = $rows[0]
if ($canary.variant_status -ne 'Ready' -or [int]$canary.variant_manifest.plan_ready_count -lt 8) { throw '4x5_crops_not_verified_ready' }
if ($canary.production_job.error -and [string]$canary.production_job.error -notmatch 'No Platform Outputs found') { throw 'canary_unresolved_error' }

$backup = "$path.producers-all-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop
$lines = @(Get-Content -LiteralPath $path)
$changed = 0
for ($i=0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET\s*=') {
        $lines[$i] = 'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET=ALL'
        $changed += 1
    }
}
if ($changed -ne 1) { throw 'producer_scope_not_unique' }
[IO.File]::WriteAllLines($path, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'governed_producer_scope=ALL_CONFIGURED'
