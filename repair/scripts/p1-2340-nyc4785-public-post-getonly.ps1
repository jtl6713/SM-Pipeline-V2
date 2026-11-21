# #2340: independent public owner verification of NYC #4785 manual TikTok post.
# Source, creator identity, public oEmbed GET and exact owned TikTok Display API video query.
# The Display API uses HTTP POST for a read-only video lookup; no media create or publish.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{
 output=4785;profile='New York City';read_only=$true;owner_verified=$false
 source_manual_completed=$false;original_draft_changed=$false
 source_public_post_id='';oembed_public_post_id='';oembed_owner_verified=$false
 provider_public_receipt_verified=$false;exact_approved_media_match_verified=$false
 provider_gets=0;display_api_query_calls=0;owned_video_owned=$false;owned_video_id='';oauth_required_scopes_granted=$false;owned_video_http_status=0;provider_writes=0;output_writes=0;airtable_operations=0
 reason='not_started';stage='preflight'
}
try {
 $r.stage='supabase-authority-check'
 $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
 if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'source_not_supabase'}
 $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
 if(-not(Test-Path $envfile)){throw 'runner_config_unavailable'}
 function E([string]$n){
  $lines=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
  if($lines.Count -ne 1){throw 'runner_config_unavailable'}
  return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
 }
 $url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
 if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_source_project'}
 $h=@{apikey=$key;Authorization=('Bearer '+$key)}
 $r.stage='read-exact-original-row'
 $rows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.4785&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,publish_status,published_at,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 30
 if(@($rows).Count -ne 1){throw 'original_output_missing_or_duplicate'}
 $o=$rows[0]
 $postId=[string]$o.error_messages.Platform_Post_ID
 $manual=[string]$o.error_messages.Manual_Completion_Status
 $draftId=[string]$o.error_messages.TikTok_Draft_Publish_ID
 $link=[string]$o.platform_post_url
 if($o.airtable_record_id -ne 'recDpfbqDdQjCAgNo' -or $o.platform -ne 'TikTok' -or
    $o.platform_output_type -ne 'TikTok Video' -or $o.publish_status -ne 'Published' -or
    -not $o.published_at -or $manual -ne 'Completed' -or
    $postId -ne '7710614609517923615' -or $link -ne 'https://www.tiktok.com/t/ZTPQG9mGw/'){throw 'source_manual_receipt_drift'}
 $r.source_manual_completed=$true
 $r.source_public_post_id=$postId
 $r.original_draft_changed=($draftId -ne 'v_inbox_url~v2.7706207567982462989')
 $p=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
 if(@($p).Count -ne 1 -or $p[0].market_name -ne 'New York City'){throw 'profile_mismatch'}
 $r.stage='read-exact-creator-config'
 $settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 30
 $cfg=@{}
 foreach($item in $settings){
  $x=$item.payload
  if([string]$x.source -ne 'pipeline' -or [string]$x.Active -ne 'True'){continue}
  $n=[string]$x.Setting_Name
  if(@('NYC_TIKTOK_HANDLE','NYC_TIKTOK_WORKER_BASE_URL','NYC_TIKTOK_PIPELINE_SECRET') -contains $n){
    if($cfg.ContainsKey($n)){throw 'duplicate_active_credential_config'}
    $cfg[$n]=[string]$x.Setting_Value
  }
 }
 $expected=([string]$cfg.NYC_TIKTOK_HANDLE).TrimStart('@').ToLowerInvariant()
 $base=[string]$cfg.NYC_TIKTOK_WORKER_BASE_URL
 if($base -ne 'https://auth-nyc.chicagoshining.com' -or $expected -ne 'nyshining8'){throw 'configured_tiktok_owner_mismatch'}
 $r.stage='owned-tiktok-creator-get'
 $r.provider_gets++
 $ident=Invoke-RestMethod ($base+'/tiktok/status') -Method Get -TimeoutSec 35
 $actual=([string]$ident.creator_username).TrimStart('@').ToLowerInvariant()
 if($ident.ok -ne $true -or $ident.authorized -ne $true -or $actual -ne $expected){throw 'creator_oauth_owner_not_verified'}
 $r.owner_verified=$true
 $r.oauth_required_scopes_granted=($ident.required_scopes_granted -eq $true)
 $r.stage='public-saved-url-oembed-get'
 $embedUrl='https://www.tiktok.com/oembed?url='+[uri]::EscapeDataString($link)
 $r.provider_gets++
 $embed=Invoke-RestMethod -Uri $embedUrl -Method Get -TimeoutSec 45
 $returned=[string]$embed.embed_product_id
 $author=([string]$embed.author_unique_id).TrimStart('@').ToLowerInvariant()
 $authorFromUrl=''
 $rawAuthorUrl=[string]$embed.author_url
 # TikTok oEmbed author links can have query parameters. Validate exact HTTPS
 # official host and canonical /@handle path to avoid accepting other users.
 if($rawAuthorUrl){
   $authorUri=$null
   if([Uri]::TryCreate($rawAuthorUrl,[UriKind]::Absolute,[ref]$authorUri) -and
      $authorUri.Scheme -eq 'https' -and $authorUri.Host -eq 'www.tiktok.com' -and
      $authorUri.AbsolutePath -match '^/@([A-Za-z0-9._]{2,40})/?$'){
     $authorFromUrl=$Matches[1].ToLowerInvariant()
   }
 }
 if(-not $author){$author=$authorFromUrl}
 $r.oembed_public_post_id=$returned
 $r.oembed_owner_verified=($author -eq $expected -and
    (-not $authorFromUrl -or $authorFromUrl -eq $expected))
 $r.oembed_author_handle=if($author -match '^[a-z0-9._]{2,40}$'){$author}else{'unavailable'}
 $r.oembed_author_url_handle=if($authorFromUrl -match '^[a-z0-9._]{2,40}$'){$authorFromUrl}else{'unavailable'}
 # oEmbed often omits author fields; require authenticated original-account
 # TikTok Display API exact-video ownership instead of trusting public embeds.
 if($returned -ne $postId){throw 'public_link_video_id_mismatch'}
 $ownerSecret=[string]$cfg.NYC_TIKTOK_PIPELINE_SECRET
 if(-not $ownerSecret){throw 'owned_video_secret_missing'}
 $r.stage='exact-owned-video-analytics-query'
 $r.display_api_query_calls=1
 $payload=@{video_ids=@($postId)}|ConvertTo-Json -Compress -Depth 4
 $owned=Invoke-RestMethod ($base+'/tiktok/analytics/videos') -Method Post -Headers @{'X-Pipeline-Secret'=$ownerSecret} -ContentType 'application/json' -Body $payload -TimeoutSec 45
 if($owned.ok -ne $true -or $owned.source -ne 'tiktok-display-api'){throw 'owned_video_provider_unavailable'}
 $videos=@($owned.videos)
 if($videos.Count -ne 1 -or [string]$videos[0].id -ne $postId){throw 'exact_owned_public_video_not_returned'}
 $r.owned_video_owned=$true
 $r.owned_video_id=[string]$videos[0].id
 $r.provider_public_receipt_verified=($returned -eq $postId -and $r.owner_verified -and $r.owned_video_owned)
 $r.reason=if($r.provider_public_receipt_verified){'original_manual_public_post_id_exact_tiktok_owned_account_verified_media_fingerprint_unverified'}else{'owned_video_identity_not_verified_no_retry'}
 $r.stage='completed'
}catch{
 $known=@('source_not_supabase','runner_config_unavailable','wrong_source_project','original_output_missing_or_duplicate','source_manual_receipt_drift','profile_mismatch','duplicate_active_credential_config','configured_tiktok_owner_mismatch','creator_oauth_owner_not_verified','public_link_video_id_mismatch','owned_video_secret_missing','owned_video_provider_unavailable','exact_owned_public_video_not_returned')
 $message=[string]$_.Exception.Message
 $r.reason=if($known -contains $message){$message}else{'public_provider_get_unavailable_no_retry'}
 if($r.stage -eq 'exact-owned-video-analytics-query'){
   $http=0
   try{$http=[int]$_.Exception.Response.StatusCode}catch{}
   $r.owned_video_http_status=$http
   if($http -eq 401){$r.reason='owned_video_worker_authorization_denied_no_retry'}
   elseif($http -eq 403){$r.reason='tiktok_video_list_scope_or_access_denied_no_retry'}
   elseif($http -eq 404){$r.reason='owned_video_query_route_missing_no_retry'}
   elseif($http -eq 429){$r.reason='owned_video_provider_rate_limited_no_retry'}
   elseif($http -ge 500){$r.reason='owned_video_provider_server_error_no_retry'}
   elseif($http -eq 400){$r.reason='owned_video_query_bad_request_no_retry'}
 }
}
Write-Output ('P1_NYC4785_PUBLIC_PROOF='+($r|ConvertTo-Json -Depth 5 -Compress))
