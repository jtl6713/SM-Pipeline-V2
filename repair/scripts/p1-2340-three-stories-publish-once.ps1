$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_required'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($n){$x=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1);if(-not $x){throw 'missing_config'};return ([string]$x -split '=',2)[1].Trim().Trim('"',"'")}
$url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY';$runner=E 'PIPELINE_RUNNER_SHARED_SECRET'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key -or -not $runner){throw 'invalid_config'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$t=@(
 @{n=2283;rid='rec40LThhxmsDmccZ';prefix=''},
 @{n=1353;rid='rec2AGRDACDzQx4Wp';prefix='LA_'},
 @{n=2877;rid='recx426qOdMzybbEa';prefix='NYC_'}
)
$s=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($row in $s){$z=$row.payload;if($null -eq $z -or [string]$z.source -ne 'pipeline' -or [string]$z.Active -ne 'True'){continue};$name=[string]$z.Setting_Name;if(@('INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_ACCESS_TOKEN','LA_INSTAGRAM_BUSINESS_ACCOUNT_ID','LA_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','NYC_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION') -contains $name){if($v.ContainsKey($name)){throw 'duplicate_setting'};$v[$name]=[string]$z.Setting_Value}}
$ver=[string]$v['META_GRAPH_API_VERSION'];if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
$headers=@{}
foreach($prefix in @('','LA_','NYC_')){
 $id=[string]$v[($prefix+'INSTAGRAM_BUSINESS_ACCOUNT_ID')];$token=[string]$v[($prefix+'META_GRAPH_API_ACCESS_TOKEN')]
 if($id -notmatch '^\d{6,30}$' -or -not $token){throw 'account_auth_missing'}
 $gh=@{Authorization=('Bearer '+$token)}
 $a=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id') -Headers $gh -Method Get -TimeoutSec 35
 if([string]$a.id -ne $id){throw 'account_identity_mismatch'}
 $headers[$prefix]=$gh
}
function G($url,$headers){if(-not $url.StartsWith('https://graph.facebook.com/')){throw 'bad_graph_host'};for($i=0;$i -lt 3;$i++){try{return Invoke-RestMethod $url -Method Get -Headers $headers -TimeoutSec 35}catch{if($i -eq 2){throw 'graph_get_unavailable'};Start-Sleep -Seconds (2+$i)}}}
$report=@{};foreach($i in $t){$report[[string]$i.n]=@{output=$i.n;state='not_checked';poll_calls=0;media_id=''}}
for($pass=0;$pass -lt 4;$pass++){
 $pending=0
 foreach($i in $t){
  $key=[string]$i.n
  if($report[$key].state -in @('published_verified','one_time_poll_fenced','blocked_stored_receipt','expired_or_error')){continue}
  $state='blocked';$media=''
  try{
   $rows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.'+$i.n+'&select=output_number,airtable_record_id,platform,publish_status,do_not_publish,auto_publish_enabled,platform_post_url,published_at,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25
   if(@($rows).Count -ne 1 -or $rows[0].airtable_record_id -ne $i.rid -or $rows[0].platform -ne 'Instagram'){throw 'wrong_output_identity'}
   $o=$rows[0];$bag=$o.error_messages
   if($o.publish_status -eq 'Published' -and $o.published_at -and $bag.'IG_Story_Post_ID'){$report[$key].state='published_verified';$report[$key].media_id=[string]$bag.'IG_Story_Post_ID';continue}
   if($o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $true -or $o.publish_status -ne 'Ready to Publish' -or $o.platform_post_url -or $o.published_at){throw 'approval_changed'}
   if([string]$bag.'Publish_Locked_By' -ne 'P1_2340_STORY_BATCH' -or [string]$bag.'IG_Story_Status' -ne 'Publishing' -or [string]$bag.'IG_Story_Post_ID' -or [string]$bag.'Platform_Post_ID'){throw 'not_batch_owned_ready_container'}
   $container=[string]$bag.'IG_Story_Container_ID'
   if($container -notmatch '^\d{12,30}$'){throw 'saved_container_missing'}
   $createdId='recP12340IGS'+$i.n+'A'
   $events=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events?airtable_record_id=eq.'+$createdId+'&select=event_key&limit=2') -Headers $h -Method Get -TimeoutSec 25
   if(@($events).Count -ne 1 -or $events[0].event_key -ne ('P1-2340:'+$i.n+':one-native-story-create-v1')){throw 'create_event_missing'}
   $g=G ('https://graph.facebook.com/'+$ver+'/'+$container+'?fields=id,status_code') $headers[$i.prefix]
   if([string]$g.id -ne $container){throw 'wrong_original_container'}
   $status=[string]$g.status_code
   if($status -eq 'EXPIRED' -or $status -eq 'ERROR'){$report[$key].state='expired_or_error';continue}
   if($status -ne 'FINISHED'){$report[$key].state='waiting_for_finished';$pending++;continue}
   $eventKey='P1-2340:'+$i.n+':one-native-story-publish-v1';$eid='recP12340IGSPUB'+$i.n+'A'
   $event=@(@{airtable_record_id=$eid;event_key=$eventKey;outcome='original_container_publish_reserved';output_record_id=$i.rid;output_number=$i.n;fields=@{Event_Key=$eventKey;Output_ID=$i.n;Output_Record_ID=$i.rid;Outcome='original_container_publish_reserved';Actor='P1 2340 eight approved Stories';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 8
   $f=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events') -Method Post -Headers ($h+@{Prefer='return=representation'}) -ContentType 'application/json' -Body $event -TimeoutSec 25
   if(@($f).Count -ne 1 -or $f[0].event_key -ne $eventKey){throw 'unique_publish_fence_not_verified'}
   $report[$key].state='one_time_poll_fenced'
   $body=@{output_record_id=$i.rid;extra=@{dry_run=$false;wait=$false}}|ConvertTo-Json -Compress
   $report[$key].poll_calls=1
   $x=Invoke-RestMethod 'http://127.0.0.1:3350/stages/ap1_igs_poll' -Method Post -Headers @{'X-Pipeline-Secret'=$runner} -ContentType 'application/json' -Body $body -TimeoutSec 120
   if($x.status -eq 'ok' -and $x.details.run.post_id){$report[$key].state='published_stage_success';$report[$key].media_id=[string]$x.details.run.post_id}
  }catch{
   if($report[$key].state -eq 'one_time_poll_fenced'){$report[$key].state='ambiguous_publish_no_retry'}elseif($report[$key].state -ne 'waiting_for_finished'){$report[$key].state='blocked_preflight'}
  }
 }
 if($pending -eq 0){break};if($pass -lt 3){Start-Sleep -Seconds 25}
}
foreach($i in $t){
 $key=[string]$i.n
 if($report[$key].state -eq 'published_stage_success'){
  try{$q=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.'+$i.n+'&select=publish_status,published_at,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 20
   if(@($q).Count -eq 1 -and $q[0].publish_status -eq 'Published' -and $q[0].published_at -and $q[0].error_messages.'IG_Story_Post_ID' -eq $report[$key].media_id){$report[$key].state='published_verified'}else{$report[$key].state='published_status_unverified'}
  }catch{$report[$key].state='published_status_unverified'}
 }
}
Write-Output ('P1_IG_STORY_BATCH_POLL='+(@{targets=3;published=@($report.Values|Where-Object{$_.state -eq 'published_verified'}).Count;provider_publish_stage_calls=@($report.Values|Where-Object{$_.poll_calls -eq 1}).Count;results=@($t|ForEach-Object{$report[[string]$_.n]})}|ConvertTo-Json -Compress -Depth 6))
