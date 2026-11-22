$ErrorActionPreference='Stop'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $envPath)) {throw 'runner_env_missing'}
function Read-Setting([string]$name) {
  $line=Get-Content -LiteralPath $envPath | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1
  if (-not $line) {throw "required_setting_missing_$name"}
  return ([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
}
$rid='recR4EQcshFZ4fNL0'
$cid='rectA2pBh8C7GDNql'
$oldLease='tts-lease:1795384678001:4670148e4a62:d8475e56484d5152'
if ((Read-Setting 'PIPELINE_RUNNER_RECOVERY_READ_ONLY') -notmatch '^(1|true|yes)$') {throw 'recovery_publisher_fence_not_enabled'}
if ((Read-Setting 'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY') -notmatch '^(1|true|yes)$') {throw 'producer_recovery_not_enabled'}
if ((Read-Setting 'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET') -ne 'ALL') {throw 'producer_scope_changed'}
$health=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $health.ok -or -not $health.recovery_read_only -or -not $health.recovery_producer_only_enabled -or $health.recovery_producer_scope -ne 'all_governed_requests' -or -not $health.workload_governor_enabled -or $health.i1_durable_jobs -or $health.airtable_activity.any_activity -or $health.studio_write_source -ne 'supabase') {throw 'live_health_fence_failed'}
$secret=Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$headers=@{'X-Pipeline-Secret'=$secret}
$load=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers $headers -TimeoutSec 20
if (-not $load.enabled -or $load.admission_paused -or $load.database_circuit_open -or [int]$load.max_jobs -ne 1) {throw 'governor_not_safely_enabled'}
if ([int]$load.active_jobs -ne 0 -or [int]$load.queued_jobs -ne 0) {throw ('governor_busy_active_'+$load.active_jobs+'_queued_'+$load.queued_jobs)}
$sb=(Read-Setting 'SUPABASE_URL').TrimEnd('/')
$key=Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$sbHeaders=@{apikey=$key;Authorization="Bearer $key"}
$rows=@(Invoke-RestMethod -Uri "$sb/rest/v1/production_requests?airtable_record_id=eq.$rid&select=id,airtable_record_id,request_status,production_job&limit=2" -Headers $sbHeaders -TimeoutSec 20)
if ($rows.Count -ne 1) {throw 'production_request_not_unique'}
$pr=$rows[0]
if ($pr.request_status -ne 'Promoted' -or $pr.production_job.step -ne 'audio' -or $pr.production_job.job_id -ne 'spj-81f1d5f76782' -or $pr.production_job.error) {throw 'producer_not_exact_audio_wait'}
if ([string]$pr.production_job.detail -ne 'Waiting for existing voiceover lease') {throw 'producer_audio_detail_changed'}
$contents=@(Invoke-RestMethod -Uri "$sb/rest/v1/content_items?airtable_record_id=eq.$cid&select=airtable_record_id,content_number,production_request_id,extras&limit=2" -Headers $sbHeaders -TimeoutSec 20)
if ($contents.Count -ne 1) {throw 'content_not_unique'}
$content=$contents[0]
if ([int]$content.content_number -ne 2303 -or $content.production_request_id -ne $pr.id) {throw 'content_parent_mismatch'}
if ($content.extras.Voiceover_URL -or $content.extras.Voiceover_Google_Drive_File_ID) {
  Write-Output 'bethesda_p2=ALREADY_HAS_VOICEOVER_NO_RESUME'
  exit 0
}
if ([string]$content.extras.Voiceover_Normalization_Details -ne $oldLease) {throw 'tts_lease_changed_fresh_or_other_owner'}
$parts=[regex]::Match($oldLease,'^tts-lease:(\d{13}):[^:]+:[a-f0-9]+$')
if (-not $parts.Success) {throw 'invalid_lease_shape'}
$ends=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$parts.Groups[1].Value).AddMinutes(20)
if ([DateTimeOffset]::UtcNow -le $ends.AddMinutes(2)) {throw 'tts_lease_not_safely_expired'}
$outs=@(Invoke-RestMethod -Uri "$sb/rest/v1/platform_outputs?content_number=eq.2303&select=output_number,do_not_publish,auto_publish_enabled,publish_status,scheduled_post_date,published_at,remotion_job_id,platform_post_url&order=output_number.asc" -Headers $sbHeaders -TimeoutSec 20)
if ($outs.Count -ne 4 -or (($outs | ForEach-Object {$_.output_number}) -join ',') -ne '11153,11154,11155,11156') {throw 'four_outputs_identity_mismatch'}
foreach($out in $outs) {
  if ($out.do_not_publish -ne $true -or $out.auto_publish_enabled -ne $false -or $out.publish_status -ne 'Not Ready' -or $out.scheduled_post_date -or $out.published_at -or $out.platform_post_url -or $out.remotion_job_id) {throw ('output_guard_changed_'+$out.output_number)}
}
$links=@(Invoke-RestMethod -Uri "$sb/rest/v1/production_request_outputs?production_request_id=eq.$($pr.id)&select=platform_output_id" -Headers $sbHeaders -TimeoutSec 20)
if ($links.Count -ne 6 -or @($links | Where-Object {$_.platform_output_id}).Count -ne 4) {throw 'pro_output_association_changed'}
Write-Output 'bethesda_exact_postlease_preflight=PASS'
$body=@{production_request_record_id=$rid;resume=$true} | ConvertTo-Json -Compress
$answer=Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:3350/jobs/studio-produce/resume' -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
if (-not $answer.ok -or -not $answer.accepted -or $answer.production_request_record_id -ne $rid) {throw 'exact_producer_resume_not_accepted'}
if ($answer.already_running) {Write-Output 'bethesda_one_time_resume=IDEMPOTENT_ALREADY_ADMITTED'} else {Write-Output 'bethesda_one_time_resume=ACCEPTED'}
Start-Sleep -Seconds 12
$after=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers $headers -TimeoutSec 20
$health2=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if ($after.database_circuit_open -or [int]$after.active_jobs -gt 1 -or -not $health2.recovery_read_only -or -not $health2.recovery_producer_only_enabled -or $health2.airtable_activity.any_activity) {throw 'post_resume_global_safety_failed'}
Write-Output ('bethesda_post_resume_governor=active:{0};queued:{1};paused:{2}' -f $after.active_jobs,$after.queued_jobs,$after.paused_jobs)
Write-Output 'bethesda_publisher_fence=STILL_ON'
