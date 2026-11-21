$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'not_supabase_canonical'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_missing'}
function E($key){
 $line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($key)+'\s*=')}|Select-Object -Last 1)
 if(-not $line){throw 'missing_required_runner_config'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(E 'SUPABASE_URL').TrimEnd('/')
$serviceKey=E 'SUPABASE_SERVICE_ROLE_KEY'
$runnerSecret=E 'PIPELINE_RUNNER_SHARED_SECRET'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $serviceKey -or -not $runnerSecret){throw 'invalid_config'}
$headers=@{apikey=$serviceKey;Authorization=('Bearer '+$serviceKey)}
$original=@('18134415559783117','18134415577783117','18134415640783117','18134415715783117','18134415775783117','18134415793783117','18134415835783117','18134415883783117')
$r=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.9890&select=airtable_record_id,content_profile_id,output_number,platform,platform_output_type,output_status,review_status,publish_status,auto_publish_enabled,published_at,platform_post_url,ig_carousel_status,ig_carousel_children_ready_count,error_messages&limit=2') -Method Get -Headers $headers -TimeoutSec 25
if($r.Count -ne 1){throw 'exact_output_missing'}
$o=$r[0]
if($o.airtable_record_id -ne 'rec7uB7WQhZLyk28T' -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.auto_publish_enabled -ne $true -or $o.ig_carousel_status -ne 'Children Ready' -or $o.ig_carousel_children_ready_count -ne 8 -or $o.platform_post_url -or $o.published_at -or [string]$o.error_messages.'IG_Carousel_Parent_Container_ID' -or [string]$o.error_messages.'Publish_Locked_At' -or [string]$o.error_messages.'Publish_Locked_By' -or [string]$o.error_messages.'IG_Carousel_Last_Completed_Stage' -ne 'AP2C'){throw 'unexpected_output_state_block'}
$profile=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $headers -Method Get -TimeoutSec 25
if($profile.Count -ne 1 -or $profile[0].market_name -ne 'New York City'){throw 'wrong_owner'}
$slides=Invoke-RestMethod ($url+'/rest/v1/carousel_slides?ig_child_container_id=in.(' + ($original -join ',') + ')&select=ig_child_container_id,current_order,fields,deleted_from_carousel&limit=10') -Headers $headers -Method Get -TimeoutSec 25
if(@($slides).Count -ne 8){throw ('child_count_unverified_count_'+@($slides).Count)}
foreach($s in $slides){
 if($original -notcontains [string]$s.ig_child_container_id -or [string]$s.fields.'PO_Output_ID'[0] -ne '9890' -or [string]$s.fields.'Review Status' -ne 'Final Approved' -or [string]$s.fields.'IG_Child_Container_Status' -ne 'FINISHED' -or $s.deleted_from_carousel -eq $true){throw 'child_receipt_unverified'}
}
if(@($slides.current_order|Sort-Object) -join ',' -ne '1,2,3,4,5,6,7,8'){throw 'child_order_unverified'}
$settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $headers -Method Get -TimeoutSec 25
$values=@{}
foreach($row in $settings){
 $p=$row.payload
 if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
 $name=[string]$p.Setting_Name
 if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){
  if($values.ContainsKey($name)){throw 'duplicate_active_setting'}
  $values[$name]=[string]$p.Setting_Value
 }
}
$token=[string]$values['NYC_META_GRAPH_API_ACCESS_TOKEN']
$account=[string]$values['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$ver=[string]$values['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'meta_auth_missing'}
function G($id,$fields){
 try{
  $x=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 30
  return @{ok=$true;id=[string]$x.id;state=[string]$x.status_code}
 }catch{return @{ok=$false;id='';state='unverified'}}
}
$accountGet=G $account 'id'
$report=@{output=9890;owner_verified=($accountGet.ok -and $accountGet.id -eq $account);preflight='blocked';children=@();fence_created=$false;provider_create_calls=0}
if(-not $report.owner_verified){throw 'provider_owner_unverified'}
foreach($cid in $original){
 $x=G $cid 'id,status_code'
 $report.children+=@{container_id=$cid;exact=($x.ok -and $x.id -eq $cid);status=$x.state}
}
if(@($report.children|Where-Object{(-not $_.exact) -or $_.status -ne 'FINISHED'}).Count -gt 0){
 $report.preflight='existing_children_not_all_finished'
 Write-Output ('P1_IG_AP3C_CANARY='+($report|ConvertTo-Json -Compress -Depth 6))
 exit 0
}
# Durable one-time attempt event BEFORE the remote parent-create call.
$eventId='recP12340AP3C9890A'
$eventKey='P1-2340:9890:single-parent-create-guard-v1'
$body=@(@{airtable_record_id=$eventId;event_key=$eventKey;outcome='parent_create_dispatch_fenced';output_record_id='rec7uB7WQhZLyk28T';output_number=9890;fields=@{
 Event_Key=$eventKey;Output_ID=9890;Output_Record_ID='rec7uB7WQhZLyk28T';
 Platform='Instagram';Output_Type='Instagram Carousel';Outcome='parent_create_dispatch_fenced';
 Actor='P1 #2340 approved output bounded continuation';Verified_At=[DateTime]::UtcNow.ToString('o');
 Details_JSON='{"original_children_verified":8,"exact_provider_owner":true,"at_most_once_parent_create":true}'
}})|ConvertTo-Json -Depth 8 -Compress
try{
 $f=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events') -Method Post -Headers ($headers+@{Prefer='return=representation'}) -ContentType 'application/json' -Body $body -TimeoutSec 25
 if($f.Count -ne 1 -or $f[0].event_key -ne $eventKey){throw 'fence_commit_not_confirmed'}
}catch{throw 'durable_dispatch_fence_rejected_or_already_exists'}
$report.fence_created=$true
$stageBody=@{output_record_id='rec7uB7WQhZLyk28T';idempotency_key=$eventKey;extra=@{dry_run=$false}}|ConvertTo-Json -Compress
try{
 $result=Invoke-RestMethod 'http://127.0.0.1:3350/stages/ap3c' -Method Post -Headers @{'X-Pipeline-Secret'=$runnerSecret} -ContentType 'application/json' -Body $stageBody -TimeoutSec 120
 $report.provider_create_calls=1
 $report.stage_status=[string]$result.status
 $report.stage_message=[string]$result.message
 $report.created_parent_id=[string]$result.details.run.parent_id
}catch{
 $report.stage_status='uncertain_operation_must_reconcile_before_retry'
 $report.provider_create_calls=1
}
Write-Output ('P1_IG_AP3C_CANARY='+($report|ConvertTo-Json -Compress -Depth 6))
