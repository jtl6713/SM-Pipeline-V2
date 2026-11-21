# P1 #2340: ten approved expired Stories only after a genuine #3522 canary receipt.
# Prior Do_Not_Publish holds remain active before and after the direct one-shot
# owner-authenticated provider publish. Do not replay a fenced Graph POST.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$t=@(
 @{n=4123;rid='recqX08bBrb1ub4ap';old='17910781752575604';city='Chicago';prefix=''},
 @{n=4928;rid='recKFcUJ8W16Pqxrg';old='17911706079575604';city='Chicago';prefix=''},
 @{n=1256;rid='reclzIZkun5Mj4WFT';old='18115347590139610';city='Miami';prefix='MIAMI_'},
 @{n=5244;rid='rec9FFAi9EAZ1gZ7w';old='18115349108139610';city='Miami';prefix='MIAMI_'},
 @{n=5394;rid='rec5HzmR2ENCivIzK';old='18115349219139610';city='Miami';prefix='MIAMI_'},
 @{n=5458;rid='recOEiTqfiBNFrpAq';old='18115994561139610';city='Miami';prefix='MIAMI_'},
 @{n=2627;rid='rec84IjfUIcvTHDKc';old='18132638605783117';city='New York City';prefix='NYC_'},
 @{n=2684;rid='recims0qZBEA0lMnN';old='18133505047783117';city='New York City';prefix='NYC_'},
 @{n=5039;rid='recssYvd2nxOOqGgq';old='18133360240783117';city='New York City';prefix='NYC_'},
 @{n=5047;rid='rec7IerfkxmU6Kmxb';old='18132659572783117';city='New York City';prefix='NYC_'}
)
$report=[ordered]@{targets=$t.Count;canary_3522_proven=$false;outcomes=@();provider_create_calls=0;reused_saved_containers=0;provider_publish_calls=0;verified_published=0;airtable_ops=0;skipped_copyright_sensitive=5628}
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'authority_unverified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($x){$ls=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($x)+'\s*=')}|Select-Object -Last 1);if($ls.Count -ne 1){throw 'missing_runner_config'};return ([string]$ls[0] -split '=',2)[1].Trim().Trim('"',"'")}
$su=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'not_authoritative_production_project'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
function ReadS($route){return Invoke-RestMethod ($su+$route) -Method Get -Headers $h -TimeoutSec 25}
$canary=ReadS '/rest/v1/platform_outputs?output_number=eq.3522&select=output_number,publish_status,published_at,error_messages&limit=2'
if(@($canary).Count -ne 1 -or $canary[0].publish_status -ne 'Published' -or -not $canary[0].published_at -or [string]$canary[0].error_messages.'P1_2340_3522_Replacement_Publish_Fence' -ne 'P1-2340:3522:approved-expired-story-replacement-publish-v1' -or [string]$canary[0].error_messages.'IG_Story_Post_ID' -notmatch '^\d{12,30}$'){throw 'fresh_story_canary_not_proven_stop_all'}
$report.canary_3522_proven=$true
$s=ReadS '/rest/v1/engagement_settings?select=payload&limit=500'
$settings=@{}
foreach($row in $s){$p=$row.payload;if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
 $name=[string]$p.Setting_Name
 if($name -match '^(MIAMI_|NYC_)?(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN)$' -or $name -eq 'META_GRAPH_API_VERSION'){
  if($settings.ContainsKey($name)){throw 'duplicate_account_config'}
  $settings[$name]=[string]$p.Setting_Value
 }}
