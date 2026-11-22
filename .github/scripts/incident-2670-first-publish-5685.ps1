$ErrorActionPreference = 'Stop'
# Exact production publication: output 5685 only. One provider upload, no retry.
$record='receunuIIdyIBwwPA'
$envfile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $envfile)) {throw 'runner_env_missing'}
function Env([string]$name) {
  $rows=@(Get-Content -LiteralPath $envfile | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})
  if ($rows.Count -ne 1) {throw "env_not_unique_$name"}
  return ([string]$rows[0] -split '=',2)[1].Trim().Trim('"').Trim("'")
}
$health=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $health.ok -or $health.recovery_read_only -or -not $health.workload_governor_enabled -or
    $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase' -or
    $health.studio_runner_content_read_source -ne 'supabase' -or -not $health.supabase_pipeline_writes -or
    $health.airtable_activity.any_activity) {throw 'runner_health_gate_failed'}
$secret=Env 'PIPELINE_RUNNER_SHARED_SECRET'
$dburl=(Env 'SUPABASE_URL').TrimEnd('/')
$dbkey=Env 'SUPABASE_SERVICE_ROLE_KEY'
if (-not $secret -or -not $dburl.StartsWith('https://') -or -not $dbkey) {throw 'missing_credentials'}
$workload=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
if (-not $workload.ok -or -not $workload.enabled -or $workload.admission_paused -or
    $workload.database_circuit_open -or [int]$workload.max_jobs -gt 1 -or [int]$workload.active_jobs -gt 1 -or
    [int]$workload.max_db_reads -gt 6 -or [int]$workload.max_db_writes -gt 3) {throw 'governor_preflight_failed'}
