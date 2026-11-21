# NYC #2234 / issue 2489: exact six-output read-only provider account & queue inventory.
# This script cannot approve, unhold, schedule, publish, upload, or alter records.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{
  issue=2489; read_only=$true; exact_count=0
  local_safety_verified=$false; local_previous_provider_identity_count=0
  graph_gets=0; provider_writes=0; output_writes=0; airtable_operations=0
  facebook=@{}; instagram=@{}; tiktok=@{}; youtube=@{}
  remote_queue_exhaustively_verified=$false
  safe_to_release_automatically=$false
  error_category=''
}
try {
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'runner_supabase_authority_unverified'}
  $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  if(-not(Test-Path -LiteralPath $envfile)){throw 'runner_env_unavailable'}
  function E([string]$n){
    $line=@(Get-Content -LiteralPath $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
    if($line.Count -ne 1){return ''}
    return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
  }
  $su=(E 'SUPABASE_URL').TrimEnd('/');$sk=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or $sk.Length -lt 24){throw 'wrong_supabase_authority'}
  $h=@{apikey=$sk;Authorization=('Bearer '+$sk)}
  $select='output_number,airtable_record_id,content_number,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,published_at,platform_post_url,platform_publish_response,scheduled_post_date,final_file_url,error_messages'
  $rows=@(Invoke-RestMethod ($su+'/rest/v1/platform_outputs?select='+$select+'&output_number=in.(10840,10841,10842,10843,10844,10845)&order=output_number.asc&limit=7') -Headers $h -Method Get -TimeoutSec 30)
  if($rows.Count -eq 1 -and $rows[0] -is [array]){$rows=@($rows[0])}
  if($rows.Count -ne 6){throw 'six_output_snapshot_not_exact'}
  $scope=@(
    @{n=10840;id='recZ6eB75E1vOysOV';kind='Facebook Story';file='13_2zllk-N4Ejw8UyERucw32bWpdkMhFg'},
    @{n=10841;id='recM51TruD5yq6Wtr';kind='TikTok Video';file='1wXLbNj0ag143etMEiFXxH5uXeYaKersC'},
    @{n=10842;id='receIAoSy6F3Q8nOM';kind='Instagram Reel';file='1wXLbNj0ag143etMEiFXxH5uXeYaKersC'},
    @{n=10843;id='recHpcQejWDhOTKZR';kind='Instagram Story';file='13_2zllk-N4Ejw8UyERucw32bWpdkMhFg'},
    @{n=10844;id='recffQzU9LVRegiAb';kind='Facebook Reel';file='1wXLbNj0ag143etMEiFXxH5uXeYaKersC'},
    @{n=10845;id='recapsAtV4YDirmFY';kind='YouTube Short';file='1wXLbNj0ag143etMEiFXxH5uXeYaKersC'}
  )
  $owners=@()
  foreach($i in 0..5){
    $o=$rows[$i];$x=$scope[$i]
    if([int]$o.output_number -ne $x.n -or [string]$o.airtable_record_id -ne $x.id -or [string]$o.platform_output_type -ne $x.kind -or
      [int]$o.content_number -ne 2234 -or [string]$o.final_file_url -ne ('https://drive.google.com/file/d/'+$x.file+'/view') -or
      $o.output_status -ne 'Approved for Publishing' -or $o.review_status -ne 'Approved' -or
      $o.publish_status -ne 'Ready to Schedule' -or $o.do_not_publish -ne $true -or
      $o.auto_publish_enabled -ne $false -or $o.published_at -or $o.platform_post_url -or $o.platform_publish_response){
      throw 'output_safety_snapshot_changed'
    }
    $owners+=([string]$o.content_profile_id)
    foreach($field in @('Publish_Started_At','Studio_Publish_Dispatch_At','Last_Publish_Attempt_At','Platform_Post_ID','Platform_Media_ID','YouTube_Video_ID','TikTok_Draft_Publish_ID','IG_Story_Post_ID','IG_Story_Container_ID','Instagram_Reel_Container_ID')){
      if(-not [string]::IsNullOrWhiteSpace([string]$o.error_messages.$field)){$r.local_previous_provider_identity_count++}
    }
  }
  if(@($owners|Select-Object -Unique).Count -ne 1){throw 'wrong_owner_scope'}
  $p=@(Invoke-RestMethod ($su+'/rest/v1/content_profiles?id=eq.'+$owners[0]+'&select=market_name,airtable_record_id&limit=2') -Headers $h -Method Get -TimeoutSec 25)
  if($p.Count -eq 1 -and $p[0] -is [array]){$p=@($p[0])}
  if($p.Count -ne 1 -or $p[0].market_name -ne 'New York City' -or $p[0].airtable_record_id -ne 'recgtK8Z7eNADNtVy'){throw 'wrong_owner_profile'}
  $r.exact_count=6;$r.local_safety_verified=$true
  $settings=@(Invoke-RestMethod ($su+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 40)
  if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
  if($settings.Count -ge 500){throw 'settings_pagination_incomplete'}
  $v=@{}
  foreach($s in $settings){
    $x=$s.payload
    if([string]$x.source -ne 'pipeline' -or [string]$x.Active -ne 'True'){continue}
    $k=[string]$x.Setting_Name
    if($k -match '^(NYC_)?(META_GRAPH_API_VERSION|FACEBOOK_GRAPH_API_VERSION|FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN|INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN|TIKTOK_HANDLE|TIKTOK_WORKER_BASE_URL|YOUTUBE_CHANNEL_ID|YOUTUBE_UPLOAD_SERVICE_URL)$'){
      if($v.ContainsKey($k)){throw 'duplicated_active_provider_setting'}
      $v[$k]=[string]$x.Setting_Value
    }
  }
  $script:getCount=0
  function Graph([string]$uri,[string]$token){
    $u=$null;try{$u=[uri]$uri}catch{return @{ok=$false;reason='invalid_graph_url'}}
    if($u.Scheme -ne 'https' -or $u.Host -ne 'graph.facebook.com' -or [string]::IsNullOrWhiteSpace($token)){return @{ok=$false;reason='graph_scope_missing'}}
    $script:getCount++
    if($script:getCount -gt 40){return @{ok=$false;reason='graph_budget_exhausted'}}
    try{ $data=Invoke-RestMethod -Uri $u.AbsoluteUri -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 30
      return @{ok=$true;data=$data;reason='complete_http_200'}
    }catch{return @{ok=$false;reason='graph_get_failed'}}
  }
  function Scan([string]$first,[string]$token,[int]$maxPages){
    $next=$first;$pages=0;$complete=$false;$rows=@();$reason='page_limit'
    while($next -and $pages -lt $maxPages){
      $page=Graph $next $token
      if(-not $page.ok){$reason=$page.reason;break}
      if($null -eq $page.data.data){$reason='graph_page_not_a_list';break}
      $rows+=@($page.data.data);$pages++
      $next=[string]$page.data.paging.next
      if(-not $next){$complete=$true;$reason='complete';break}
    }
    return @{ok=$complete;pages=$pages;total=$rows.Count;rows=$rows;reason=$reason}
  }
  $vers=[string]$v['NYC_META_GRAPH_API_VERSION']
  if($vers -notmatch '^v\d{1,2}\.\d$'){$vers=[string]$v['META_GRAPH_API_VERSION']}
  if($vers -notmatch '^v\d{1,2}\.\d$'){$vers='v26.0'}
  $page=[string]$v['NYC_FACEBOOK_PAGE_ID'];$ft=[string]$v['NYC_FACEBOOK_PAGE_ACCESS_TOKEN']
  if($page -match '^\d{6,30}$' -and $ft){
    $identity=Graph ('https://graph.facebook.com/'+$vers+'/'+$page+'?fields=id') $ft
    if($identity.ok -and [string]$identity.data.id -eq $page){
      $list=Scan ('https://graph.facebook.com/'+$vers+'/'+$page+'/scheduled_posts?fields=id,scheduled_publish_time,message,created_time&limit=100') $ft 6
      $match=@($list.rows|Where-Object {([string]$_.message) -match '(Then and Now|Past and present collide|BrooklynBridge)'})
      $r.facebook=@{account_verified=$true;scheduled_posts_pages=$list.pages;scheduled_posts_scan_complete=$list.ok;scanned=$list.total;matching_scheduled_count=$match.Count;reason=$list.reason;remote_schedule_clear_for_story_or_reel=$false}
    }else{$r.facebook=@{account_verified=$false;reason='page_identity_unavailable'}}
  }else{$r.facebook=@{account_verified=$false;reason='page_scope_unavailable'}}
  $ig=[string]$v['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID'];$it=[string]$v['NYC_META_GRAPH_API_ACCESS_TOKEN']
  if($ig -match '^\d{6,30}$' -and $it){
    $identity=Graph ('https://graph.facebook.com/'+$vers+'/'+$ig+'?fields=id,username') $it
    if($identity.ok -and [string]$identity.data.id -eq $ig){
      $list=Scan ('https://graph.facebook.com/'+$vers+'/'+$ig+'/media?fields=id,caption,media_type,timestamp,permalink&limit=100') $it 3
      $matches=@($list.rows|Where-Object {([string]$_.caption) -match '(Then and Now|Past and present collide|BrooklynBridge)'})
      $r.instagram=@{account_verified=$true;published_media_pages=$list.pages;published_media_scan_complete=$list.ok;matching_published_count=$matches.Count;reason=$list.reason;unpublished_queue_exposed_by_api=$false}
    }else{$r.instagram=@{account_verified=$false;reason='ig_identity_unavailable';unpublished_queue_exposed_by_api=$false}}
  }else{$r.instagram=@{account_verified=$false;reason='ig_scope_unavailable';unpublished_queue_exposed_by_api=$false}}
  try{
    $t=Invoke-RestMethod 'https://auth-nyc.chicagoshining.com/tiktok/status' -Method Get -TimeoutSec 30
    $r.tiktok=@{status_endpoint_ok=($t.ok -eq $true);authorized=($t.authorized -eq $true);account_match=(([string]$t.creator_username).TrimStart('@').ToLowerInvariant() -eq ([string]$v['NYC_TIKTOK_HANDLE']).TrimStart('@').ToLowerInvariant());draft_queue_exposed=$false;reason='status_only_no_owned_draft_inventory'}
  }catch{$r.tiktok=@{status_endpoint_ok=$false;draft_queue_exposed=$false;reason='tiktok_status_unavailable'}}
  $channel=[string]$v['NYC_YOUTUBE_CHANNEL_ID']
  $serviceSecret=E 'YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET'
  if($channel -match '^UC[A-Za-z0-9_-]{22}$' -and $serviceSecret.Length -ge 16){
    try{
      $service='http://127.0.0.1:3340/youtube/channel/uploads?expected_channel_id='+$channel
      $inv=Invoke-RestMethod $service -Headers @{'x-sm-pipeline-key'=$serviceSecret} -Method Get -TimeoutSec 75
      $hits=@($inv.videos|Where-Object {([string]$_.title+' '+[string]$_.description_excerpt) -match '(Then and Now|Past and present collide|BrooklynBridge)'})
      $r.youtube=@{owner_verified=([string]$inv.channel_id -eq $channel);complete=($inv.complete -eq $true);scan_pages=$inv.playlist_pages_scanned;videos_seen=$inv.video_ids_seen;matching_owned_uploads=$hits.Count;possible_scheduled_matches=@($hits|ForEach-Object{@{privacy_status=$_.privacy_status;duration=$_.duration}});reason='owner_upload_inventory'}
    }catch{$r.youtube=@{owner_verified=$false;complete=$false;reason='youtube_uploader_inventory_unavailable'}}
  }else{$r.youtube=@{owner_verified=$false;complete=$false;reason='youtube_uploader_scope_unavailable'}}
  $r.graph_gets=$script:getCount
  # Meta's Instagram Graph and TikTok account status APIs cannot prove absence
  # of drafts/scheduled content. Never assert no duplicate solely on this audit.
  $r.remote_queue_exhaustively_verified=$false
  $r.safe_to_release_automatically=$false
}catch{
  $r.error_category=([string]$_.Exception.Message -replace '[^a-zA-Z0-9_-]','_').Substring(0,[Math]::Min(90,([string]$_.Exception.Message).Length))
}finally{
  Write-Output ('NYC2489_PROVIDER_QUEUE_AUDIT='+($r|ConvertTo-Json -Depth 10 -Compress))
}
