$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$envPath=Join-Path (Get-Location).Path 'Services\pipeline-runner\service\.env'
if(!(Test-Path -LiteralPath $envPath)){$envPath=$null}
function Setting($n){$v=[Environment]::GetEnvironmentVariable($n,'Process');if($v){return $v};$a=@(Get-Content -LiteralPath $envPath|Where-Object {$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')});if($a.Count -ne 1){throw 'setting_missing'};return ($a[0] -split '=',2)[1].Trim().Trim('"').Trim("'")}
$sb=(Setting 'SUPABASE_URL').TrimEnd('/');if($sb -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'wrong_project'}
$key=Setting 'SUPABASE_SERVICE_ROLE_KEY';$hdr=@{apikey=$key;Authorization=('Bearer '+$key)}
$rh=@{'X-Pipeline-Secret'=(Setting 'PIPELINE_RUNNER_SHARED_SECRET')}
function Rows($q){return @(Invoke-RestMethod -Uri ($sb+'/rest/v1/'+$q) -Headers $hdr -TimeoutSec 25)}
function Held($o){if($o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_status -ne 'Not Ready' -or $o.scheduled_post_date -or $o.published_at -or $o.platform_post_url -or $o.review_status -eq 'Approved'){throw ('hold_changed_'+$o.output_number)}}
$n='__REEL__'
$rid=if($n -eq 11153){'rec94S2G7FU5HdExh'}else{'recpWHfw74GxcybAA'}
$old=if($n -eq 11153){'job-20261122225847-a3db3877'}else{'job-20261122230140-adb85211'}
$vo='https://drive.google.com/uc?id=1g4BgbdA_PFbQbiVqREgTOpJxnRRhc-p7&export=download'
function Check(){
  $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
  if(!$h.ok -or $h.recovery_read_only -or !$h.workload_governor_enabled -or $h.studio_write_source -ne 'supabase' -or $h.airtable_activity.any_activity){throw 'runner_health_changed'}
  $a=@(Rows 'platform_outputs?content_number=eq.2303&select=output_number,do_not_publish,auto_publish_enabled,publish_status,published_at,scheduled_post_date,platform_post_url,review_status,remotion_job_id,studio_effective_voiceover_mode,render_status,output_status,studio_preview_url,final_file_url,render_heal_fields,remotion_props&order=output_number.asc')
  if($a.Count -ne 4 -or (($a|ForEach-Object {$_.output_number}) -join ',') -ne '11153,11154,11155,11156'){throw 'output_count_changed'}
  foreach($o in $a){Held $o}
  if($a[2].remotion_job_id -ne 'job-20261122230435-2a069565' -or $a[3].remotion_job_id -ne 'job-20261122230719-ea72f9ed'){throw 'story_changed'}
  $o=@($a|Where-Object {[int]$_.output_number -eq $n})[0]
  if(!$o.remotion_job_id -or $o.remotion_job_id -eq $old -or $o.studio_effective_voiceover_mode -ne 'Yes' -or [string]$o.remotion_props.voiceover.url -ne $vo){throw 'new_voiceover_job_not_proven'}
  if($o.render_heal_fields.SM_Bethesda_2303_Narration_Fix.original_remotion_job_id -ne $old){throw 'old_media_backup_missing'}
  if($o.render_status -in @('Failed','Blocked')){throw 'render_failed'}
  if($o.render_status -eq 'Rendered' -and $o.output_status -eq 'Ready for Review' -and $o.final_file_url -and $o.studio_preview_url -and $o.studio_preview_url -ne $o.render_heal_fields.SM_Bethesda_2303_Narration_Fix.original_studio_preview_url){return $true}
  return $false
}
if(Check){Write-Output 'bethesda_poll=COMPLETE';exit 0}
for($i=0;$i -lt 3;$i++){
  $body=@{output_record_id=$rid;extra=@{max_runs=1}}|ConvertTo-Json -Compress
  $res=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3350/stages/r5' -Headers $rh -Body $body -ContentType 'application/json' -TimeoutSec 24
  if($res.status -eq 'error'){throw 'r5_stage_error'}
  Start-Sleep -Seconds 7
  if(Check){Write-Output 'bethesda_poll=COMPLETE';exit 0}
}
Write-Output 'bethesda_poll=PENDING'