$ver=[string]$settings.META_GRAPH_API_VERSION;if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
$profiles=ReadS '/rest/v1/content_profiles?select=id,market_name&limit=10'
$auth=@{}
foreach($pfx in @('','MIAMI_','NYC_')){
 $acct=[string]$settings[$pfx+'INSTAGRAM_BUSINESS_ACCOUNT_ID'];$token=[string]$settings[$pfx+'META_GRAPH_API_ACCESS_TOKEN']
 if($acct -notmatch '^\d{6,30}$' -or -not $token){throw 'profile_meta_credentials_missing'}
 $gh=@{Authorization=('Bearer '+$token)}
 $owner=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$acct+'?fields=id') -Headers $gh -Method Get -TimeoutSec 40
 if([string]$owner.id -ne $acct){throw 'profile_account_identity_mismatch'}
 $auth[$pfx]=@{acct=$acct;headers=$gh}
}
function GraphGet($id,$fields,$headers){return Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Headers $headers -Method Get -TimeoutSec 40}
foreach($x in $t){
 $row=[ordered]@{output=$x.n;state='blocked_preflight';create_calls=0;publish_calls=0;public_media='';error=''}
 $r=$null
 try {
  $a=ReadS ('/rest/v1/platform_outputs?output_number=eq.'+$x.n+'&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,publish_method,do_not_publish,auto_publish_enabled,publish_retry_eligible,publish_asset_url,published_at,platform_post_url,updated_at,error_messages&limit=2')
  if(@($a).Count -ne 1){throw 'target_output_missing'}
  $o=$a[0];$e=$o.error_messages;$asset=[string]$o.publish_asset_url
  $owned=@($profiles|Where-Object{[string]$_.id -eq [string]$o.content_profile_id})
  if($owned.Count -ne 1 -or [string]$owned[0].market_name -ne $x.city -or [string]$o.airtable_record_id -ne $x.rid -or
   $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Failed' -or $o.publish_method -ne 'Automated' -or
   $o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_retry_eligible -ne $false -or $o.published_at -or $o.platform_post_url -or
   [string]$e.IG_Story_Status -ne 'Failed' -or [string]$e.IG_Story_Container_ID -ne $x.old -or [string]$e.IG_Story_Post_ID -or [string]$e.Backlog_20261120_IG_Story_Provider_Status -ne 'EXPIRED'){throw 'approved_original_row_not_exact'}
  $fence=$e.Studio_Overdue_Failed_IG_Story_Fence_20261120
  if($null -eq $fence -or $fence.previous_do_not_publish -ne $false -or
     $fence.previous_auto_publish_enabled -ne $true -or
     [string]$fence.provider_container_preserved -ne $x.old){throw 'safety_hold_origin_not_verified'}
  if($asset -notmatch ('^https://media\.chicagoshining\.com/studio/previews/'+$x.rid+'/[^?]+\.mp4$')){throw 'approved_video_media_url_not_exact'}
  $head=Invoke-WebRequest $asset -Method Head -UseBasicParsing -TimeoutSec 30
  if([int]$head.StatusCode -ne 200 -or [string]$head.Headers.'Content-Type' -notmatch '(video/|application/octet-stream)'){throw 'approved_media_unavailable'}
  $account=$auth[$x.prefix]
  $previous=GraphGet $x.old 'id,status_code' $account.headers
  if([string]$previous.id -ne $x.old -or [string]$previous.status_code -ne 'EXPIRED'){throw 'prior_original_container_not_expired'}
  $ek='P1-2340:'+$x.n+':approved-expired-story-replacement-create-v1'
  $bag=@{};foreach($field in $e.PSObject.Properties){$bag[$field.Name]=$field.Value}
  $previousNew=[string]$e.P1_2340_Story_Replacement_Container_ID
  $previousFence=[string]$e.P1_2340_Story_Replacement_Create_Fence
  if($x.n -eq 4123){
    # First batch created this exact one original replacement; do not create again.
    if($previousNew -ne '17911963848575604' -or $previousFence -ne $ek){throw 'saved_original_container_not_exact'}
    $events=ReadS ('/rest/v1/quality_agent_recovery_events?airtable_record_id=eq.recP12340IGS4123A&select=event_key,output_number&limit=2')
    if(@($events).Count -ne 1 -or [string]$events[0].event_key -ne $ek -or $events[0].output_number -ne 4123){throw 'existing_create_fence_unverified'}
    $new=$previousNew
    $row.reused_container=$true
    $row.new_container=$new
    $report.reused_saved_containers++
  }else{
    if($previousNew -or $previousFence){throw 'unplanned_prior_create_must_not_replay'}
    $eid='recP12340IGS'+$x.n+'A'
    $event=@(@{airtable_record_id=$eid;event_key=$ek;outcome='approved_fresh_story_create_reserved';output_record_id=$x.rid;output_number=$x.n;fields=@{Event_Key=$ek;Output_ID=$x.n;Outcome='approved_fresh_story_create_reserved';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 6
    $saved=Invoke-RestMethod ($su+'/rest/v1/quality_agent_recovery_events') -Headers ($h+@{Prefer='return=representation'}) -Method Post -ContentType 'application/json' -Body $event -TimeoutSec 25
    if(@($saved).Count -ne 1 -or [string]$saved[0].event_key -ne $ek){throw 'unique_create_fence_not_durable'}
    $row.state='create_ambiguous_no_replay';$row.create_calls=1;$report.provider_create_calls++
    $newData=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$account.acct+'/media') -Headers $account.headers -Method Post -Body @{media_type='STORIES';video_url=$asset} -TimeoutSec 75
    $new=[string]$newData.id
    if($new -notmatch '^\d{12,30}$'){throw 'new_container_response_missing'}
    $row.new_container=$new
    $bag['P1_2340_Story_Replacement_Container_ID']=$new
    $bag['P1_2340_Story_Replacement_Create_Fence']=$ek
    $updated=Invoke-RestMethod ($su+'/rest/v1/platform_outputs?output_number=eq.'+$x.n+'&airtable_record_id=eq.'+$x.rid+'&publish_status=eq.Failed&updated_at=eq.'+[uri]::EscapeDataString([string]$o.updated_at)) -Headers ($h+@{Prefer='return=representation'}) -Method Patch -ContentType 'application/json' -Body (@{error_messages=$bag}|ConvertTo-Json -Compress -Depth 75) -TimeoutSec 30
    if(@($updated).Count -ne 1){throw 'new_container_not_saved_no_publish'}
  }
  $row.state='poll_original_replacement'
  $ready=$false;$readErrors=0
  for($i=0;$i -lt 18;$i++){
    Start-Sleep -Seconds 7
    try{$status=GraphGet $new 'id,status_code' $account.headers}
    catch {
      $readErrors++
      $row.status_get_errors=$readErrors
      try{$row.last_get_http=[int]$_.Exception.Response.StatusCode}catch{}
      if($readErrors -ge 5){throw 'existing_new_container_status_get_unavailable'}
      continue # GET retry only; no create/publish retry
    }
    if([string]$status.id -ne $new){throw 'created_container_identity_mismatch'}
    if([string]$status.status_code -eq 'FINISHED'){$ready=$true;break}
    if([string]$status.status_code -in @('ERROR','EXPIRED','PUBLISHED')){throw 'new_container_terminal'}
  }
  $row.status_get_errors=$readErrors
  if(-not $ready){throw 'new_container_not_finished'}
  $pe='P1-2340:'+$x.n+':approved-expired-story-replacement-publish-v1'
  # PowerShell's built-in $PID is read-only (case insensitive); never assign it.
  $publishEventRecordId='recP12340PUB'+$x.n+'A'
  $ev=@(@{airtable_record_id=$publishEventRecordId;event_key=$pe;outcome='approved_fresh_story_publish_reserved';output_record_id=$x.rid;output_number=$x.n;fields=@{Event_Key=$pe;Output_ID=$x.n;Outcome='approved_fresh_story_publish_reserved';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 6
  $pubFence=Invoke-RestMethod ($su+'/rest/v1/quality_agent_recovery_events') -Headers ($h+@{Prefer='return=representation'}) -Method Post -ContentType 'application/json' -Body $ev -TimeoutSec 25
  if(@($pubFence).Count -ne 1){throw 'unique_publish_fence_not_durable'}
  $row.state='publish_ambiguous_no_replay';$row.publish_calls=1;$report.provider_publish_calls++
  $posted=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$account.acct+'/media_publish') -Headers $account.headers -Method Post -Body @{creation_id=$new} -TimeoutSec 70
  $post=[string]$posted.id
  if($post -notmatch '^\d{12,30}$'){throw 'public_media_id_absent'}
  $row.public_media=$post
  # The Meta publish POST already returned the real post ID. If its GET edge
  # is briefly eventual-consistent, retry READ ONLY; never resend media_publish.
  $proof=$null
  for($verify=0;$verify -lt 6;$verify++){
    try{
      $candidate=GraphGet $post 'id,permalink,timestamp,media_type' $account.headers
      if([string]$candidate.id -eq $post){$proof=$candidate;break}
    }catch{}
    Start-Sleep -Seconds 5
  }
  if($null -eq $proof -or [string]$proof.id -ne $post -or [string]$proof.media_type -notin @('VIDEO','IMAGE','CAROUSEL_ALBUM')){throw 'published_media_not_verified'}
  $perma=[string]$proof.permalink
  if($perma -and $perma -notmatch '^https://(www\.)?instagram\.com/'){throw 'public_permalink_not_verified'}
  $bag['P1_2340_Story_Original_Expired_Container_ID']=$x.old
  $bag['P1_2340_Story_Replacement_Publish_Fence']=$pe
  $bag['IG_Story_Container_ID']=$new
  $bag['IG_Story_Post_ID']=$post;$bag['Platform_Post_ID']=$post;$bag['Platform_Media_ID']=$post
  $bag['IG_Story_Status']='Published';$bag['IG_Story_Error_Message']=''
  $at=[DateTime]::UtcNow.ToString('o');$bag['IG_Story_Published_At']=$at
  $patch=@{publish_status='Published';output_status='Published';published_at=$at;publish_retry_eligible=$false;error_messages=$bag}
  if($perma){$patch.platform_post_url=$perma}
  $done=Invoke-RestMethod ($su+'/rest/v1/platform_outputs?output_number=eq.'+$x.n+'&airtable_record_id=eq.'+$x.rid+'&publish_status=eq.Failed') -Headers ($h+@{Prefer='return=representation'}) -Method Patch -ContentType 'application/json' -Body ($patch|ConvertTo-Json -Compress -Depth 75) -TimeoutSec 30
  if(@($done).Count -ne 1 -or $done[0].publish_status -ne 'Published' -or [string]$done[0].error_messages.IG_Story_Post_ID -ne $post){throw 'provider_post_created_but_source_finalization_unverified'}
  $row.state='published_verified';$report.verified_published++
 }catch{
  $msg=[string]$_.Exception.Message
  $allowed=@('target_output_missing','approved_original_row_not_exact','saved_original_container_not_exact','existing_create_fence_unverified','unplanned_prior_create_must_not_replay','existing_new_container_status_get_unavailable','safety_hold_origin_not_verified','approved_video_media_url_not_exact','approved_media_unavailable','prior_original_container_not_expired','unique_create_fence_not_durable','new_container_response_missing','new_container_not_saved_no_publish','created_container_identity_mismatch','new_container_terminal','new_container_not_finished','unique_publish_fence_not_durable','public_media_id_absent','published_media_not_verified','public_permalink_not_verified','provider_post_created_but_source_finalization_unverified')
  $row.error=if($allowed -contains $msg){$msg}else{'provider_or_runtime_failure_no_replay'}
 }
 $report.outcomes+= $row
 if($row.state -ne 'published_verified'){break}
}
Write-Output ('P1_2340_TEN_FRESH_STORIES='+($report|ConvertTo-Json -Compress -Depth 7))
