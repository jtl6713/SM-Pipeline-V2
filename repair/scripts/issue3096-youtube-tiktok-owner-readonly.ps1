# Issue #3096: original YouTube uploader and TikTok owner-status audit.
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
# Immutable Home exact drilldown census 2026-11-25 22:24Z, job 139551234719.
$targetNumbers=@(4671,5110,5122,5627,5705,5711,5760,5766,5802,5818,5824,5838,5946,5953,5979,6029,6050,6056,6064,6084,6096,6102,6108,6114,6120,6126,6132,6138,6150,6156,6180,6192,6204,6222,6252,6330,6342,6348,6444,6462,6469,6493,6592,6610,6616,6622,6628,6634,6646,6652,6671,7052,7071,10478,10569,10570,10596,10697,10865,10909,10920,10938)
$source=@(Supa ('/rest/v1/platform_outputs?select='+$cols+'&output_number=in.('+($targetNumbers -join ',')+')&limit=63'))
if($source.Count -eq 1 -and $source[0] -is [array]){$source=@($source[0])}
if($source.Count -ne 62 -or @($source.output_number|Sort-Object -Unique).Count -ne 62){throw 'cohort_changed_requires_new_admission'}
$targets=@($source|Where-Object {$_.platform -in @('YouTube','TikTok') -and -not [string]$_.test_run_id})
if($targets.Count -ne 62 -or @($targets|Where-Object{$_.platform -eq 'YouTube'}).Count -ne 57 -or @($targets|Where-Object{$_.platform -eq 'TikTok'}).Count -ne 5){throw 'unexpected_platform_split'}
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
  if($script:httpGets -gt 8){throw 'get_budget_exceeded'}
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
    # Inventory and exact original job linkage are evidence only. No title-only receipt or no-match conclusion.
    $result.source_already_has_receipt=([bool]([string]$o.published_at) -or [bool]([string]$o.platform_post_url))
    $result.started_at=[string]$f.Publish_Started_At
    $result.last_attempt_at=[string]$f.Last_Publish_Attempt_At
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
  version='issue3096_youtube_tiktok_owner_exact_v1';scan_at=$utc;source='production_supabase'
  read_only=$true;provider_media_writes=0;output_writes=0;publish_calls=0;airtable_operations=0
  nonpublication_proved=$false;retry_authorized=$false;targets=$targets.Count
  youtube_targets=57;tiktok_targets=5;http_get_calls=$script:httpGets
  jobstores_seen=$jobSources.Count;jobstore_rows=$jobstoreRows
  provider_owner_coverage=$ownerSummary;counts=$counts;all_output_dispositions=$results
}
Write-Output ('ISSUE3096_YT_TT_OWNER_AUDIT='+($report|ConvertTo-Json -Compress -Depth 9))
