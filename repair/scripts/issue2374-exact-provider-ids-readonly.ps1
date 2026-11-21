# Issue #2374: strict, evidence-only exact-ID owner GET.
# This script NEVER publishes, retries, reschedules, or updates source records.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not (Test-Path $envfile)){throw 'runner_env_missing'}
function EnvVal([string]$name){
  $lines=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
  if($lines.Count -ne 1){throw 'runner_configuration_missing'}
  return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$su=(EnvVal 'SUPABASE_URL').TrimEnd('/')
$key=EnvVal 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_supabase_project_or_credentials'}
$sh=@{apikey=$key;Authorization=('Bearer '+$key)}
function Supa([string]$path){
  if($path -notmatch '^/rest/v1/(platform_outputs|content_profiles|engagement_settings)\?'){throw 'disallowed_source_read'}
  return Invoke-RestMethod ($su+$path) -Headers $sh -Method Get -TimeoutSec 45
}
$storyNums=@(1353,1868,2283,2561,2859,2877,3029,3101,3224,4069,4940)
$reelTargets=@(
  @{n=3652;video='1650680156459705';city='Los Angeles';prefix='LA_'},
  @{n=5005;video='1429904032686729';city='New York City';prefix='NYC_'}
)
$allNums=@($storyNums)+@($reelTargets|ForEach-Object{$_.n})
if(@($allNums|Select-Object -Unique).Count -ne 13){throw 'duplicate_target_numbers'}
$select='output_number,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,output_caption,output_hashtags,published_at,platform_post_url,error_messages'
$rows=@(Supa ('/rest/v1/platform_outputs?select='+$select+'&output_number=in.('+(($allNums|ForEach-Object{[string]$_}) -join ',')+')&limit=14'))
if($rows.Count -eq 1 -and $rows[0] -is [array]){$rows=@($rows[0])}
if($rows.Count -ne 13){throw 'exact_target_snapshot_incomplete'}
$profiles=@(Supa '/rest/v1/content_profiles?select=id,market_name&limit=20')
if($profiles.Count -eq 1 -and $profiles[0] -is [array]){$profiles=@($profiles[0])}
$market=@{};$prefixes=@{'Chicago'='';'Los Angeles'='LA_';'Miami'='MIAMI_';'New York City'='NYC_'}
foreach($p in $profiles){$market[[string]$p.id]=[string]$p.market_name}
$record=@{};$storyIds=@{}
foreach($o in $rows){
  $n=[int]$o.output_number
  if($record.ContainsKey($n)){throw 'duplicated_target_output'}
  $record[$n]=$o
  $city=[string]$market[[string]$o.content_profile_id]
  if(-not $prefixes.ContainsKey($city)){throw 'target_profile_not_authorized'}
  if($storyNums -contains $n){
    $id=[string]$o.error_messages.IG_Story_Post_ID
    if($o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or
       $o.output_status -ne 'Published' -or $o.publish_status -ne 'Published' -or
       -not $o.published_at -or $id -notmatch '^\d{6,30}$'){throw 'story_saved_identity_changed'}
    if($storyIds.ContainsKey($id)){throw 'story_remote_id_used_by_multiple_outputs'}
    $storyIds[$id]=$n
  }else{
    $match=@($reelTargets|Where-Object{$_.n -eq $n})
    if($match.Count -ne 1 -or $city -ne $match[0].city -or $o.platform -ne 'Facebook' -or
       $o.platform_output_type -ne 'Facebook Reel' -or $o.output_status -ne 'Approved for Publishing' -or
       $o.review_status -ne 'Approved' -or $o.published_at -or [string]$o.platform_post_url){throw 'reel_unverified_source_state_changed'}
  }
}
$settings=@(Supa '/rest/v1/engagement_settings?select=payload&limit=500')
if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
if($settings.Count -ge 500){throw 'settings_scan_incomplete'}
$values=@{}
foreach($s in $settings){
  $p=$s.payload
  if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
  $name=[string]$p.Setting_Name
  if($name -match '^(META_GRAPH_API_VERSION|FACEBOOK_GRAPH_API_VERSION|(LA_|MIAMI_|NYC_)?(META_GRAPH_API_ACCESS_TOKEN|INSTAGRAM_BUSINESS_ACCOUNT_ID|FACEBOOK_PAGE_ACCESS_TOKEN|FACEBOOK_PAGE_ID))$'){
    if($values.ContainsKey($name)){throw 'duplicate_active_provider_credential'}
    $values[$name]=[string]$p.Setting_Value
  }
}
$igVersion=[string]$values['META_GRAPH_API_VERSION'];$fbVersion=[string]$values['FACEBOOK_GRAPH_API_VERSION']
if($igVersion -notmatch '^v\d{1,2}\.\d$'){$igVersion='v26.0'}
if($fbVersion -notmatch '^v\d{1,2}\.\d$'){$fbVersion='v26.0'}
$script:graphGets=0
function G([string]$uri,[string]$token){
  $parsed=$null;try{$parsed=[uri]$uri}catch{throw 'invalid_graph_url'}
  if($parsed.Scheme -ne 'https' -or $parsed.Host -ne 'graph.facebook.com' -or -not $token){throw 'provider_host_or_token_invalid'}
  $script:graphGets++
  if($script:graphGets -gt 70){throw 'graph_get_budget_exceeded'}
  try{
    $data=Invoke-RestMethod $uri -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -Method Get -TimeoutSec 40
    return @{ok=$true;http=200;data=$data}
  }catch{
    $status=0;try{$status=[int]$_.Exception.Response.StatusCode}catch{}
    return @{ok=$false;http=$status;data=$null}
  }
}
function Norm([string]$s){return ([regex]::Replace($s.ToLowerInvariant(),'\s+',' ').Trim())}
function AsTime($s){
  $dt=[DateTimeOffset]::MinValue
  if([DateTimeOffset]::TryParse([string]$s,[ref]$dt)){return $dt}
  return $null
}
function Owner([string]$city,[string]$kind){
  $pr=$prefixes[$city]
  $idKey=if($kind -eq 'Instagram'){$pr+'INSTAGRAM_BUSINESS_ACCOUNT_ID'}else{$pr+'FACEBOOK_PAGE_ID'}
  $tokenKey=if($kind -eq 'Instagram'){$pr+'META_GRAPH_API_ACCESS_TOKEN'}else{$pr+'FACEBOOK_PAGE_ACCESS_TOKEN'}
  $id=[string]$values[$idKey];$token=[string]$values[$tokenKey]
  $ver=if($kind -eq 'Instagram'){$igVersion}else{$fbVersion}
  if($id -notmatch '^\d{6,30}$' -or -not $token){return @{ok=$false;reason='scope_credentials_unavailable'}}
  $check=G ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id') $token
  if(-not $check.ok -or [string]$check.data.id -ne $id){return @{ok=$false;reason='owner_identity_get_unavailable'}}
  return @{ok=$true;id=$id;token=$token;version=$ver}
}
$findings=@()
# IG: require BOTH fresh exact media ID GET and an owner-account /stories
# listing match (which itself establishes native STORY format). Graph errors,
# expiry and incomplete pages NEVER prove non-publication.
foreach($city in @('Chicago','Los Angeles','Miami','New York City')){
  $items=@($rows|Where-Object{$storyNums -contains [int]$_.output_number -and [string]$market[[string]$_.content_profile_id] -eq $city})
  if($items.Count -eq 0){continue}
  $owner=Owner $city 'Instagram'
  if(-not $owner.ok){
    foreach($o in $items){$findings+=@{output=[int]$o.output_number;profile=$city;kind='Instagram Story';state='owner_get_unavailable';reason=$owner.reason}}
    continue
  }
  $all=@();$pages=0;$complete=$false;$edgeState='owner_stories_get_unavailable'
  $next='https://graph.facebook.com/'+$owner.version+'/'+$owner.id+'/stories?fields=id,timestamp,media_type&limit=100'
  while($next -and $pages -lt 4){
    $r=G $next $owner.token
    if(-not $r.ok -or $null -eq $r.data.data){break}
    $all+=@($r.data.data);$pages++
    $next=[string]$r.data.paging.next
    if(-not $next){$complete=$true;$edgeState='complete';break}
    $edgeState='owner_stories_page_incomplete'
  }
  foreach($o in $items){
    $id=[string]$o.error_messages.IG_Story_Post_ID
    $match=@($all|Where-Object{[string]$_.id -eq $id})
    $result=@{output=[int]$o.output_number;profile=$city;kind='Instagram Story';remote_id=$id;owner_edge=$edgeState;pages_read=$pages;state='unverified'}
    if(-not $complete){$result.state='owner_stories_scan_incomplete_no_negative_proof'}
    elseif($match.Count -ne 1){$result.state='no_exact_owner_story_match_no_negative_proof'}
    else{
      $exact=G ('https://graph.facebook.com/'+$owner.version+'/'+$id+'?fields=id,timestamp,media_type') $owner.token
      if(-not $exact.ok -or [string]$exact.data.id -ne $id){$result.state='exact_story_get_unavailable'}
      else{
        $saved=AsTime $o.published_at
        $provider=AsTime $exact.data.timestamp
        $edgeTime=AsTime $match[0].timestamp
        if(-not $provider -or -not $edgeTime -or -not $saved){$result.state='story_timestamp_unavailable'}
        elseif([Math]::Abs(($provider-$saved).TotalMinutes) -gt 20 -or [Math]::Abs(($edgeTime-$provider).TotalMinutes) -gt 1){$result.state='story_timestamp_mismatch'}
        else{$result.state='exact_owner_story_verified_without_public_permalink';$result.provider_timestamp=$provider.ToString('o')}
      }
    }
    $findings+=$result
  }
}
# FB Reel: candidate ID found in a page's video_reels listing is still only
# an identity candidate. Exact GET must agree on id, text, status/permalink and
# time. Asset fingerprint + separate safe reconciliation are still required.
foreach($t in $reelTargets){
  $o=$record[[int]$t.n];$owner=Owner $t.city 'Facebook'
  $result=@{output=[int]$t.n;profile=$t.city;kind='Facebook Reel';remote_id=$t.video;state='unverified'}
  if(-not $owner.ok){$result.state='owner_get_unavailable';$findings+=$result;continue}
  $all=@();$pages=0;$complete=$false
  $next='https://graph.facebook.com/'+$owner.version+'/'+$owner.id+'/video_reels?fields=id,description,updated_time&limit=100'
  while($next -and $pages -lt 5){
    $r=G $next $owner.token
    if(-not $r.ok -or $null -eq $r.data.data){break}
    $all+=@($r.data.data);$pages++
    $next=[string]$r.data.paging.next
    if(-not $next){$complete=$true;break}
  }
  $match=@($all|Where-Object{[string]$_.id -eq [string]$t.video})
  $result.pages_read=$pages
  if($match.Count -ne 1){$result.state='not_found_in_bounded_owner_reels_no_negative_proof';$findings+=$result;continue}
  $exact=G ('https://graph.facebook.com/'+$owner.version+'/'+$t.video+'?fields=id,description,status,created_time,permalink_url') $owner.token
  if(-not $exact.ok -or [string]$exact.data.id -ne $t.video){$result.state='exact_reel_get_unavailable';$findings+=$result;continue}
  $caption=Norm ([string]$o.output_caption)
  $remoteText=Norm ([string]$exact.data.description)
  $edgeText=Norm ([string]$match[0].description)
  if($caption.Length -lt 85 -or $remoteText.Length -lt 85 -or $edgeText.Length -lt 85 -or
     (-not $remoteText.StartsWith($caption.Substring(0,[Math]::Min(115,$caption.Length)))) -or
     (-not $edgeText.StartsWith($caption.Substring(0,[Math]::Min(115,$caption.Length))))){
    $result.state='exact_id_reel_caption_mismatch';$findings+=$result;continue
  }
  $dispatch=AsTime $o.error_messages.Studio_Publish_Dispatch_At
  $created=AsTime $exact.data.created_time
  if(-not $dispatch -or -not $created){$result.state='exact_reel_creation_time_missing';$findings+=$result;continue}
  $delta=[Math]::Abs(($created-$dispatch).TotalSeconds)
  $result.creation_dispatch_delta_seconds=[Math]::Round($delta)
  if($delta -gt 600){$result.state='remote_reel_time_mismatch_do_not_reconcile';$findings+=$result;continue}
  $status=[string]$exact.data.status.video_status
  $link=[string]$exact.data.permalink_url
  if($status -notin @('PUBLISHED','LIVE') -or $link -notmatch '^https://(www\.)?facebook\.com/(reel/|[^?#]+/videos/)'){
    $result.state='exact_reel_not_authoritatively_public';$findings+=$result;continue
  }
  $result.state='owner_exact_reel_candidate_needs_independent_asset_and_receipt_review'
  $result.provider_created_at=$created.ToString('o')
  $result.public_permalink=$link
  $findings+=$result
}
if($findings.Count -ne 13 -or $script:graphGets -gt 70){throw 'exact_evidence_incomplete'}
$counts=@{};foreach($f in $findings){if(-not $counts.ContainsKey($f.state)){$counts[$f.state]=0};$counts[$f.state]++}
$report=@{version='issue2374_exact_owner_ids_v1';source='production_supabase';scan_at=[DateTimeOffset]::UtcNow.ToString('o');read_only=$true;provider_writes=0;output_writes=0;publish_calls=0;checked=$findings.Count;graph_get_calls=$script:graphGets;counts=$counts;results=$findings;remote_nonpublication_claimed=$false;retry_authorized=$false}
Write-Output ('ISSUE2374_EXACT_IDS='+($report|ConvertTo-Json -Compress -Depth 8))
