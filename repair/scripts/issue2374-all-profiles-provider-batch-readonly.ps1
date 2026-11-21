# Issue #2374: bounded, GET-only public provider-history reconciliation for the
# entire CURRENT overdue Supabase cohort. A positive caption match is a candidate,
# never a permission to mark Published or retry; scan absence is not nonpublication.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $ef)){throw 'runner_env_absent'}
function EnvValue([string]$name){
  $line=@(Get-Content $ef | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1)
  if($line.Count -ne 1){throw 'runner_config_missing'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$su=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$sk=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $sk){throw 'wrong_supabase_project_or_credentials'}
$sh=@{apikey=$sk;Authorization=('Bearer '+$sk)}
function Supa([string]$path){
  if($path -notmatch '^/rest/v1/[a-z_]+\?'){throw 'disallowed_supabase_read'}
  return Invoke-RestMethod ($su+$path) -Headers $sh -Method Get -TimeoutSec 45
}
$utc=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$select='output_number,airtable_record_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,scheduled_post_date,published_at,platform_post_url,output_caption,output_hashtags,output_title,test_run_id,do_not_publish,auto_publish_enabled,publish_retry_eligible,error_messages'
$query='/rest/v1/platform_outputs?select='+$select+'&review_status=eq.Approved&output_status=eq.Approved%20for%20Publishing&scheduled_post_date=lt.'+$utc+'&published_at=is.null&limit=1000'
$source=@(Supa $query)
if($source.Count -eq 1 -and $source[0] -is [array]){$source=@($source[0])}
if($source.Count -ge 1000){throw 'cohort_pagination_incomplete'}
$targets=@($source | Where-Object {
  -not [string]$_.platform_post_url -and -not [string]$_.published_at -and
  -not [string]$_.test_run_id
})
if($targets.Count -lt 1 -or $targets.Count -gt 600){throw 'unexpected_cohort_size'}
$distinct=@($targets | Select-Object -ExpandProperty airtable_record_id -Unique)
if($distinct.Count -ne $targets.Count){throw 'duplicated_output_identity'}
$profiles=@(Supa '/rest/v1/content_profiles?select=id,market_name&limit=20')
if($profiles.Count -eq 1 -and $profiles[0] -is [array]){$profiles=@($profiles[0])}
$market=@{};$owners=@{}
foreach($p in $profiles){$market[[string]$p.id]=[string]$p.market_name}
$prefixes=@{'Chicago'='';'Los Angeles'='LA_';'Miami'='MIAMI_';'New York City'='NYC_'}
foreach($o in $targets){
  $city=[string]$market[[string]$o.content_profile_id]
  if(-not $prefixes.ContainsKey($city)){throw 'output_profile_owner_missing'}
  if(-not $owners.ContainsKey($city)){$owners[$city]=[string]$o.content_profile_id}
  if($owners[$city] -ne [string]$o.content_profile_id){throw 'multiple_profiles_in_market'}
}
$settings=@(Supa '/rest/v1/engagement_settings?select=payload&limit=500')
if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
if($settings.Count -ge 500){throw 'incomplete_setting_scan'}
$v=@{}
foreach($s in $settings){
  $x=$s.payload
  if($null -eq $x -or [string]$x.source -ne 'pipeline' -or [string]$x.Active -ne 'True'){continue}
  $name=[string]$x.Setting_Name
  if($name -match '^(META_GRAPH_API_VERSION|FACEBOOK_GRAPH_API_VERSION|(LA_|MIAMI_|NYC_)?(META_GRAPH_API_ACCESS_TOKEN|INSTAGRAM_BUSINESS_ACCOUNT_ID|FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN))$'){
    if($v.ContainsKey($name)){throw 'duplicate_active_provider_setting'}
    $v[$name]=[string]$x.Setting_Value
  }
}
$igver=[string]$v['META_GRAPH_API_VERSION']
$fbver=[string]$v['FACEBOOK_GRAPH_API_VERSION']
if($igver -notmatch '^v\d{1,2}\.\d$'){$igver='v26.0'}
if($fbver -notmatch '^v\d{1,2}\.\d$'){$fbver='v26.0'}
$script:graphCalls=0
function GraphGet([string]$url,[string]$token){
  $parsed=$null
  try{$parsed=[uri]$url}catch{throw 'graph_url_invalid'}
  if($parsed.Scheme -ne 'https' -or $parsed.Host -ne 'graph.facebook.com' -or -not $token){throw 'graph_host_or_auth_invalid'}
  $script:graphCalls++
  if($script:graphCalls -gt 100){throw 'bounded_graph_budget_exhausted'}
  try{
    $obj=Invoke-RestMethod $url -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -Method Get -TimeoutSec 35
    return @{ok=$true;status=200;data=$obj}
  }catch{
    $status=0
    try{$status=[int]$_.Exception.Response.StatusCode}catch{}
    return @{ok=$false;status=$status;data=$null}
  }
}
function Norm([string]$txt){
  if(-not $txt){return ''}
  return ([regex]::Replace(($txt -replace '\u200B','' -replace '\u00a0',' ').ToLowerInvariant(),'\s+',' ').Trim())
}
$remote=@{};$coverage=@()
foreach($city in @('Chicago','Los Angeles','Miami','New York City')){
  $pr=$prefixes[$city]
  foreach($kind in @('Instagram','Facebook')){
    $typePrefix=if($kind -eq 'Instagram'){'IG'}else{'FB'}
    $idKey=if($kind -eq 'Instagram'){$pr+'INSTAGRAM_BUSINESS_ACCOUNT_ID'}else{$pr+'FACEBOOK_PAGE_ID'}
    $tokenKey=if($kind -eq 'Instagram'){$pr+'META_GRAPH_API_ACCESS_TOKEN'}else{$pr+'FACEBOOK_PAGE_ACCESS_TOKEN'}
    $id=[string]$v[$idKey];$token=[string]$v[$tokenKey]
    $scope=$city+'|'+$kind
    $remote[$scope]=@()
    if($id -notmatch '^\d{6,30}$' -or -not $token){
      $coverage+=@{scope=$scope;status='credential_absent';pages=0;posts=0}
      continue
    }
    $ver=if($kind -eq 'Instagram'){$igver}else{$fbver}
    $identity=GraphGet ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id') $token
    if(-not $identity.ok -or [string]$identity.data.id -ne $id){
      $coverage+=@{scope=$scope;status='owner_account_get_failed';pages=0;posts=0}
      continue
    }
    $edges=if($kind -eq 'Instagram'){@('media')}else{@('feed','published_posts','video_reels')}
    foreach($edge in $edges){
      $fields=if($edge -eq 'media'){'id,caption,permalink,timestamp,media_type,media_product_type'}elseif($edge -eq 'video_reels'){'id,description,updated_time'}else{'id,message,created_time'}
      $next='https://graph.facebook.com/'+$ver+'/'+$id+'/'+$edge+'?fields='+$fields+'&limit=100'
      $pages=0;$posts=0;$status='complete'
      while($next -and $pages -lt 6){
        $g=GraphGet $next $token
        if(-not $g.ok -or $null -eq $g.data.data){
          $status='provider_edge_get_unavailable';break
        }
        $entries=@($g.data.data)
        foreach($m in $entries){
          $remote[$scope]+=@{
            id=[string]$m.id
            text=Norm ([string]$(if($m.caption){$m.caption}elseif($m.description){$m.description}else{$m.message}))
            url=[string]$m.permalink
            timestamp=[string]$(if($m.timestamp){$m.timestamp}elseif($m.created_time){$m.created_time}else{$m.updated_time})
            kind=[string]$m.media_type
            edge=$edge
          }
        }
        $pages++;$posts+=$entries.Count
        $next=[string]$g.data.paging.next
      }
      if($next -and $status -eq 'complete'){$status='pagination_capped_inconclusive'}
      $coverage+=@{scope=$scope;edge=$edge;status=$status;pages=$pages;posts=$posts}
    }
  }
}
# Provider-history captions are only matching candidates. No provider update,
# Supabase PATCH, retry release, schedule change or Published transition here.
$results=@()
foreach($o in $targets){
  $city=[string]$market[[string]$o.content_profile_id]
  $scope=$city+'|'+[string]$o.platform
  $body=Norm ([string]$o.output_caption)
  $tags=Norm ([string]$o.output_hashtags)
  $expected=Norm ($body+' '+$tags)
  $needles=@()
  if($body.Length -ge 85){$needles+= $body.Substring(0,[Math]::Min(115,$body.Length))}
  if($expected.Length -ge 85){$needles+= $expected.Substring(0,[Math]::Min(115,$expected.Length))}
  $candidates=@()
  if($remote.ContainsKey($scope) -and $needles.Count -gt 0){
    foreach($m in @($remote[$scope])){
      if(-not $m.text -or $m.text.Length -lt 85){continue}
      $match=($m.text -eq $body -or $m.text -eq $expected)
      if(-not $match){foreach($needle in $needles){if($m.text.StartsWith($needle)){$match=$true;break}}}
      if($match){$candidates+=@{remote_id=$m.id;permalink=$m.url;timestamp=$m.timestamp;edge=$m.edge;media_type=$m.kind}}
    }
  }
  # A remote post can occur on multiple Facebook edges. De-duplicate IDs.
  $seen=@{};$uniq=@()
  foreach($c in $candidates){if(-not $seen.ContainsKey($c.remote_id)){$seen[$c.remote_id]=$true;$uniq+=$c}}
  $status='unsupported_provider_needs_separate_api'
  if($o.platform -in @('Instagram','Facebook')){
    $edges=@($coverage|Where-Object{$_.scope -eq $scope -and $_.edge})
    if($edges.Count -eq 0){$status='account_history_not_available'}
    elseif($uniq.Count -gt 1){$status='multiple_provider_candidates_manual_identity'}
    elseif($uniq.Count -eq 1){$status='single_public_text_candidate_needs_exact_receipt'}
    elseif($o.platform_output_type -eq 'Instagram Story'){$status='story_ephemeral_no_negative_proof'}
    elseif(@($edges|Where-Object{$_.status -ne 'complete'}).Count -gt 0){$status='provider_scan_incomplete_no_negative_proof'}
    elseif($needles.Count -eq 0){$status='caption_too_short_no_safe_match'}
    else{$status='no_text_match_in_recent_history_no_negative_proof'}
  }
  $results+=@{
    output=[int]$o.output_number;profile=$city;platform=[string]$o.platform
    type=[string]$o.platform_output_type;status=$status
    candidate_count=$uniq.Count;candidates=$uniq
    held=($o.do_not_publish -eq $true);retry_enabled=($o.publish_retry_eligible -eq $true)
  }
}
$unique=@($results|Where-Object{$_.candidate_count -eq 1})
$collisionIds=@{}
foreach($r in $unique){$id=[string]$r.candidates[0].remote_id;$key=$r.profile+'|'+$r.platform+'|'+$id;if(-not $collisionIds.ContainsKey($key)){$collisionIds[$key]=0};$collisionIds[$key]++}
foreach($r in $unique){
  $id=[string]$r.candidates[0].remote_id;$key=$r.profile+'|'+$r.platform+'|'+$id
  if($collisionIds[$key] -gt 1){$r.status='shared_provider_candidate_not_safe_for_receipt'}
}
$counts=@{}
foreach($r in $results){if(-not $counts.ContainsKey($r.status)){$counts[$r.status]=0};$counts[$r.status]++}
$public=@($results|Where-Object{$_.candidate_count -gt 0}|ForEach-Object{
  @{output=$_.output;profile=$_.profile;platform=$_.platform;type=$_.type;status=$_.status;candidates=$_.candidates}
})
$report=@{
  version='issue2374_all_profiles_v1'
  source='production_supabase';read_only=$true;output_writes=0;provider_writes=0;publish_calls=0
  scan_at=$utc;targets=$targets.Count;graph_get_calls=$script:graphCalls
  provider_coverage=$coverage;counts=$counts
  provider_candidates=$public;all_output_dispositions=@($results|ForEach-Object{
    @{output=$_.output;profile=$_.profile;platform=$_.platform;type=$_.type;status=$_.status;candidate_count=$_.candidate_count;held=$_.held}
  })
}
# Do not print source captions, tokens, raw settings, worker auth or API URLs.
Write-Output ('ISSUE2374_BATCH_AUDIT='+($report|ConvertTo-Json -Compress -Depth 9))
