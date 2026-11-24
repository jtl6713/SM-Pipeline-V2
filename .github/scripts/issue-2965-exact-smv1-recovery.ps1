$ErrorActionPreference='Stop'
$phase='preflight'
trap { Write-Output ('smv1_2965_failure_phase='+$phase); exit 1 }
$root='http://127.0.0.1:3350'
$h=Invoke-RestMethod -Uri "$root/health" -TimeoutSec 15
if ($h.ok -ne $true -or $h.studio_write_source -ne 'supabase' -or $h.supabase_pipeline_writes -ne $true -or $h.workload_governor_enabled -ne $true -or $h.recovery_read_only -ne $false -or $h.airtable_activity.any_activity -ne $false) {throw 'authority_or_governor_gate_failed'}
$envFile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
$keys=@(Get-Content -LiteralPath $envFile | Where-Object {$_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*='})
if($keys.Count -ne 1){throw 'runner_auth_unavailable'}
$secret=([string]($keys[0] -split '=',2)[1]).Trim().Trim('"').Trim([char]39)
if($secret.Length -lt 24){throw 'runner_auth_invalid'}
$header=@{'X-Pipeline-Secret'=$secret}
function Report-Governor($g,[string]$label){
  $summary=[ordered]@{enabled=$g.enabled;admission_paused=$g.admission_paused;database_circuit_open=$g.database_circuit_open;active_jobs=$g.active_jobs;queued_jobs=$g.queued_jobs;active_resource_slots=$g.active_resource_slots;max_photo_groups=$g.max_photo_groups;max_db_reads=$g.max_db_reads;max_db_writes=$g.max_db_writes}
  Write-Output ("smv1_2965_"+$label+"="+($summary|ConvertTo-Json -Compress -Depth 5))
}
$phase='governor_snapshot'
$g=Invoke-RestMethod -Uri "$root/admin/workload" -Headers $header -TimeoutSec 15
Report-Governor $g 'before'
if($g.ok -ne $true -or $g.enabled -ne $true -or $g.admission_paused -ne $false -or $g.database_circuit_open -ne $false){throw 'admission_unavailable'}
if($null -eq $g.active_resource_slots.smv1_drain){throw 'drain_lease_state_unknown'}
if([int]$g.active_resource_slots.smv1_drain -gt 0){Write-Output 'smv1_2965_existing_drain_active=1';exit 1}
# One exact existing request; no other routes, retries, lease removal or configuration changes.
$phase='exact_pinned_drain'
$body=@{production_request_record_id='recZswSwDPUSNoW9N';extra=@{max_runs=1;photo_workers=1}}|ConvertTo-Json -Compress -Depth 4
$result=Invoke-RestMethod -Uri "$root/stages/smv1/drain" -Method POST -ContentType 'application/json' -Headers $header -Body $body -TimeoutSec 180
$state=[string]$result.status
if($state -notin @('ok','skipped','deferred','error')){throw 'unknown_stage_state'}
Write-Output ('smv1_2965_stage='+$state+';processed='+[int]$result.details.processed_count)
$phase='governor_after'
$after=Invoke-RestMethod -Uri "$root/admin/workload" -Headers $header -TimeoutSec 15
Report-Governor $after 'after'
if($after.ok -ne $true -or $after.enabled -ne $true -or $state -ne 'ok' -or [int]$result.details.processed_count -lt 1){throw 'no_confirmed_crop_progress'}
Write-Output 'smv1_2965_exact_drain_progress=PASS'
