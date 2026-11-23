# #2670: template. GitHub replaces only __DESIRED__ with true/false.
# Never expose env, URLs, keys, job IDs or remote shell logs to Actions.
$ErrorActionPreference='Stop'
$desired='__DESIRED__'
if($desired -notin @('true','false')){throw 'review_flag_desired_invalid'}
$path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $path)){throw 'review_runner_env_missing'}
$lines=@(Get-Content -LiteralPath $path)
function Value-For([string]$name) {
  $needle='^\s*'+[regex]::Escape($name)+'\s*='
  $found=@($lines | Where-Object {$_ -match $needle})
  if($found.Count -gt 1){throw 'review_runner_env_ambiguous'}
  if($found.Count -eq 0){return ''}
  return ([string](($found[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39)
}
function Enabled-For([string]$name) {
  $v=Value-For $name
  return ($v.ToLowerInvariant() -in @('1','true','yes'))
}
if($desired -eq 'true') {
  if(-not (Enabled-For 'RENDERING_REVIEW_EXACT_RENDER_ENABLED')){throw 'review_exact_render_not_proven'}
  if(Enabled-For 'RENDERING_REVIEW_AUTO_DISPATCH_ENABLED'){throw 'review_auto_already_enabled'}
  if(Enabled-For 'STUDIO_SIDE_EFFECT_OUTBOX_ENABLED'){throw 'review_optional_outbox_must_stay_off'}
  if(Enabled-For 'STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED'){throw 'review_unapproved_global_coordinator_change'}
  if(Enabled-For 'NATIVE_GALLERY_AUTO_EXECUTE_ENABLED'){throw 'review_native_gallery_must_stay_off'}
  $secret=Value-For 'PIPELINE_RUNNER_SHARED_SECRET'
  if($secret.Length -lt 24){throw 'review_runner_auth_unavailable'}
  $headers=@{'X-Pipeline-Secret'=$secret}
  $root='http://127.0.0.1:3350'
  $gov=Invoke-RestMethod -Uri "$root/admin/workload" -Headers $headers -TimeoutSec 15
  $review=Invoke-RestMethod -Uri "$root/jobs/rendering-review/dispatch-health" -Headers $headers -TimeoutSec 15
  $gallery=Invoke-RestMethod -Uri "$root/jobs/native-gallery/dispatch-health" -Headers $headers -TimeoutSec 15
  if($gov.ok -ne $true -or $gov.enabled -ne $true -or
     [int]$gov.max_jobs -ne 1 -or [int]$gov.active_jobs -ne 0 -or
     [int]$gov.queued_jobs -ne 0 -or [int]$gov.paused_jobs -ne 0 -or
     $gov.database_circuit_open -eq $true -or $review.ok -ne $true -or
     $review.enabled -eq $true -or $review.started -eq $true -or
     $gallery.enabled -eq $true){throw 'review_preflight_runtime_not_idle'}
  # Verify the canonical held-review queue is empty with a service-role GET.
  # No ledger row is invented or touched, no retired Airtable lookup.
  $url=Value-For 'SUPABASE_URL'
  $key=Value-For 'SUPABASE_SERVICE_ROLE_KEY'
  if($url -notmatch '^https://[a-z0-9.-]+\.supabase\.co/?$' -or
     $key.Length -lt 32){throw 'review_supabase_authority_missing'}
  $auth=@{'apikey'=$key;'Authorization'="Bearer $key"}
  foreach($table in @('rendering_review_jobs','rendering_review_attempts')) {
    $result=Invoke-WebRequest -Uri ($url.TrimEnd('/')+"/rest/v1/$table?select=airtable_record_id&limit=1") -UseBasicParsing -Headers $auth -TimeoutSec 15
    if($result.StatusCode -ne 200 -or $result.Content.Trim() -ne '[]') {
      throw 'review_ledger_not_empty_or_unverified'
    }
  }
}
$target='RENDERING_REVIEW_AUTO_DISPATCH_ENABLED'
$next=@()
$seen=0
foreach($line in $lines) {
  if($line -match ('^\s*'+[regex]::Escape($target)+'\s*=')) {
    if($seen -eq 0){$next+=($target+'='+$desired)}
    $seen++
  } else {
    $next+=$line
  }
}
if($seen -gt 1){throw 'review_existing_flag_ambiguous'}
if($seen -eq 0){$next+=($target+'='+$desired)}
[System.IO.File]::WriteAllLines($path,$next,[System.Text.UTF8Encoding]::new($false))
$confirm=@(Get-Content -LiteralPath $path | Where-Object {$_ -eq ($target+'='+$desired)})
if($confirm.Count -ne 1){throw 'review_flag_readback_unverified'}
Write-Output ('incident2670_review_flag='+$desired)
