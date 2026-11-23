$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(!(Test-Path -LiteralPath $envPath)){throw 'env_missing'}
function Setting($n){$a=@(Get-Content -LiteralPath $envPath|Where-Object {$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')});if($a.Count -ne 1){throw 'setting_missing'};return ($a[0] -split '=',2)[1].Trim().Trim('"').Trim("'")}
$sb=(Setting 'SUPABASE_URL').TrimEnd('/')
if($sb -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'wrong_supabase_project'}
$key=Setting 'SUPABASE_SERVICE_ROLE_KEY'
$dbHeaders=@{apikey=$key;Authorization=('Bearer '+$key)}
$writeHeaders=@{apikey=$key;Authorization=('Bearer '+$key);Prefer='return=representation'}
$runnerHeaders=@{'X-Pipeline-Secret'=(Setting 'PIPELINE_RUNNER_SHARED_SECRET')}
function Rows([string]$path){return @(Invoke-RestMethod -Method Get -Uri ($sb+'/rest/v1/'+$path) -Headers $dbHeaders -TimeoutSec 30)}
function One([string]$path){
  $r=@(Rows $path)
  if($r.Count -ne 1){throw ('unique_row_expected_got_'+$r.Count)}
  return $r[0]
}
function Health(){$h=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 25;if(!$h.ok -or $h.recovery_read_only -or $h.recovery_producer_only_enabled -or $h.recovery_producer_scope -ne 'disabled' -or !$h.workload_governor_enabled -or !$h.i1_durable_jobs -or $h.airtable_activity.any_activity -or $h.studio_write_source -ne 'supabase'){throw 'normal_production_fence_changed'}}
function Idle(){$g=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers $runnerHeaders -TimeoutSec 25;if(!$g.enabled -or $g.admission_paused -or $g.database_circuit_open -or [int]$g.max_jobs -ne 1 -or [int]$g.active_jobs -ne 0 -or [int]$g.queued_jobs -ne 0){throw 'governor_not_idle'};$m=Invoke-RestMethod -Uri 'http://127.0.0.1:3333/health' -TimeoutSec 20;if(!$m.ok -or [int]$m.remotionActiveRenders -ne 0){throw 'remotion_busy'}}
function Protected($o){
  if($o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_status -ne 'Not Ready' -or $o.published_at -or $o.scheduled_post_date -or $o.platform_post_url -or $o.review_status -eq 'Approved'){throw ('publishing_hold_changed_'+$o.output_number)}
}
function Output([string]$rid){return One ("platform_outputs?airtable_record_id=eq.$rid&select=*&limit=2")}
function Stage($w,$id){$b=@{output_record_id=$id;extra=@{max_runs=1}}|ConvertTo-Json -Compress;return Invoke-RestMethod -Method Post -Uri ('http://127.0.0.1:3350/stages/'+$w) -Headers $runnerHeaders -ContentType 'application/json' -Body $b -TimeoutSec 180}
$reels=@(
  @{n=11153;rid='rec94S2G7FU5HdExh';pro='rec0GzSxP5pnl31Hc';job='job-20261122225847-a3db3877';kind='Instagram Reel'},
  @{n=11154;rid='recpWHfw74GxcybAA';pro='recW65aRX35rIMBTV';job='job-20261122230140-adb85211';kind='Facebook Reel'}
)
$stories=@(
  @{n=11155;rid='recmGB0XBhidcuMq8';pro='recCWDgsOvMuPxI12';job='job-20261122230435-2a069565'},
  @{n=11156;rid='recAbETkPs5NX5eH2';pro='recEkDe7BES0FsYtU';job='job-20261122230719-ea72f9ed'}
)
$parent=One 'content_items?airtable_record_id=eq.rectA2pBh8C7GDNql&select=extras&limit=2'
$vo=[string]$parent.extras.Voiceover_URL;$duration=[double]$parent.extras.Voiceover_Duration_Seconds
if($parent.extras.Include_Voiceover -ne 'Yes' -or $duration -lt 4 -or $vo -notlike 'https://drive.google.com/uc?id=1g4BgbdA_PFbQbiVqREgTOpJxnRRhc-p7*'){throw 'saved_narration_changed'}
$all=@(Rows 'platform_outputs?content_number=eq.2303&select=output_number,remotion_job_id,do_not_publish,auto_publish_enabled,publish_status,published_at,scheduled_post_date,platform_post_url,review_status&order=output_number.asc')
if($all.Count -ne 4 -or (($all|ForEach-Object {$_.output_number}) -join ',') -ne '11153,11154,11155,11156'){throw 'four_output_guard_failed'}
foreach($a in $all){Protected $a;if($a.output_number -ge 11155 -and $a.remotion_job_id -ne (@($stories|Where-Object {$_.n -eq $a.output_number})[0].job)){throw 'story_render_changed'}}
foreach($spec in @($reels|Where-Object {[int]$_.n -eq __REEL__})){

  Health;Idle
  $o=Output $spec.rid;Protected $o
  $ln=One ("production_request_outputs?airtable_record_id=eq.$($spec.pro)&select=platform_output_id,effective_resolution&limit=2")
  if($ln.platform_output_id -ne $o.id -or $ln.effective_resolution.Voiceover_Mode_Override -eq 'No'){throw 'reel_pro_no_longer_authorized'}
  if($o.studio_effective_voiceover_mode -eq 'Yes'){
    if($o.render_status -eq 'Rendered' -and $o.remotion_job_id -ne $spec.job -and $o.final_file_url -and $o.studio_preview_url -and [string]$o.remotion_props.voiceover.url -eq $vo){
      Write-Output ('bethesda_reel_'+$spec.n+'=ALREADY_NARRATED_NO_DUPLICATE');continue
    }
    throw ('existing_partial_repair_no_duplicate_'+$spec.n)
  }
  if($o.render_status -ne 'Rendered' -or $o.output_status -ne 'Ready for Review' -or $o.remotion_job_id -ne $spec.job -or $o.studio_effective_voiceover_mode -ne 'No' -or $o.platform_output_type -ne $spec.kind -or !$o.studio_preview_url -or !$o.final_file_url){throw ('original_reel_changed_'+$spec.n)}
  if($o.render_heal_fields.SM_Bethesda_2303_Narration_Fix){throw 'prior_repair_claim_do_not_repeat'}
  $bag=@{};foreach($p in $o.error_messages.PSObject.Properties){$bag[$p.Name]=$p.Value}
  $directive=([string]$bag['Studio_Output_Directives_JSON'])|ConvertFrom-Json
  if($directive.production_request_record_id -ne 'recR4EQcshFZ4fNL0' -or $directive.production_request_output_record_id -ne $spec.pro -or $directive.voiceover_mode -ne 'No'){throw 'original_reel_directive_changed'}
  $directive.voiceover_mode='Yes';$directive.voiceover_duration_seconds=$duration
  $bag['Studio_Output_Directives_JSON']=$directive|ConvertTo-Json -Compress -Depth 60
  $bag['Voiceover_URL']=$vo;$bag['Voiceover_Duration_Seconds']=$duration;$bag['Studio_Effective_Voiceover_Duration_Seconds']=$duration
  foreach($k in @('Final_File_ID','Output_URL','Studio_Preview_R2_Key','Render_Server_URL','Remotion_Status_URL')){[void]$bag.Remove($k)}
  $heal=@{};if($o.render_heal_fields){foreach($p in $o.render_heal_fields.PSObject.Properties){$heal[$p.Name]=$p.Value}}
  $heal['Studio_Effective_Voiceover_Mode']='Yes'
  $heal['SM_Bethesda_2303_Narration_Fix']=@{
    original_remotion_job_id=$o.remotion_job_id;original_final_file_url=$o.final_file_url
    original_studio_preview_url=$o.studio_preview_url;original_final_file_id=$o.error_messages.Final_File_ID
    original_voiceover_mode='No';voiceover_url=$vo;requested_at_utc=[DateTime]::UtcNow.ToString('o')
    no_publish_hold_preserved=$true
  }
  $body=@{studio_effective_voiceover_mode='Yes';render_status='Ready for Render';output_status='In Production';remotion_job_id=$null;final_file_url=$null;studio_preview_url=$null;remotion_props=$null;final_file_storage_status=$null;render_heal_fields=$heal;error_messages=$bag}|ConvertTo-Json -Depth 90 -Compress
  $condition="platform_outputs?id=eq.$($o.id)&output_number=eq.$($spec.n)&render_status=eq.Rendered&remotion_job_id=eq.$($spec.job)&do_not_publish=eq.true&auto_publish_enabled=eq.false"
  $saved=@(Invoke-RestMethod -Method Patch -Uri ($sb+'/rest/v1/'+$condition) -Headers $writeHeaders -ContentType 'application/json' -Body $body -TimeoutSec 35)
  if($saved.Count -ne 1 -or $saved[0].render_status -ne 'Ready for Render' -or $saved[0].studio_effective_voiceover_mode -ne 'Yes'){throw ('narration_preparation_not_atomic_'+$spec.n)}
  Write-Output ('bethesda_reel_'+$spec.n+'=OLD_MEDIA_BACKED_UP_AND_NARRATION_PREPARED')
  $launch=Stage 'r4' $spec.rid
  if($launch.status -ne 'ok' -or $launch.details.run.processed -ne $true){throw ('r4_not_started_'+$spec.n)}
  $new=Output $spec.rid
  if(!$new.remotion_job_id -or $new.remotion_job_id -eq $spec.job -or [string]$new.remotion_props.voiceover.url -ne $vo){throw ('r4_no_voiceover_in_render_props_'+$spec.n)}
  Write-Output ('bethesda_reel_'+$spec.n+'=NEW_R4_JOB_WITH_NARRATION')
}
Write-Output 'bethesda_prepare=R4_STARTED_OR_ALREADY_COMPLETE'
