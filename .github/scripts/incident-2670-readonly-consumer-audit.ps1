$ErrorActionPreference='Stop'
$phase='read_env'
trap { Write-Output ('incident2670_failure_phase='+$phase); exit 1 }
$envFile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $envFile)) {throw 'runner_env_missing'}
$lines=@(Get-Content -LiteralPath $envFile)
$keys=@($lines | Where-Object {$_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*='})
if ($keys.Count -ne 1) {throw 'runner_secret_unavailable'}
$secret=([string]($keys[0] -split '=',2)[1]).Trim().Trim('"').Trim([char]39)
if ($secret.Length -lt 24) {throw 'runner_secret_invalid'}
$header=@{'X-Pipeline-Secret'=$secret}
$root='http://127.0.0.1:3350'
$phase='governor_get'
$g=Invoke-RestMethod -Uri "$root/admin/workload" -Headers $header -TimeoutSec 15
$phase='review_get'
$r=Invoke-RestMethod -Uri "$root/jobs/rendering-review/dispatch-health" -Headers $header -TimeoutSec 15
$phase='gallery_get'
$n=Invoke-RestMethod -Uri "$root/jobs/native-gallery/dispatch-health" -Headers $header -TimeoutSec 15
$phase='readback_validation'
if ($g.ok -ne $true -or $g.enabled -ne $true -or $r.ok -ne $true -or $n.ok -ne $true) {throw 'consumer_or_governor_readback_invalid'}
$phase='outbox_validation'
$outbox=@($lines | Where-Object {$_ -match '^\s*STUDIO_SIDE_EFFECT_OUTBOX_ENABLED\s*='})
if ($outbox.Count -gt 1) {throw 'outbox_config_ambiguous'}
$outboxOn=$false
if ($outbox.Count -eq 1) {
  $setting=([string](($outbox[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39).ToLowerInvariant()
  $outboxOn=($setting -in @('true','yes','1'))
}
if ($outboxOn) {throw 'optional_outbox_must_remain_disabled'}
$phase='consumer_feature_preflight'
function Read-BooleanSetting([string]$name) {
  $needle='^\s*'+[regex]::Escape($name)+'\s*='
  $matchesFound=@($lines | Where-Object {$_ -match $needle})
  if ($matchesFound.Count -gt 1) {throw 'consumer_flag_ambiguous'}
  if ($matchesFound.Count -eq 0) {return $false}
  $value=([string](($matchesFound[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39).ToLowerInvariant()
  return ($value -in @('true','yes','1'))
}
function Has-NonemptySetting([string]$name) {
  $needle='^\s*'+[regex]::Escape($name)+'\s*='
  $found=@($lines | Where-Object {$_ -match $needle})
  if ($found.Count -gt 1) {throw 'consumer_flag_ambiguous'}
  if ($found.Count -eq 0) {return $false}
  return (([string](($found[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39).Length -gt 0)
}
$reviewAutoFlag=Read-BooleanSetting 'RENDERING_REVIEW_AUTO_DISPATCH_ENABLED'
$reviewExactFlag=Read-BooleanSetting 'RENDERING_REVIEW_EXACT_RENDER_ENABLED'
$galleryAutoFlag=Read-BooleanSetting 'NATIVE_GALLERY_AUTO_EXECUTE_ENABLED'
$galleryExecuteFlag=Read-BooleanSetting 'NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED'
$galleryClaimFlag=Read-BooleanSetting 'NATIVE_GALLERY_RUNNER_CLAIM_ENABLED'
$galleryLaunchFlag=Read-BooleanSetting 'NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED'
$nativeCredentialsPresent=(
  (Has-NonemptySetting 'NATIVE_GALLERY_WORKER_BASE_URL') -and
  (Has-NonemptySetting 'NATIVE_GALLERY_JOB_SHARED_SECRET') -and
  (Has-NonemptySetting 'NATIVE_GALLERY_RUNNER_CONSUMER_ID')
)
$globalCoordinatorFlag=Read-BooleanSetting 'STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED'
$phase='summary_serialization'
$summary=[ordered]@{
  enabled=[bool]$g.enabled; scope=[string]$g.scope
  max_jobs=[int]$g.max_jobs; active_jobs=[int]$g.active_jobs
  queued_jobs=[int]$g.queued_jobs; paused_jobs=[int]$g.paused_jobs
  database_circuit_open=[bool]$g.database_circuit_open
  max_db_reads=[int]$g.max_db_reads; max_db_writes=[int]$g.max_db_writes
  supabase_request_metrics=$g.supabase_request_metrics
  review_enabled=[bool]$r.enabled; review_started=[bool]$r.started
  review_last_result=[string]$r.last_result
  review_auto_flag=[bool]$reviewAutoFlag; review_exact_flag=[bool]$reviewExactFlag
  gallery_enabled=[bool]$n.enabled; gallery_started=[bool]$n.started
  gallery_blocked=[bool]$n.blocked
  gallery_auto_flag=[bool]$galleryAutoFlag; gallery_execute_flag=[bool]$galleryExecuteFlag
  gallery_claim_flag=[bool]$galleryClaimFlag; gallery_launch_flag=[bool]$galleryLaunchFlag
  gallery_credentials_configured=[bool]$nativeCredentialsPresent
  global_coordinator_enabled_on_runner=[bool]$globalCoordinatorFlag
  optional_outbox_enabled=$false
}
Write-Output ('incident2670_audit='+($summary|ConvertTo-Json -Compress -Depth 6))
