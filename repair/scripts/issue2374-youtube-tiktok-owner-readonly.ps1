# Issue #2374: original YouTube uploader and TikTok owner-status audit.
# All source/provider requests are GET only. A missing job, video or status
# NEVER proves nonpublication or permits retry, approval or scheduling.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_absent'}
function EnvVal([string]$name) {
  $line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
  if($line.Count -ne 1){throw 'missing_source_config'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$su=(EnvVal 'SUPABASE_URL').TrimEnd('/')
$key=EnvVal 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_supabase_project_or_credentials'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
function Supa([string]$path) {
  if($path -notmatch '^/rest/v1/(platform_outputs|content_profiles|engagement_settings)\?'){throw 'disallowed_source_read'}
  return Invoke-RestMethod ($su+$path) -Headers $headers -Method Get -TimeoutSec 45
}
$utc=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$cols='output_number,airtable_record_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,scheduled_post_date,published_at,platform_post_url,test_run_id,output_title,output_caption,final_file_url,studio_preview_url,do_not_publish,auto_publish_enabled,publish_retry_eligible,error_messages'
$source=@(Supa ('/rest/v1/platform_outputs?select='+$cols+'&review_status=eq.Approved&output_status=eq.Approved%20for%20Publishing&scheduled_post_date=lt.'+$utc+'&published_at=is.null&limit=800'))
if($source.Count -eq 1 -and $source[0] -is [array]){$source=@($source[0])}
if($source.Count -ge 800){throw 'overdue_cohort_pagination_incomplete'}
$targets=@($source|Where-Object {
  $_.platform -in @('YouTube','TikTok') -and
  -not [string]$_.published_at -and -not [string]$_.platform_post_url -and
  -not [string]$_.test_run_id
})
$targetNumbers=@($targets|ForEach-Object{[int]$_.output_number}|Sort-Object -Unique)
if($targets.Count -ne 21 -or $targetNumbers.Count -ne 21){throw 'cohort_changed_requires_new_admission'}
if(@($targets|Where-Object{-not $_.error_messages.Studio_Overdue_Evidence_Audit_20261120}).Count -ne 0){throw 'unexpected_noncohort_output'}
if(@($targets|Where-Object{$_.platform -eq 'YouTube'}).Count -ne 13 -or @($targets|Where-Object{$_.platform -eq 'TikTok'}).Count -ne 8){throw 'unexpected_platform_split'}
$profileRows=@(Supa '/rest/v1/content_profiles?select=id,market_name&limit=20')
if($profileRows.Count -eq 1 -and $profileRows[0] -is [array]){$profileRows=@($profileRows[0])}
$market=@{}
foreach($p in $profileRows){$market[[string]$p.id]=[string]$p.market_name}
$prefix=@{'Chicago'='';'Los Angeles'='LA_';'Miami'='MIAMI_';'New York City'='NYC_'}
foreach($o in $targets){if(-not $prefix.ContainsKey([string]$market[[string]$o.content_profile_id])){throw 'output_owner_not_verified'}}
$settings=@(Supa '/rest/v1/engagement_settings?select=payload&limit=500')
if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
if($settings.Count -ge 500){throw 'incomplete_provider_settings'}
$vals=@{}
foreach($s in $settings) {
  $f=$s.payload
  if($null -eq $f -or [string]$f.source -ne 'pipeline' -or [string]$f.Active -ne 'True'){continue}
  $name=[string]$f.Setting_Name
  if($name -match '^((LA_|MIAMI_|NYC_)?(YOUTUBE_CHANNEL_ID|YOUTUBE_UPLOAD_SERVICE_URL|YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET|TIKTOK_HANDLE))$'){
    if($vals.ContainsKey($name)){throw 'duplicate_active_setting'}
    $vals[$name]=[string]$f.Setting_Value
  }
}
$script:httpGets=0
function SafeGet([string]$url,$h=@{}) {
  $u=$null
  try{$u=[uri]$url}catch{throw 'unsafe_url'}
  if($u.Scheme -ne 'https' -or $u.Host -notmatch '(^|\.)chicagoshining\.com$' -or $u.Port -ne 443 -or
     $u.UserInfo -or $u.Fragment){throw 'unauthorized_diagnostic_host'}
  $script:httpGets++
  if($script:httpGets -gt 12){throw 'get_budget_exceeded'}
  try {
    $d=Invoke-RestMethod $url -Headers $h -Method Get -TimeoutSec 90
    return @{ok=$true;http=200;data=$d}
  } catch {
    $code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{}
    return @{ok=$false;http=$code;data=$null}
  }
}
function Norm([string]$s){return ([regex]::Replace($s.ToLowerInvariant(),'[^a-z0-9]+',' ')).Trim()}
# Read-only local original uploader idempotency ledger. Absence is INCONCLUSIVE
# when a jobstore may be on another machine or has retention limits.
$root=(Get-Location).Path
$service=Join-Path $root 'Services\youtube-uploader\service'
$paths=@((Join-Path $service 'data\youtube-jobs.json'),(Join-Path $service 'youtube-jobs.json'),(Join-Path $root 'services\youtube-uploader\data\youtube-jobs.json'))
$youtubeEnv=Join-Path $service '.env'
if(Test-Path $youtubeEnv){
  $j=@(Get-Content $youtubeEnv|Where-Object{$_ -match '^YOUTUBE_JOB_STORE='}|Select-Object -Last 1)
  if($j.Count -eq 1){
    $v=([string]$j[0] -split '=',2)[1].Trim().Trim('"',"'")
    if($v){
      $f=if([IO.Path]::IsPathRooted($v)){$v}else{Join-Path $service $v}
      if([IO.Path]::GetFullPath($f).StartsWith([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){$paths=@($f)+$paths}
    }
  }
}
$jobs=@{};$jobSources=@()
foreach($file in @($paths|Select-Object -Unique)){
  if(-not (Test-Path $file)){continue}
  try {
    $data=@(Get-Content -Raw $file|ConvertFrom-Json)
    if($data.Count -gt 100000){throw 'jobstore_too_large'}
    foreach($j in $data) {
      $id=[string]$j.id
      if(-not $id){continue}
      if(-not $jobs.ContainsKey($id)){$jobs[$id]=$j}
    }
    $jobSources+=@{available=$true;rows=$data.Count}
  } catch {$jobSources+=@{available=$false;reason='unreadable_original_jobstore'}}
}
# Owner-bound source-of-truth YouTube uploads inventory; video listing GET
# validates uploaded channel through the uploader itself. This endpoint uses
# the existing OAuth configuration; it does not upload or modify videos.
$ytOwner=@{};$ttOwner=@{}
foreach($city in @('Chicago','Los Angeles','Miami','New York City')) {
  $pr=$prefix[$city]
  $base=[string]$vals[$pr+'YOUTUBE_UPLOAD_SERVICE_URL']
  $chan=[string]$vals[$pr+'YOUTUBE_CHANNEL_ID']
  $secret=[string]$vals[$pr+'YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']
  if(-not $secret){$secret=[string]$vals['YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']}
  $owner=@{ok=$false;state='youtube_uploader_unavailable';videos=@();complete=$false;pages=0;ids=0}
  if($chan -match '^UC[A-Za-z0-9_-]{22}$' -and $base -and $secret){
    $url=$base.TrimEnd('/')+'/youtube/channel/uploads?expected_channel_id='+$chan
    $response=SafeGet $url @{'X-SM-Pipeline-Key'=$secret;Accept='application/json'}
    if($response.ok -and $response.data.read_only -eq $true -and
       [string]$response.data.channel_id -eq $chan -and $response.data.provider_media_writes -eq 0 -and
       $response.data.output_writes -eq 0){
      $owner.ok=$true
      $owner.state='owner_authenticated_inventory'
      $owner.videos=@($response.data.videos)
      $owner.complete=($response.data.complete -eq $true)
      $owner.pages=[int]$response.data.playlist_pages_scanned
      $owner.ids=[int]$response.data.video_ids_seen
      $owner.missing_details=[int]$response.data.missing_video_details
    }else{$owner.state='uploader_get_failed_or_owner_mismatch';$owner.http=$response.http}
  }else{$owner.state='incomplete_uploader_account_config'}
  $ytOwner[$city]=$owner
  $ttHosts=@{'Chicago'='auth.chicagoshining.com';'Los Angeles'='auth-la.chicagoshining.com';'Miami'='auth-miami.chicagoshining.com';'New York City'='auth-nyc.chicagoshining.com'}
  $statusHost=[string]$ttHosts[$city]
  if(-not $statusHost){throw 'unknown_tiktok_status_owner'}
  $tt=SafeGet ('https://'+$statusHost+'/tiktok/status') @{Accept='application/json'}
  $expected=([string]$vals[$pr+'TIKTOK_HANDLE']).ToLowerInvariant().TrimStart('@')
  $actual=([string]$tt.data.creator_username).ToLowerInvariant().TrimStart('@')
  $ttOwner[$city]=@{
    state=if(-not $tt.ok){'oauth_status_get_unavailable'}elseif($tt.data.ok -ne $true -or $tt.data.authorized -ne $true){'tiktok_oauth_not_confirmed'}elseif($expected -and $expected -ne $actual){'tiktok_account_handle_mismatch'}elseif(-not $expected){'expected_creator_not_configured'}else{'tiktok_connected_creator_confirmed'}
    get_http=$tt.http
    oauth_authorized=($tt.ok -and $tt.data.authorized -eq $true)
    scopes_granted=($tt.ok -and $tt.data.required_scopes_granted -eq $true)
    expected_handle_present=([bool]$expected)
  }
}
$results=@()
foreach($o in $targets) {
  $n=[int]$o.output_number;$city=[string]$market[[string]$o.content_profile_id]
  $f=$o.error_messages;$state='unverified'
  $result=@{
    output=$n;profile=$city;platform=[string]$o.platform;type=[string]$o.platform_output_type
    published_verified=$false;retry_authorized=$false
    previous_dispatch=([int]$f.Studio_Publish_Dispatch_Count -gt 0 -or [int]$f.Publish_Attempt_Count -gt 0)
    original_hold=($o.do_not_publish -eq $true)
    has_final=([bool]([string]$o.final_file_url))
    has_preview=([bool]([string]$o.studio_preview_url))
  }
  if($o.platform -eq 'TikTok'){
    $owner=$ttOwner[$city]
    $draft=[string]$f.TikTok_Draft_Publish_ID
    $state=if($draft){'saved_inbox_draft_not_publication_receipt'}elseif([string]$o.publish_status -eq 'Published'){'published_label_without_receipt'}else{'no_public_receipt_tiktok_status_only'}
    $result.oauth_state=$owner.state
    $result.oauth_authorized=$owner.oauth_authorized
    $result.required_scopes_granted=$owner.scopes_granted
    $result.saved_inbox_draft=([bool]$draft)
    $result.attempt_count=[int]$f.Publish_Attempt_Count
    $result.dispatch_count=[int]$f.Studio_Publish_Dispatch_Count
  }else{
    $owner=$ytOwner[$city]
    $savedId=[string]$f.YouTube_Video_ID
    $matchedJobs=@($jobs.Values|Where-Object{[string]$_.outputRecordId -eq [string]$o.airtable_record_id})
    $jobIds=@($matchedJobs|Where-Object{[string]$_.videoId}|ForEach-Object{[string]$_.videoId}|Sort-Object -Unique)
    $remote=@($owner.videos|Where-Object{[string]$_.id -eq $savedId -and $savedId} )
    $title=Norm ([string]$o.output_title)
    $titleHits=@($owner.videos|Where-Object{$title.Length -ge 24 -and (Norm ([string]$_.title)) -eq $title})
    # Exact owner-bound YouTube GETs for the only three matching-title
    # candidates and held saved video ID. A title match, even with a plausible
    # dispatch time and matching caption, never authenticates the original
    # video ASSET; no output can be marked published by this diagnostic.
    $exactIds=@()
    if($n -eq 4869){$exactIds=@('cHKqYIVxQNw','fUNK_Wc4vkM')}
    elseif($n -eq 1771){$exactIds=@('6SGaMlwGsiI')}
    elseif($n -eq 5201 -and $savedId -eq 'Ls65TemEHSo'){$exactIds=@('Ls65TemEHSo')}
    $exactResults=@()
    foreach($candidateId in $exactIds){
      $listed=@($owner.videos|Where-Object{[string]$_.id -eq $candidateId})
      if(-not $owner.ok -or ($n -ne 5201 -and $listed.Count -ne 1)){
        $exactResults+=@{id=$candidateId;state='owner_inventory_missing_or_candidate_changed';verified_public=$false;asset_match_verified=$false}
        continue
      }
      $exactBase=([string]$vals[$prefix[$city]+'YOUTUBE_UPLOAD_SERVICE_URL']).TrimEnd('/')
      $exactSecret=[string]$vals[$prefix[$city]+'YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']
      if(-not $exactSecret){$exactSecret=[string]$vals['YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']}
      $expectedChannel=[string]$vals[$prefix[$city]+'YOUTUBE_CHANNEL_ID']
      if(-not $exactBase -or -not $exactSecret -or $expectedChannel -notmatch '^UC[A-Za-z0-9_-]{22}$'){
        $exactResults+=@{id=$candidateId;state='exact_get_configuration_unavailable';verified_public=$false;asset_match_verified=$false}
        continue
      }
      $get=SafeGet ($exactBase+'/youtube/videos/'+$candidateId) @{'X-SM-Pipeline-Key'=$exactSecret;Accept='application/json'}
      $items=@($get.data.items|Where-Object{$null -ne $_ -and [string]$_.id -eq $candidateId})
      if(-not $get.ok -or $items.Count -ne 1){
        $exactResults+=@{id=$candidateId;state='exact_get_not_confirmed_no_negative_proof';http=$get.http;verified_public=$false;asset_match_verified=$false}
        continue
      }
      $video=$items[0]
      if([string]$video.snippet.channelId -ne $expectedChannel){
        $exactResults+=@{id=$candidateId;state='exact_get_wrong_owner';http=$get.http;verified_public=$false;asset_match_verified=$false}
        continue
      }
      $desc=Norm ([string]$video.snippet.description)
      $caption=Norm ([string]$o.output_caption)
      $lead=if($caption.Length -ge 72){$caption.Substring(0,72)}else{''}
      $dispatchIso=[string]$f.Studio_Publish_Dispatch_At
      $referenceIso=if($dispatchIso){$dispatchIso}else{[string]$o.scheduled_post_date}
      $delta=$null
      try{
        $candidateUtc=[DateTimeOffset]::Parse([string]$video.snippet.publishedAt)
        $referenceUtc=[DateTimeOffset]::Parse($referenceIso)
        $delta=[math]::Round(($candidateUtc-$referenceUtc).TotalSeconds)
      }catch{}
      $titleExact=((Norm ([string]$video.snippet.title)) -eq $title)
      $descExact=($caption.Length -ge 72 -and $desc -eq $caption)
      $descLead=([bool]$lead -and $desc.Contains($lead))
      $privacy=[string]$video.status.privacyStatus
      $exactResults+=@{
        id=$candidateId;state='exact_owner_metadata_requires_asset_proof'
        http=$get.http;provider_owner_verified=$true
        public_visibility_reported=($privacy -eq 'public')
        remote_privacy=$privacy;remote_upload_status=[string]$video.status.uploadStatus
        provider_published_at=[string]$video.snippet.publishedAt
        reference_time_kind=if($dispatchIso){'dispatch'}else{'scheduled'}
        seconds_after_reference=$delta
        exact_title_match=$titleExact
        exact_normalized_caption_match=$descExact
        caption_lead_72_match=$descLead
        same_owner_title_collision=($titleHits.Count -gt 1)
        verified_public=$false;asset_match_verified=$false;retry_authorized=$false
      }
    }
    $result.exact_video_checks=$exactResults
    $state=if(-not $owner.ok){'youtube_owner_inventory_unavailable_no_negative_proof'}elseif($savedId -and $remote.Count -eq 1){'saved_video_id_found_in_owner_uploads'}elseif($jobIds.Count -gt 0){'original_jobstore_video_id_needs_exact_get'}elseif($titleHits.Count -gt 0){'same_owner_title_candidate_needs_asset_and_time_review'}else{'no_exact_youtube_proof_no_negative_delivery_claim'}
    $result.owner_inventory_state=$owner.state
    $result.owner_inventory_complete=$owner.complete
    $result.owner_video_ids_scanned=$owner.ids
    $result.original_jobstore_scanned=($jobSources.Count -gt 0)
    $result.matching_original_job_count=$matchedJobs.Count
    $result.matching_job_video_ids=$jobIds
    $result.saved_video_id_present=([bool]$savedId)
    $result.saved_video_in_owner_uploads=($remote.Count -eq 1)
    $result.saved_video_id=if($savedId){$savedId}else{$null}
    $result.same_owner_title_candidates=@($titleHits|ForEach-Object{@{id=[string]$_.id;privacy=[string]$_.privacy_status;published_at=[string]$_.published_at}})
    if($remote.Count -eq 1){$result.remote_privacy=[string]$remote[0].privacy_status;$result.remote_published_at=[string]$remote[0].published_at}
  }
  $result.state=$state
  $results+=$result
}
$counts=@{}
foreach($row in $results){if(-not $counts.ContainsKey($row.state)){$counts[$row.state]=0};$counts[$row.state]++}
$ownerSummary=@()
foreach($city in @('Chicago','Los Angeles','Miami','New York City')) {
  $o=$ytOwner[$city];$t=$ttOwner[$city]
  $ownerSummary+=@{profile=$city;youtube_owner_state=$o.state;youtube_owner_inventory_complete=$o.complete;youtube_ids_seen=$o.ids;youtube_pages_scanned=$o.pages;tiktok_oauth_state=$t.state;tiktok_scopes_granted=$t.scopes_granted}
}
$jobstoreRows=0
foreach($source in $jobSources){if($source.available -eq $true -and $null -ne $source.rows){$jobstoreRows += [int]$source.rows}}
$report=@{
  version='issue2374_youtube_tiktok_owner_exact_v2';scan_at=$utc;source='production_supabase'
  read_only=$true;provider_media_writes=0;output_writes=0;publish_calls=0;airtable_operations=0
  nonpublication_proved=$false;retry_authorized=$false;targets=$targets.Count
  youtube_targets=13;tiktok_targets=8;http_get_calls=$script:httpGets
  jobstores_seen=$jobSources.Count;jobstore_rows=$jobstoreRows
  provider_owner_coverage=$ownerSummary;counts=$counts;all_output_dispositions=$results
}
Write-Output ('ISSUE2374_YT_TT_OWNER_AUDIT='+($report|ConvertTo-Json -Compress -Depth 9))