Write-Output 'canary_5685_governor=PASS'
$auth=@{apikey=$dbkey;Authorization="Bearer $dbkey"}
$uri="$dburl/rest/v1/platform_outputs?airtable_record_id=eq.$record&select=airtable_record_id,output_number,output_title,output_caption,platform,platform_output_type,review_status,output_status,publish_status,render_status,publish_method,auto_publish_enabled,do_not_publish,test_run_id,published_at,platform_post_url,publish_asset_url,scheduled_post_date,content_profile_id,updated_at,error_messages"
function Load-Exact {
  $rows=@(Invoke-RestMethod -Uri $uri -Headers $auth -TimeoutSec 25)
  if ($rows.Count -ne 1) {throw 'canary_5685_row_not_unique'}
  return $rows[0]
}
function Assert-Safe([object]$o) {
  if ($o.output_number -ne 5685 -or $o.airtable_record_id -ne $record -or
      $o.platform -ne 'Facebook' -or $o.platform_output_type -ne 'Facebook Reel' -or
      $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or
      $o.publish_status -notin @('Ready to Schedule','Ready to Publish') -or
      $o.render_status -ne 'Rendered' -or $o.publish_method -ne 'Automated' -or
      $o.auto_publish_enabled -ne $true -or $o.do_not_publish -ne $false -or
      $o.test_run_id -or $o.published_at -or $o.platform_post_url -or
      -not $o.output_caption -or -not $o.content_profile_id -or
      -not $o.publish_asset_url -or $o.publish_asset_url -notmatch '^https://media\.chicagoshining\.com/' -or
      [datetimeoffset]$o.scheduled_post_date -gt [datetimeoffset]::UtcNow -or
      $o.error_messages.FB_Slideshow_Status -ne 'Video Ready' -or
      $o.error_messages.Publish_Error_Stage -or
      $o.error_messages.Publish_Locked_At -or $o.error_messages.Publish_Locked_By -or
      $o.error_messages.Publish_Started_At -or
      $o.error_messages.Platform_Post_ID -or $o.error_messages.Platform_Media_ID -or
      $o.error_messages.FB_Slideshow_Meta_Video_ID -or
      $o.error_messages.Studio_Render_Review_Hold_Active -or
      $o.error_messages.Studio_Render_Review_Hold_ID -or
      $o.error_messages.Studio_Review_Hold_ID -or
      [int]$o.error_messages.Publish_Attempt_Count -ne 0 -or
      [int]$o.error_messages.Studio_Publish_Dispatch_Count -ne 0) {
    throw 'canary_5685_exact_publish_safety_gate_failed'
  }
}
$before=Load-Exact
Assert-Safe $before
$head=Invoke-WebRequest -Uri $before.publish_asset_url -Method Head -UseBasicParsing -TimeoutSec 35
if ([int]$head.StatusCode -ne 200 -or [string]$head.Headers['Content-Type'] -notmatch 'video/mp4') {throw 'canary_5685_public_mp4_not_verified'}
Write-Output 'canary_5685_hosted_mp4=PASS'
$stageHeaders=@{'X-Pipeline-Secret'=$secret}
function Run-Stage([string]$stage,[bool]$dry) {
  $body=@{output_record_id=$record;extra=@{dry_run=$dry}} | ConvertTo-Json -Depth 5 -Compress
  return Invoke-RestMethod -Uri "http://127.0.0.1:3350/stages/$stage" -Method Post -Headers $stageHeaders -Body $body -ContentType 'application/json' -TimeoutSec 240
}
$dry=Run-Stage 'fbs3' $true
if ($dry.status -ne 'ok' -or $dry.details.run.dry_run -ne $true -or $dry.details.run.eligibility_reason) {throw 'canary_5685_native_dry_run_denied'}
Write-Output 'canary_5685_native_dry_run=PASS'
$again=Load-Exact
Assert-Safe $again
if ($again.updated_at -ne $before.updated_at) {throw 'canary_5685_changed_during_preflight'}
$run=Run-Stage 'fbs3' $false
$video=[string]$run.details.run.video_id
if ($run.status -ne 'ok' -or -not $video) {
  Write-Output ("canary_5685_native_status="+[string]$run.status)
  Write-Output ("canary_5685_native_reason="+[string]$run.details.run.reason)
  throw 'canary_5685_native_upload_not_confirmed_no_retry'
}
Write-Output 'canary_5685_provider_upload_started=YES'
$receipt=$null
for($i=0;$i -lt 8;$i++) {
  Start-Sleep -Seconds 16
  $current=Load-Exact
  if ($current.output_status -eq 'Published' -and $current.publish_status -eq 'Published' -and
      $current.published_at -and $current.platform_post_url -and $current.error_messages.Platform_Post_ID) {
    $receipt=$current;break
  }
  if ($current.publish_status -eq 'Failed') {throw 'canary_5685_provider_terminal_failure_no_retry'}
  $poll=Run-Stage 'fbs4' $false
  if ($poll.status -eq 'error') {throw 'canary_5685_provider_poll_error_no_retry'}
  Write-Output ("canary_5685_poll_"+$i+"="+[string]$poll.status)
}
if (-not $receipt) {
  $current=Load-Exact
  if ($current.output_status -eq 'Published' -and $current.publish_status -eq 'Published' -and
      $current.published_at -and $current.platform_post_url -and $current.error_messages.Platform_Post_ID) {$receipt=$current}
}
if (-not $receipt) {
  Write-Output 'canary_5685_state=UPLOADED_RECEIPT_PENDING'
  throw 'canary_5685_public_provider_receipt_not_proven_do_not_reupload'
}
if ([string]$receipt.error_messages.Platform_Post_ID -ne $video) {throw 'canary_5685_provider_id_mismatch'}
if ([string]$receipt.platform_post_url -notmatch '^https://(www\.)?facebook\.com/reel/[A-Za-z0-9_/-]+/?$') {throw 'canary_5685_provider_url_not_expected'}
Write-Output 'canary_5685_published_at_recorded=PASS'
Write-Output 'canary_5685_platform_post_id_verified=PASS'
Write-Output 'canary_5685_platform_post_url_verified=PASS'
Write-Output 'canary_5685_studio_published_state=PASS'
Write-Output 'canary_5685_end_to_end=PASS'
