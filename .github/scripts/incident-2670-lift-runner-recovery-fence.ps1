$ErrorActionPreference = 'Stop'
# Incident #2670: one-time owner-authorized retirement of the emergency
# HTTP publishing fence. Normal workload governor remains mandatory.
$path = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $path)) { throw 'runner_env_missing' }

function Read-Setting([string]$name) {
  $lines = @(Get-Content -LiteralPath $path | Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') })
  if ($lines.Count -gt 1) { throw "duplicate_setting_$name" }
  if ($lines.Count -eq 0) { return '' }
  return ([string]$lines[0] -split '=', 2)[1].Trim().Trim('"').Trim("'")
}
function Is-True([string]$name) { return ((Read-Setting $name) -match '^(1|true|yes|on)$') }

if (-not (Is-True 'PIPELINE_RUNNER_RECOVERY_READ_ONLY')) { throw 'recovery_fence_not_on' }
if (-not (Is-True 'STUDIO_WORKLOAD_GOVERNOR_ENABLED')) { throw 'governor_not_enabled' }
if (-not (Is-True 'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY')) { throw 'governed_recovery_producers_not_enabled' }
if ((Read-Setting 'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET') -ne 'ALL') { throw 'producer_scope_not_all' }
if ((Read-Setting 'STUDIO_MAX_PRODUCER_JOBS') -ne '1') { throw 'producer_cap_not_one' }
foreach ($key in @(
    'I1_DURABLE_ENABLED',
    'RENDERING_REVIEW_AUTO_DISPATCH_ENABLED',
    'NATIVE_GALLERY_AUTO_EXECUTE_ENABLED',
    'STUDIO_SIDE_EFFECT_OUTBOX_ENABLED'
)) {
  if (Is-True $key) { throw "unbounded_optional_consumer_$key" }
}

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $health.ok -or -not $health.recovery_read_only -or
    -not $health.workload_governor_enabled -or
    -not $health.recovery_producer_only_enabled -or
    $health.recovery_producer_scope -ne 'all_governed_requests' -or
    $health.studio_write_source -ne 'supabase' -or
    $health.studio_runner_output_read_source -ne 'supabase' -or
    $health.studio_runner_content_read_source -ne 'supabase' -or
    $health.airtable_activity.any_activity -or $health.i1_durable_jobs) {
  throw 'live_runner_preflight_failed'
}
$secret = Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
if (-not $secret) { throw 'runner_auth_missing' }
$workload = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
if (-not $workload.ok -or -not $workload.enabled -or
    $workload.database_circuit_open -or $workload.admission_paused -or
    [int]$workload.max_jobs -ne 1 -or [int]$workload.active_jobs -gt 1 -or
    [int]$workload.max_db_reads -gt 6 -or [int]$workload.max_db_writes -gt 3) {
  throw 'workload_governor_not_ready'
}

# A successful management API check alone is not database readiness.
$sb = (Read-Setting 'SUPABASE_URL').TrimEnd('/')
$key = Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
if (-not $sb.StartsWith('https://') -or -not $key) { throw 'supabase_connection_missing' }
try {
  $null = Invoke-RestMethod -Uri "$sb/rest/v1/platform_outputs?select=id&limit=1" -Headers @{
    apikey = $key; Authorization = "Bearer $key"
  } -TimeoutSec 20
} catch {
  throw 'supabase_rest_read_failed'
}

$backup = "$path.incident2670-prepublisher-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop
$updates = @{
  'PIPELINE_RUNNER_RECOVERY_READ_ONLY' = 'false'
  'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY' = 'false'
  'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET' = ''
}
$lines = @(Get-Content -LiteralPath $path)
foreach ($setting in @($updates.Keys)) {
  $count = 0
  for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match ('^\s*' + [regex]::Escape($setting) + '\s*=')) {
      $lines[$i] = $setting + '=' + $updates[$setting]
      $count += 1
    }
  }
  if ($count -ne 1) {
    throw "setting_missing_or_duplicate_$setting"
  }
}
[IO.File]::WriteAllLines($path, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
if ((Is-True 'PIPELINE_RUNNER_RECOVERY_READ_ONLY') -or
    (Is-True 'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY') -or
    (Read-Setting 'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET')) {
  throw 'recovery_fence_env_write_verification_failed'
}
Write-Output 'incident2670_emergency_publishing_fence=STAGED_OFF'
Write-Output 'incident2670_governor=ON_MAX_PRODUCERS_1'
Write-Output 'incident2670_optional_background_consumers=UNCHANGED_DISABLED'
