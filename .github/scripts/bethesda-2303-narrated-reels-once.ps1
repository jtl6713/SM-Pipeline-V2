$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(!(Test-Path -LiteralPath $envPath)){throw 'env_missing'}
function Setting([string]$n){
  $rows=@(Get-Content -LiteralPath $envPath | Where-Object {$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')})
  if($rows.Count -ne 1){throw ('setting_missing_'+$n)}
  return ($rows[0] -split '=',2)[1].Trim().Trim('"').Trim("'")
}
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
function Health(){
  $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 25
  # Public read-only proof #45097420535: normal production intentionally restored:
  # recovery_read_only=false, producer_only=false, i1_durable_jobs=true.
  # NEVER reactivate recovery flags or waive exact output DNP/MAE protections.
  if(!$h.ok -or $h.recovery_read_only -or $h.recovery_producer_only_enabled -or $h.recovery_producer_scope -ne 'disabled' -or !$h.workload_governor_enabled -or !$h.i1_durable_jobs -or $h.airtable_activity.any_activity -or $h.studio_write_source -ne 'supabase'){throw 'normal_production_fence_changed_no_mutation'}
}
function Idle(){
  $g=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers $runnerHeaders -TimeoutSec 25
  if(!$g.enabled -or $g.admission_paused -or $g.database_circuit_open -or [int]$g.max_jobs -ne 1 -or [int]$g.active_jobs -ne 0 -or [int]$g.queued_jobs -ne 0){throw 'governor_not_idle'}
  $m=Invoke-RestMethod -Uri 'http://127.0.0.1:3333/health' -TimeoutSec 20
  if(!$m.ok -or [int]$m.remotionActiveRenders -ne 0){throw 'remotion_busy'}
}
function Protected($o){
  if($o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_status -ne 'Not Ready' -or $o.published_at -or $o.scheduled_post_date -or $o.platform_post_url -or $o.review_status -eq 'Approved'){throw ('publishing_hold_changed_'+$o.output_number)}
}
function Output([string]$rid){return One ("platform_outputs?airtable_record_id=eq.$rid&select=*&limit=2")}
function Stage([string]$which,[string]$id){
  $body=@{output_record_id=$id;extra=@{max_runs=1}}|ConvertTo-Json -Compress -Depth 8
  return Invoke-RestMethod -Method Post -Uri ('http://127.0.0.1:3350/stages/'+$which) -Headers $runnerHeaders -ContentType 'application/json' -Body $body -TimeoutSec 180
}
$reels=@(
  @{n=11153;rid='rec94S2G7FU5HdExh';pro='rec0GzSxP5pnl31Hc';job='job-20261122225847-a3db3877';kind='Instagram Reel'},
  @{n=11154;rid='recpWHfw74GxcybAA';pro='recW65aRX35rIMBTV';job='job-20261122230140-adb85211';kind='Facebook Reel'}
)
$stories=@(
  @{n=11155;rid='recmGB0XBhidcuMq8';pro='recCWDgsOvMuPxI12';job='job-20261122230435-2a069565'},
  @{n=11156;rid='recAbETkPs5NX5eH2';pro='recEkDe7BES0FsYtU';job='job-20261122230719-ea72f9ed'}
)
Health;Idle
$pr=One 'production_requests?airtable_record_id=eq.recR4EQcshFZ4fNL0&select=id,request_status,production_job&limit=2'
if($pr.request_status -ne 'Promoted' -or $pr.production_job.step -ne 'done' -or $pr.production_job.job_id -ne 'spj-81f1d5f76782'){throw 'original_production_request_changed'}
$parent=One 'content_items?airtable_record_id=eq.rectA2pBh8C7GDNql&select=content_number,production_request_id,extras&limit=2'
if($parent.production_request_id -ne $pr.id -or [int]$parent.content_number -ne 2303 -or $parent.extras.Include_Voiceover -ne 'Yes' -or [double]$parent.extras.Voiceover_Duration_Seconds -lt 4){throw 'parent_narration_not_ready'}
$vo=[string]$parent.extras.Voiceover_URL
if($vo -notlike 'https://drive.google.com/uc?id=1g4BgbdA_PFbQbiVqREgTOpJxnRRhc-p7*'){throw 'approved_voiceover_mismatch'}
$duration=[double]$parent.extras.Voiceover_Duration_Seconds
$all=@(Rows 'platform_outputs?content_number=eq.2303&select=*&order=output_number.asc')
if($all.Count -ne 4 -or (($all|ForEach-Object {$_.output_number}) -join ',') -ne '11153,11154,11155,11156'){throw 'four_output_identity_changed'}
$pros=@(Rows ("production_request_outputs?production_request_id=eq.$($pr.id)&select=airtable_record_id,platform_output_id,effective_resolution&limit=20"))
foreach($spec in ($reels+$stories)){
  $matching=@($all|Where-Object {[int]$_.output_number -eq $spec.n})
  if($matching.Count -ne 1 -or $matching[0].airtable_record_id -ne $spec.rid){throw ('output_identity_changed_'+$spec.n)}
  $out=$matching[0];Protected $out
  $linked=@($pros|Where-Object {$_.airtable_record_id -eq $spec.pro -and $_.platform_output_id -eq $out.id})
  if($linked.Count -ne 1){throw ('pro_link_changed_'+$spec.n)}
  if($spec.n -gt 11154){
    if($out.render_status -ne 'Rendered' -or $out.remotion_job_id -ne $spec.job -or $linked[0].effective_resolution.Voiceover_Mode_Override -ne 'No'){throw 'intentional_story_mute_or_media_changed'}
  } elseif($linked[0].effective_resolution.Voiceover_Mode_Override -eq 'No'){throw ('explicit_reel_mute_stop_'+$spec.n)}
}
Write-Output 'bethesda_2303_preflight=PASS exact_narration=7.012s four_holds=true story_mutes=true'
foreach($spec in $reels){
  Health;Idle
  $o=Output $spec.rid;Protected $o
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
  $complete=$false
  for($i=0;$i -lt 65;$i++){
    Start-Sleep -Seconds 7
    $poll=Stage 'r5' $spec.rid
    $cur=Output $spec.rid;Protected $cur
    if($cur.remotion_job_id -ne $new.remotion_job_id){throw 'r5_job_race_stop'}
    if($cur.render_status -in @('Blocked','Failed')){throw ('r5_render_failed_'+$spec.n)}
    if($cur.render_status -eq 'Rendered' -and $cur.output_status -eq 'Ready for Review' -and $cur.final_file_url -and $cur.studio_preview_url -and $cur.studio_preview_url -ne $o.studio_preview_url -and [string]$cur.remotion_props.voiceover.url -eq $vo){
      $complete=$true;break
    }
  }
  if(!$complete){throw ('new_render_not_complete_preserved_orig_backup_'+$spec.n)}
  Write-Output ('bethesda_reel_'+$spec.n+'=NEW_RENDERED_NARRATED_REVIEW_ONLY')
}
$last=@(Rows 'platform_outputs?content_number=eq.2303&select=output_number,remotion_job_id,render_status,do_not_publish,auto_publish_enabled,publish_status,published_at,scheduled_post_date,studio_effective_voiceover_mode&order=output_number.asc')
if($last.Count -ne 4){throw 'postflight_four_outputs_missing'}
foreach($o in $last){
  Protected $o
  if($o.output_number -le 11154 -and ($o.render_status -ne 'Rendered' -or $o.studio_effective_voiceover_mode -ne 'Yes')){throw 'reel_not_narrated'}
  if($o.output_number -ge 11155 -and ($o.studio_effective_voiceover_mode -ne 'No' -or $o.remotion_job_id -ne (@($stories|Where-Object {$_.n -eq $o.output_number})[0].job))){throw 'story_changed'}
}
Write-Output 'bethesda_2303_two_reel_audio_fix=COMPLETE stories=UNCHANGED four_DNP=TRUE published=FALSE'
