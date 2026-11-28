# #3159/#3096: fixed eight original draft IDs. Status/fetch only; never init/upload/publish.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$exact=@(
  @(4828,'recbXilz87uQC47HE','Chicago','v_inbox_url~v2.7712319610347931679'),
  @(5152,'recvZLDqI3ux0iZxL','Los Angeles','v_inbox_url~v2.7712189766250285070'),
  @(5723,'recu9AivphTS8L9cd','Miami','v_inbox_url~v2.7712236007701301279'),
  @(6101,'recMNZWxEgQdJkTzw','Los Angeles','v_inbox_url~v2.7712267000072505358'),
  @(6143,'recsVkXoY1Apxtr60','Los Angeles','v_inbox_url~v2.7712267049422112782'),
  @(6221,'reckb7BUHWf2TTvJS','Miami','v_inbox_url~v2.7712220580132538399'),
  @(6365,'rec5CKNmxknJNWs2r','Chicago','v_inbox_url~v2.7712235116185602062'),
  @(6431,'reckR6I1q8ElwbLDL','New York City','v_inbox_url~v2.7712220661556627487')
)
try {
 $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -TimeoutSec 15
 if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase'){throw 'source_unverified'}
 $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
 function E([string]$n){
   $line=@(Get-Content -LiteralPath $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
   if($line.Count -ne 1){throw 'config_unavailable'}
   return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
 }
 $url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
 if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'source_unverified'}
 $h=@{apikey=$key;Authorization=('Bearer '+$key)}
 $settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -TimeoutSec 20
 $cfg=@{}
 foreach($item in $settings){
   $p=$item.payload;$name=[string]$p.Setting_Name
   if([string]$p.source -eq 'pipeline' -and [string]$p.Active -eq 'true' -and $name -match '^(LA_|MIAMI_|NYC_)?TIKTOK_(HANDLE|PIPELINE_SECRET|WORKER_BASE_URL)$'){
      if($cfg.ContainsKey($name)){throw 'duplicate_setting'}
      $cfg[$name]=[string]$p.Setting_Value
   }
 }
 $owners=@{}
 foreach($e in $exact){
   $r=[ordered]@{output=$e[0];market=$e[2];read_only=$true;owner_verified=$false;status_check_complete=$false;status='';public_id_count=0;publicly_posted_confirmed=$false;provider_status_fetch_calls=0;media_create_calls=0;media_publish_calls=0;output_writes=0;reason='not_started'}
   try{
     $rows=@(Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.'+$e[0]+'&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,auto_publish_enabled,do_not_publish,published_at,platform_post_url,error_messages&limit=2') -Headers $h -TimeoutSec 15)
     if($rows.Count -ne 1){throw 'row_identity'}
     $o=$rows[0]
     if($o.airtable_record_id -ne $e[1] -or $o.platform -ne 'TikTok' -or $o.platform_output_type -ne 'TikTok Video' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.auto_publish_enabled -ne $true -or $o.do_not_publish -ne $false -or $o.published_at -or $o.platform_post_url -or $o.error_messages.TikTok_Draft_Publish_ID -ne $e[3]){throw 'row_drift'}
     $profiles=@(Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name,active,platform_setup&limit=2') -Headers $h -TimeoutSec 15)
     if($profiles.Count -ne 1 -or $profiles[0].market_name -ne $e[2] -or $profiles[0].active -ne $true){throw 'profile_drift'}
     $handle=([string]$profiles[0].platform_setup.TikTok_Handle).TrimStart('@').ToLowerInvariant()
     switch($e[2]){
       'Chicago' {$prefix='';$expected='https://auth.chicagoshining.com';$secret=E 'TIKTOK_PIPELINE_SECRET'}
       'Los Angeles' {$prefix='LA_';$expected='https://auth-la.chicagoshining.com';$secret=$cfg[$prefix+'TIKTOK_PIPELINE_SECRET']}
       'Miami' {$prefix='MIAMI_';$expected='https://auth-miami.chicagoshining.com';$secret=$cfg[$prefix+'TIKTOK_PIPELINE_SECRET']}
       'New York City' {$prefix='NYC_';$expected='https://auth-nyc.chicagoshining.com';$secret=$cfg[$prefix+'TIKTOK_PIPELINE_SECRET']}
       default {throw 'profile_unknown'}
     }
     $base=([string]$cfg[$prefix+'TIKTOK_WORKER_BASE_URL']).TrimEnd('/')
     if($base -ne $expected -or -not $secret -or -not $handle){throw 'owner_config_unavailable'}
     if($prefix -and ([string]$cfg[$prefix+'TIKTOK_HANDLE']).TrimStart('@').ToLowerInvariant() -ne $handle){throw 'owner_handle_config_drift'}
     if(-not $owners.ContainsKey($base)){
       $id=Invoke-RestMethod ($base+'/tiktok/status') -TimeoutSec 20
       $owners[$base]=($id.ok -eq $true -and $id.authorized -eq $true -and ([string]$id.creator_username).TrimStart('@').ToLowerInvariant() -eq $handle)
     }
     if($owners[$base] -ne $true){throw 'owner_unverified'}
     $r.owner_verified=$true
     # Exactly one status read per saved ID, required POST, no media creation.
     $r.provider_status_fetch_calls=1
     $response=Invoke-RestMethod ($base+'/tiktok/draft/status') -Method Post -Headers @{'X-Pipeline-Secret'=$secret;Accept='application/json'} -ContentType 'application/json' -Body (@{publish_id=$e[3]}|ConvertTo-Json -Compress) -TimeoutSec 25
     if($response.ok -ne $true -or $response.publish_id -ne $e[3]){throw 'saved_id_unverified'}
     $r.status_check_complete=$true
     $s=[string]$response.status
     $r.status=if($s -match '^[A-Z_]{1,55}$'){$s}else{'UNKNOWN'}
     $r.public_id_count=@($response.publicly_available_post_ids|Where-Object{[string]$_ -match '^\d{6,40}$'}).Count
     $r.reason=if($s -eq 'SEND_TO_USER_INBOX'){'manual_creator_action_required'}elseif($s -eq 'PUBLISH_COMPLETE'){'exact_public_owner_media_proof_required'}elseif($s -eq 'FAILED'){'failed_no_reinit'}else{'unresolved_no_reinit'}
   }catch{
     $msg=[string]$_.Exception.Message
     $known=@('row_identity','row_drift','profile_drift','profile_unknown','config_unavailable','owner_config_unavailable','owner_handle_config_drift','owner_unverified','saved_id_unverified')
     $r.reason=if($known -contains $msg){$msg}else{'provider_status_unavailable_no_retry'}
   }
   Write-Output ('TT3159_STATUS='+($r|ConvertTo-Json -Compress -Depth 4))
   Start-Sleep -Milliseconds 250
 }
 Write-Output 'TT3159_READBACK=COMPLETE_READONLY'
}catch{throw 'tt3159_preflight_unavailable'}
