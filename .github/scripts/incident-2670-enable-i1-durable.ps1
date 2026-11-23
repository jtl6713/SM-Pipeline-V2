$ErrorActionPreference='Stop'
# Owner-authorized Phase 4 of incident #2670, independent of C5/C6 and review
# workers. Do not replay preexisting uncertain jobs or revive Airtable.
$path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $path)) {throw 'runner_env_missing'}
function Read-Setting([string]$name) {
  $rows=@(Get-Content -LiteralPath $path | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})
  if ($rows.Count -gt 1) {throw "duplicate_runner_setting_$name"}
  if ($rows.Count -eq 0) {return ''}
  return ([string]$rows[0] -split '=',2)[1].Trim().Trim('"').Trim("'")
}
function Is-True([string]$name) {return ((Read-Setting $name) -match '^(true|1|yes)$')}
if (Is-True 'PIPELINE_RUNNER_RECOVERY_READ_ONLY') {throw 'outage_fence_still_on'}
if (-not (Is-True 'STUDIO_WORKLOAD_GOVERNOR_ENABLED')) {throw 'governor_not_enabled'}
if (Is-True 'I1_DURABLE_ENABLED') {throw 'i1_already_enabled_require_status_only'}
foreach ($key in @('RENDERING_REVIEW_AUTO_DISPATCH_ENABLED','NATIVE_GALLERY_AUTO_EXECUTE_ENABLED','STUDIO_SIDE_EFFECT_OUTBOX_ENABLED')) {
  if (Is-True $key) {throw "other_consumer_active_$key"}
}
if ((Read-Setting 'STUDIO_MAX_PRODUCER_JOBS') -ne '1') {throw 'producer_concurrency_not_one'}
$health=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $health.ok -or $health.recovery_read_only -or -not $health.workload_governor_enabled -or
    $health.i1_durable_jobs -or $health.studio_write_source -ne 'supabase' -or
    $health.studio_runner_output_read_source -ne 'supabase' -or -not $health.supabase_pipeline_writes -or
    $health.airtable_activity.any_activity) {throw 'runner_live_health_preflight_failed'}
$secret=Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
if (-not $secret) {throw 'runner_secret_missing'}
$workload=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
if (-not $workload.ok -or -not $workload.enabled -or $workload.database_circuit_open -or
    $workload.admission_paused -or [int]$workload.max_jobs -gt 1 -or
    [int]$workload.active_jobs -gt 1 -or [int]$workload.max_db_reads -gt 6 -or
    [int]$workload.max_db_writes -gt 3) {throw 'i1_governor_not_ready'}

$parent=Join-Path $env:ProgramData 'ChicagoShining\pipeline-runner'
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {throw 'i1_programdata_not_provisioned'}
$configured=Read-Setting 'I1_JOB_DB_PATH'
$dbpath=Join-Path $parent 'i1-jobs.sqlite3'
if ($configured -and
    [IO.Path]::GetFullPath($configured) -ne [IO.Path]::GetFullPath($dbpath)) {
  throw 'i1_existing_spool_path_requires_reconciliation'
}
$env:I1_ACTIVATION_DB_READONLY=$dbpath
# Standard-library Python only: fail closed on any queued/running/ambiguous
# preexisting spool; archived complete/failed jobs are never replayed.
$probe=@'
import os,sqlite3,sys
from pathlib import Path
p=Path(os.environ['I1_ACTIVATION_DB_READONLY'])
if not p.exists():
    print("i1_spool_existing_jobs=0")
    sys.exit(0)
try:
    conn=sqlite3.connect(p.as_uri()+"?mode=ro",uri=True,timeout=3)
    tables={r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'jobs' not in tables:
        print("i1_spool_schema_unverified")
        sys.exit(2)
    rows=dict(conn.execute("SELECT status,COUNT(*) FROM jobs GROUP BY status"))
    unsafe=sum(int(rows.get(s,0)) for s in ('queued','running','paused'))
    if unsafe:
        print("i1_spool_unresolved_jobs="+str(unsafe))
        sys.exit(3)
    print("i1_spool_queued_and_running=0")
    conn.close()
except Exception:
    print("i1_spool_inspection_failed")
    sys.exit(4)
'@
$probeScript=Join-Path $env:TEMP ('incident2670-i1-readonly-'+[guid]::NewGuid().ToString('N')+'.py')
try {
  [IO.File]::WriteAllText($probeScript,$probe,(New-Object System.Text.UTF8Encoding($false)))
  & python $probeScript
  if ($LASTEXITCODE -ne 0) {throw 'i1_existing_job_reconciliation_required'}
}
finally {
  Remove-Item -LiteralPath $probeScript -Force -ErrorAction SilentlyContinue
  Remove-Item Env:I1_ACTIVATION_DB_READONLY -ErrorAction SilentlyContinue
}
$sb=(Read-Setting 'SUPABASE_URL').TrimEnd('/')
$key=Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
if (-not $sb.StartsWith('https://') -or -not $key) {throw 'supabase_credentials_missing'}
$null=Invoke-RestMethod -Uri "$sb/rest/v1/idea_batches?select=id&limit=1" -Headers @{
  apikey=$key;Authorization="Bearer $key"
} -TimeoutSec 20

$backup="$path.incident2670-i1-preenable-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop
$lines=[System.Collections.Generic.List[string]]::new()
foreach ($line in @(Get-Content -LiteralPath $path)) {[void]$lines.Add([string]$line)}
foreach ($item in @(
  @{name='I1_DURABLE_ENABLED';value='true'},
  @{name='I1_JOB_DB_PATH';value=$dbpath}
)) {
  $hits=0
  for ($i=0;$i -lt $lines.Count;$i++) {
    if ($lines[$i] -match ('^\s*'+[regex]::Escape($item.name)+'\s*=')) {
      $lines[$i]=$item.name+'='+$item.value
      $hits++
    }
  }
  if ($hits -gt 1) {throw 'i1_duplicate_setting_do_not_write'}
  if ($hits -eq 0) {[void]$lines.Add($item.name+'='+$item.value)}
}
[IO.File]::WriteAllLines($path,[string[]]$lines.ToArray(),(New-Object System.Text.UTF8Encoding($false)))
if (-not (Is-True 'I1_DURABLE_ENABLED') -or (Read-Setting 'I1_JOB_DB_PATH') -ne $dbpath) {
  throw 'i1_env_update_not_verified'
}
Write-Output 'incident2670_i1_durable_env=STAGED_ENABLED'
Write-Output 'incident2670_i1_governor=STILL_ENABLED'
Write-Output 'incident2670_other_consumers=UNCHANGED_DISABLED'
