# P1 #2340: exact original NYC video inbox-status retrieval ONLY.
# TikTok's status/fetch read operation is POST; it never initializes, uploads
# or publishes media. Preserve the saved draft ID and all output state.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{
  output=4785;profile='New York City';saved_original_id=true;read_only=$true
  owner_verified=$false;status_check_complete=$false;publish_status=''
  delivered_to_inbox=$false;publicly_posted_confirmed=$false
  returned_public_id_count=0;reason='not_started'
  provider_status_fetch_calls=0;media_create_calls=0;media_publish_calls=0
  supabase_writes=0;airtable_operations=0
}
try {
 $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
 if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_source_required'}
 $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
 if(-not(Test-Path $envfile)){throw 'runner_config_unavailable'}
 function E([string]$n){
   $line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
   if($line.Count -ne 1){throw 'runner_config_unavailable'}
   return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
 }
 $url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
 if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'production_source_mismatch'}
 $h=@{apikey=$key;Authorization=('Bearer '+$key)}
 $rows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.4785&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,auto_publish_enabled,do_not_publish,published_at,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25
 if(@($rows).Count -ne 1){throw 'original_output_not_exact'}
 $o=$rows[0]
 $original=[string]$o.error_messages.TikTok_Draft_Publish_ID
 if($o.airtable_record_id -ne 'recDpfbqDdQjCAgNo' -or $o.platform -ne 'TikTok' -or $o.platform_output_type -ne 'TikTok Video' -or
    $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Publishing' -or
    $o.auto_publish_enabled -ne $true -or $o.do_not_publish -ne $false -or $o.published_at -or $o.platform_post_url -or
    $original -ne 'v_inbox_url~v2.7706207567982462989'){throw 'original_output_drift'}
 $profiles=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 20
 if(@($profiles).Count -ne 1 -or $profiles[0].market_name -ne 'New York City'){throw 'wrong_profile'}
 $settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
 $config=@{}
 foreach($item in $settings){
  $p=$item.payload
  if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
  $name=[string]$p.Setting_Name
  if(@('NYC_TIKTOK_HANDLE','NYC_TIKTOK_PIPELINE_SECRET','NYC_TIKTOK_WORKER_BASE_URL') -contains $name){
    if($config.ContainsKey($name)){throw 'duplicate_active_tiktok_setting'}
    $config[$name]=[string]$p.Setting_Value
  }
 }
 $base=[string]$config.NYC_TIKTOK_WORKER_BASE_URL
 $secret=[string]$config.NYC_TIKTOK_PIPELINE_SECRET
 $handle=([string]$config.NYC_TIKTOK_HANDLE).TrimStart('@').ToLowerInvariant()
 if($base -ne 'https://auth-nyc.chicagoshining.com' -or -not $secret -or -not $handle){throw 'tiktok_owner_config_unavailable'}
 $identity=Invoke-RestMethod ($base+'/tiktok/status') -Method Get -TimeoutSec 30
 $actual=([string]$identity.creator_username).TrimStart('@').ToLowerInvariant()
 if($identity.ok -ne $true -or $identity.authorized -ne $true -or $actual -ne $handle){throw 'tiktok_owned_creator_unverified'}
 $r.owner_verified=$true
 # One and only one provider status read (POST is required by TikTok API).
 $r.provider_status_fetch_calls=1
 $body=@{publish_id=$original}|ConvertTo-Json -Compress
 $response=Invoke-RestMethod ($base+'/tiktok/draft/status') -Method Post -Headers @{'X-Pipeline-Secret'=$secret;Accept='application/json'} -ContentType 'application/json' -Body $body -TimeoutSec 65
 if($response.ok -ne $true -or [string]$response.publish_id -ne $original){throw 'exact_publish_id_not_returned'}
 $r.status_check_complete=$true
 $status=[string]$response.status
 $r.publish_status=if($status -match '^[A-Z_]{1,55}$'){$status}else{'UNKNOWN'}
 $r.delivered_to_inbox=($status -eq 'SEND_TO_USER_INBOX')
 $ids=@($response.publicly_available_post_ids|Where-Object{[string]$_ -match '^\d{6,40}$'})
 $r.returned_public_id_count=$ids.Count
 # A completed upload alone is NOT a page-owned public post proof.
 $r.publicly_posted_confirmed=$false
 $r.reason=if($status -eq 'SEND_TO_USER_INBOX'){'original_draft_delivered_manual_creator_action_required'}elseif($status -eq 'PUBLISH_COMPLETE' -and $ids.Count){'provider_post_ids_need_exact_public_owner_verification'}elseif($status -eq 'PUBLISH_COMPLETE'){'complete_no_public_post_id_proof'}elseif($status -eq 'FAILED'){'original_delivery_failed_no_auto_reinit'}else{'original_status_unresolved_no_duplicate_create'}
}catch{
 $msg=[string]$_.Exception.Message
 $known=@('supabase_source_required','runner_config_unavailable','production_source_mismatch','original_output_not_exact','original_output_drift','wrong_profile','duplicate_active_tiktok_setting','tiktok_owner_config_unavailable','tiktok_owned_creator_unverified','exact_publish_id_not_returned')
 $r.reason=if($known -contains $msg){$msg}else{'provider_status_or_runtime_unavailable'}
}
Write-Output ('P1_NYC4785_TIKTOK_STATUS='+($r|ConvertTo-Json -Compress -Depth 5))
