$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$n=3522;$rid='reco2Iix0eaXJHMGD';$old='17910983553575604'
$r=[ordered]@{output=$n;state='blocked_before_create';fence_created=$false;create_calls=0;publish_calls=0;old_confirmed_expired=$false;original_hold_preserved=$true;new_container='';new_media_id='';saved_published=$false;airtable_ops=0}
try {
 $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
 if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'invalid_production_authority'}
 $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
 function E($s){$x=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($s)+'\s*=')}|Select-Object -Last 1);if($x.Count -ne 1){throw 'missing_config'};return ([string]$x[0] -split '=',2)[1].Trim().Trim('"',"'")}
 $url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
 if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_project'}
 $h=@{apikey=$key;Authorization=('Bearer '+$key)}
 $uri=$url+'/rest/v1/platform_outputs?output_number=eq.3522&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,publish_method,do_not_publish,auto_publish_enabled,publish_retry_eligible,publish_asset_url,published_at,platform_post_url,updated_at,error_messages&limit=2'
 $a=Invoke-RestMethod $uri -Headers $h -Method Get -TimeoutSec 25
 if(@($a).Count -ne 1){throw 'not_single_original'}
 $o=$a[0];$e=$o.error_messages
 $asset=[string]$o.publish_asset_url
 if($o.airtable_record_id -ne $rid -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Failed' -or $o.publish_method -ne 'Automated' -or $o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_retry_eligible -ne $false -or $o.published_at -or $o.platform_post_url -or [string]$e.'IG_Story_Container_ID' -ne $old -or [string]$e.'IG_Story_Status' -ne 'Failed' -or [string]$e.'IG_Story_Post_ID' -or [string]$e.'Backlog_20261120_IG_Story_Provider_Status' -ne 'EXPIRED' -or $asset -ne 'https://media.chicagoshining.com/studio/previews/reco2Iix0eaXJHMGD/current.mp4'){throw 'approved_replacement_preflight_failed'}
 $oldHold=[string]$e.'Studio_Overdue_Failed_IG_Story_Fence_20261120'
 if(-not $oldHold -or $oldHold -notmatch '"previous_do_not_publish": false' -or $oldHold -notmatch '"previous_auto_publish_enabled": true'){throw 'original_hold_origin_unconfirmed'}
 $profile=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 20
 if(@($profile).Count -ne 1 -or [string]$profile[0].market_name -ne 'Chicago'){throw 'profile_mismatch'}
 $head=Invoke-WebRequest $asset -Method Head -UseBasicParsing -TimeoutSec 35
 if([int]$head.StatusCode -ne 200 -or [string]$head.Headers.'Content-Type' -notmatch '(video/mp4|video/|application/octet-stream)'){throw 'approved_mp4_not_available'}
 $settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
 $cfg=@{}
 foreach($setting in $settings){$p=$setting.payload;if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue};$name=[string]$p.Setting_Name;if(@('INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION') -contains $name){if($cfg.ContainsKey($name)){throw 'duplicate_setting'};$cfg[$name]=[string]$p.Setting_Value}}
 $acct=[string]$cfg.INSTAGRAM_BUSINESS_ACCOUNT_ID;$token=[string]$cfg.META_GRAPH_API_ACCESS_TOKEN
 $ver=[string]$cfg.META_GRAPH_API_VERSION;if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
 if($acct -notmatch '^\d{6,30}$' -or -not $token){throw 'account_config_missing'}
 $gh=@{Authorization=('Bearer '+$token)}
 function G($id,$fields){return Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Headers $gh -Method Get -TimeoutSec 35}
 $owner=G $acct 'id';$prior=G $old 'id,status_code'
 if([string]$owner.id -ne $acct -or [string]$prior.id -ne $old -or [string]$prior.status_code -ne 'EXPIRED'){throw 'old_container_not_proven_expired'}
 $r.old_confirmed_expired=$true
 # Reserve one immutable create operation before touching the provider.
 $ek='P1-2340:3522:approved-expired-story-replacement-create-v1'
 $eventId='recP12340IGSR3522AA'
 $event=@(@{airtable_record_id=$eventId;event_key=$ek;outcome='approved_fresh_story_create_reserved';output_record_id=$rid;output_number=$n;fields=@{Event_Key=$ek;Output_ID=$n;Outcome='approved_fresh_story_create_reserved';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 6
 $saved=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events') -Headers ($h+@{Prefer='return=representation'}) -Method Post -ContentType 'application/json' -Body $event -TimeoutSec 25
 if(@($saved).Count -ne 1 -or [string]$saved[0].event_key -ne $ek){throw 'one_time_fence_failed'}
 $r.fence_created=$true
 $r.state='create_ambiguous_stop_if_no_id';$r.create_calls=1
 $created=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$acct+'/media') -Headers $gh -Method Post -Body @{media_type='STORIES';video_url=$asset} -TimeoutSec 75
 $new=[string]$created.id
 if($new -notmatch '^\d{12,30}$'){throw 'new_container_receipt_missing'}
 $r.new_container=$new;$r.state='container_created_pending_provider_processing'
 # Persist identity BEFORE any later Graph publish operation.
 $checkpoint=@{};foreach($prop in $e.PSObject.Properties){$checkpoint[$prop.Name]=$prop.Value}
 $checkpoint['P1_2340_3522_Replacement_Container_ID']=$new
 $checkpoint['P1_2340_3522_Replacement_Create_Fence']=$ek
 $filter=$url+'/rest/v1/platform_outputs?output_number=eq.3522&airtable_record_id=eq.'+$rid+'&publish_status=eq.Failed&updated_at=eq.'+[uri]::EscapeDataString([string]$o.updated_at)
 $patch=@{error_messages=$checkpoint}|ConvertTo-Json -Compress -Depth 75
 $updated=Invoke-RestMethod $filter -Headers ($h+@{Prefer='return=representation'}) -Method Patch -ContentType 'application/json' -Body $patch -TimeoutSec 30
 if(@($updated).Count -ne 1){throw 'created_container_checkpoint_not_saved_no_publish'}
 $r.state='polling_saved_container'
 $ready=$false
 for($i=0;$i -lt 10;$i++){
  Start-Sleep -Seconds 8
  $state=G $new 'id,status_code'
  if([string]$state.id -ne $new){throw 'new_container_identity_drift'}
  if([string]$state.status_code -eq 'FINISHED'){$ready=$true;break}
  if([string]$state.status_code -in @('ERROR','EXPIRED','PUBLISHED')){throw 'container_terminal_no_publish'}
 }
 if(-not $ready){throw 'new_container_not_finished_no_publish'}
 $pubek='P1-2340:3522:approved-expired-story-replacement-publish-v1'
 $pubeid='recP12340IGSR3522PP'
 $pe=@(@{airtable_record_id=$pubeid;event_key=$pubek;outcome='approved_fresh_story_publish_reserved';output_record_id=$rid;output_number=$n;fields=@{Event_Key=$pubek;Output_ID=$n;Outcome='approved_fresh_story_publish_reserved';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 6
 $pubf=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events') -Headers ($h+@{Prefer='return=representation'}) -Method Post -ContentType 'application/json' -Body $pe -TimeoutSec 25
 if(@($pubf).Count -ne 1){throw 'publish_unique_fence_failed'}
 $r.state='publish_attempt_ambiguous_no_replay';$r.publish_calls=1
 $pub=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$acct+'/media_publish') -Headers $gh -Method Post -Body @{creation_id=$new} -TimeoutSec 75
 $post=[string]$pub.id
 if($post -notmatch '^\d{12,30}$'){throw 'public_post_receipt_missing_no_replay'}
 $r.new_media_id=$post;$r.state='provider_receipt_received'
 $confirm=G $post 'id,permalink,timestamp,media_type'
 if([string]$confirm.id -ne $post -or [string]$confirm.media_type -notin @('VIDEO','IMAGE','CAROUSEL_ALBUM')){throw 'public_media_not_verified'}
 $permalink=[string]$confirm.permalink
 if($permalink -and $permalink -notmatch '^https://(www\.)?instagram\.com/'){throw 'untrusted_permalink'}
 $after=@{};foreach($prop in $checkpoint.Keys){$after[$prop]=$checkpoint[$prop]}
 $after['P1_2340_3522_Replacement_Published_Container_ID']=$new
 $after['P1_2340_3522_Replacement_Publish_Fence']=$pubek
 $after['IG_Story_Post_ID']=$post;$after['Platform_Post_ID']=$post
 $after['IG_Story_Published_At']=[DateTime]::UtcNow.ToString('o')
 $after['IG_Story_Status']='Published'
 $after['P1_2340_3522_Original_Expired_Container_ID']=$old
 $final=@{publish_status='Published';output_status='Published';published_at=[DateTime]::UtcNow.ToString('o');publish_retry_eligible=$false;error_messages=$after}
 if($permalink){$final.platform_post_url=$permalink}
 $finalRows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.3522&airtable_record_id=eq.'+$rid+'&publish_status=eq.Failed') -Method Patch -Headers ($h+@{Prefer='return=representation'}) -ContentType 'application/json' -Body ($final|ConvertTo-Json -Compress -Depth 75) -TimeoutSec 30
 if(@($finalRows).Count -ne 1){throw 'provider_published_but_db_finalization_unverified'}
 $r.saved_published=([string]$finalRows[0].publish_status -eq 'Published' -and [string]$finalRows[0].error_messages.'IG_Story_Post_ID' -eq $post)
 $r.state=if($r.saved_published){'genuinely_published_original_approved_media_replacement'}else{'provider_published_db_readback_mismatch'}
}catch{
 $code=[string]$_.Exception.Message
 $ok=@('invalid_production_authority','missing_config','wrong_project','not_single_original','approved_replacement_preflight_failed','original_hold_origin_unconfirmed','profile_mismatch','approved_mp4_not_available','duplicate_setting','account_config_missing','old_container_not_proven_expired','one_time_fence_failed','new_container_receipt_missing','created_container_checkpoint_not_saved_no_publish','new_container_identity_drift','container_terminal_no_publish','new_container_not_finished_no_publish','publish_unique_fence_failed','public_post_receipt_missing_no_replay','public_media_not_verified','untrusted_permalink','provider_published_but_db_finalization_unverified')
 $r.error=if($ok -contains $code){$code}else{'provider_or_runtime_failure_no_replay'}
}
Write-Output ('P1_3522_FRESH_STORY='+($r|ConvertTo-Json -Compress -Depth 5))
