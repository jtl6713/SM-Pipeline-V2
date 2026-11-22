# Issue #2371 / #2340 — 15 exact pre-existing Meta attempts, strictly owner-scoped GET.
# No provider POST, no Supabase writes, no Airtable access, no negative absence claims.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{version='meta15-original-readonly-v1';read_only=$true;provider_writes=0;output_writes=0;airtable_reads=0;targets=15;graph_get_calls=0;results=@();provider_coverage=@();negative_delivery_proven=$false}
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'studio_supabase_authority_unverified'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_unavailable'}
function EnvValue([string]$n){
  $line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
  if($line.Count -ne 1){throw 'config_unavailable'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$su=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$key=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'production_identity_mismatch'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
function Supa([string]$path){
  if($path -notmatch '^/rest/v1/[a-z_]+\?'){throw 'disallowed_source_path'}
  return Invoke-RestMethod ($su+$path) -Method Get -Headers $headers -TimeoutSec 40
}
$spec=@(
 '5348|recCfRjDcWClvUFlx|Los Angeles|Instagram Reel',
 '5672|reczrBo25CWRzwweT|New York City|Instagram Reel',
 '5678|recZqIhkaUwhw2v5R|New York City|Instagram Reel',
 '5860|recxak09o0riLz0B1|Chicago|Instagram Reel',
 '5866|rec0Xh48U7Uo0SSG0|Los Angeles|Instagram Reel',
 '5969|rec4zNUHbgMvf7HAf|Miami|Instagram Reel',
 '6001|rec5cbTHTgTMSs4qE|Miami|Instagram Reel',
 '6069|recXuOMF4fyilnOFV|Miami|Instagram Reel',
 '6255|rec3xhUAwpunQFWyg|Miami|Instagram Reel',
 '8803|recUXyrC57QnKp5F6|Los Angeles|Facebook Photo Set',
 '9777|recmd8mSZlqbRBh8K|Miami|Facebook Photo Set',
 '10152|recUtsS6GMxN8wDs3|Chicago|Facebook Photo Set',
 '10638|recWvmgW3HdfyKEK5|Miami|Facebook Photo Set',
 '10671|recNvok6XMN6zOSHa|Miami|Facebook Photo Set',
 '10694|recg9sZggvNOGQO54|Miami|Facebook Photo Set'
)
$expected=@{}
foreach($line in $spec){$v=$line.Split('|');$expected[[int]$v[0]]=@{rid=$v[1];market=$v[2];kind=$v[3]}}
$ids=($spec|ForEach-Object{($_.Split('|'))[0]}) -join ','
$select='output_number,airtable_record_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,auto_publish_enabled,do_not_publish,published_at,platform_post_url,output_caption,output_hashtags,error_messages'
$outputs=@(Supa ('/rest/v1/platform_outputs?output_number=in.('+$ids+')&select='+$select+'&limit=20'))
if($outputs.Count -ne 15){throw 'exact_source_count_not_15'}
$profiles=@(Supa '/rest/v1/content_profiles?select=id,market_name&limit=30')
$market=@{}
foreach($p in $profiles){$market[[string]$p.id]=[string]$p.market_name}
foreach($o in $outputs){
  $n=[int]$o.output_number
  if(-not $expected.ContainsKey($n)){throw 'unexpected_source_identity'}
  $e=$expected[$n]
  if([string]$o.airtable_record_id -cne $e.rid -or [string]$o.platform_output_type -cne $e.kind -or
     $market[[string]$o.content_profile_id] -cne $e.market -or
     $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or
     $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $false -or
     $o.published_at -or $o.platform_post_url){throw ('source_changed_stop_'+$n)}
}
$rows=@(Supa '/rest/v1/engagement_settings?select=payload&limit=500')
if($rows.Count -ge 500){throw 'settings_scan_incomplete'}
$cfg=@{}
foreach($r in $rows){
  $p=$r.payload
  if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
  $n=[string]$p.Setting_Name
  if($n -match '^(META_GRAPH_API_VERSION|FACEBOOK_GRAPH_API_VERSION|(LA_|MIAMI_|NYC_)?(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN|FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN))$'){
    if($cfg.ContainsKey($n)){throw 'duplicate_active_setting'}
    $cfg[$n]=[string]$p.Setting_Value
  }
}
$ver=[string]$cfg['META_GRAPH_API_VERSION'];if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
$fbver=[string]$cfg['FACEBOOK_GRAPH_API_VERSION'];if($fbver -notmatch '^v\d{1,2}\.\d$'){$fbver=$ver}
$script:calls=0
function GraphGet([string]$url,[string]$token){
  $uri=$null
  try{$uri=[uri]$url}catch{throw 'invalid_graph_url'}
  if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.facebook.com' -or -not $token){throw 'disallowed_graph_destination'}
  $script:calls++
  if($script:calls -gt 100){throw 'bounded_graph_budget_exhausted'}
  try{
    $obj=Invoke-RestMethod $url -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 40
    return @{ok=$true;status=200;data=$obj}
  }catch{
    $status=0
    try{$status=[int]$_.Exception.Response.StatusCode}catch{}
    return @{ok=$false;status=$status;data=$null}
  }
}
function Norm([string]$s){
  if(-not $s){return ''}
  return ([regex]::Replace($s.ToLowerInvariant(),'\s+',' ').Trim())
}
$prefixes=@{'Chicago'='';'Los Angeles'='LA_';'Miami'='MIAMI_';'New York City'='NYC_'}
$remote=@{};$coverage=@()
foreach($city in @('Chicago','Los Angeles','Miami','New York City')){
  $prefix=$prefixes[$city]
  $igId=[string]$cfg[$prefix+'INSTAGRAM_BUSINESS_ACCOUNT_ID']
  $igToken=[string]$cfg[$prefix+'META_GRAPH_API_ACCESS_TOKEN']
  $pageId=[string]$cfg[$prefix+'FACEBOOK_PAGE_ID']
  $pageToken=[string]$cfg[$prefix+'FACEBOOK_PAGE_ACCESS_TOKEN']
  if($igId -notmatch '^\d{6,30}$' -or $pageId -notmatch '^\d{6,30}$' -or -not $igToken -or -not $pageToken){throw ('missing_owner_config_'+$city)}
  $igOwner=GraphGet ('https://graph.facebook.com/'+$ver+'/'+$igId+'?fields=id') $igToken
  $fbOwner=GraphGet ('https://graph.facebook.com/'+$fbver+'/'+$pageId+'?fields=id,name') $pageToken
  $igVerified=($igOwner.ok -and [string]$igOwner.data.id -eq $igId)
  $pageVerified=($fbOwner.ok -and [string]$fbOwner.data.id -eq $pageId)
  $igItems=@();$igComplete=$false
  if($igVerified){
    $next='https://graph.facebook.com/'+$ver+'/'+$igId+'/media?fields=id,caption,permalink,timestamp,media_type,media_product_type&limit=100'
    for($pg=0;$pg -lt 5 -and $next;$pg++){
      $v=GraphGet $next $igToken
      if(-not $v.ok -or $null -eq $v.data.data){break}
      $igItems+=@($v.data.data)
      $next=[string]$v.data.paging.next
      if(-not $next){$igComplete=$true}
    }
  }
  $fbItems=@();$fbComplete=$false;$fbStatus=0
  if($pageVerified){
    $next='https://graph.facebook.com/'+$fbver+'/'+$pageId+'/published_posts?fields=id,message,created_time,attachments{type,subattachments,target}&limit=100'
    for($pg=0;$pg -lt 5 -and $next;$pg++){
      $v=GraphGet $next $pageToken;$fbStatus=$v.status
      if(-not $v.ok -or $null -eq $v.data.data){break}
      $fbItems+=@($v.data.data)
      $next=[string]$v.data.paging.next
      if(-not $next){$fbComplete=$true}
    }
  }
  $remote[$city]=@{ig=$igItems;fb=$fbItems;page=$pageId;token=$pageToken;owner_ig=$igVerified;owner_page=$pageVerified;ig_complete=$igComplete;fb_complete=$fbComplete}
  $coverage+=@{market=$city;ig_identity_verified=$igVerified;fb_page_identity_verified=$pageVerified;ig_media_scanned=$igItems.Count;ig_media_scan_complete=$igComplete;fb_posts_scanned=$fbItems.Count;fb_posts_scan_complete=$fbComplete;fb_posts_http=$fbStatus}
}
foreach($o in ($outputs|Sort-Object output_number)){
  $n=[int]$o.output_number;$city=$expected[$n].market;$r=$remote[$city]
  $cap=Norm ([string]$o.output_caption)
  $hashtag=Norm ([string]$o.output_hashtags)
  $full=Norm ($cap+' '+$hashtag)
  $match=@()
  if($o.platform -eq 'Instagram'){
    foreach($post in $r.ig){
      $product=[string]$post.media_product_type;$url=[string]$post.permalink;$kind=[string]$post.media_type
      if($kind -ne 'VIDEO' -or ($product -ne 'REELS' -and $url -notmatch '/reel/')){continue}
      $pc=Norm ([string]$post.caption)
      if($cap.Length -ge 45 -and ($pc -eq $cap -or $pc -eq $full -or ($pc.Length -ge 100 -and $pc.StartsWith($cap.Substring(0,[Math]::Min(100,$cap.Length)))))){
        $match+=@{remote_id=[string]$post.id;permalink=$url;timestamp=[string]$post.timestamp;product=$product;kind=$kind;candidate_only=$true}
      }
    }
  }else{
    foreach($post in $r.fb){
      $pm=Norm ([string]$post.message)
      if($cap.Length -ge 45 -and ($pm -eq $cap -or $pm -eq $full -or ($pm.Length -ge 100 -and $pm.StartsWith($cap.Substring(0,[Math]::Min(100,$cap.Length)))))){
        $match+=@{remote_id=[string]$post.id;created_time=[string]$post.created_time;candidate_only=$true;parent_attachment_count_unverified=$true}
      }
    }
  }
  $photos=@();$photoVerified=0
  if($n -eq 8803 -or $n -eq 9777){
    $str=[string]$o.error_messages.FB_Photo_IDs_JSON
    $pat='^\[\s*"\d{12,30}"\s*(,\s*"\d{12,30}"){7}\s*\]$'
    if($str -cnotmatch $pat){throw ('saved_photo_source_invalid_'+$n)}
    foreach($idMatch in [regex]::Matches($str,'"(\d{12,30})"')){
      $photoId=[string]$idMatch.Groups[1].Value
      $p=GraphGet ('https://graph.facebook.com/'+$fbver+'/'+$photoId+'?fields=id,from{id},created_time') ([string]$r.token)
      $ok=($p.ok -and [string]$p.data.id -eq $photoId -and [string]$p.data.from.id -eq [string]$r.page)
      if($ok){$photoVerified++}
      $photos+=@{id=$photoId;owner_page_match=$ok;http=$p.status}
    }
  }
  $cov=@($coverage|Where-Object{$_.market -eq $city})[0]
  $report.results+=@{output=$n;market=$city;kind=$o.platform_output_type;native_attempts=[string]$o.error_messages.Publish_Attempt_Count;dispatch_attempts=[string]$o.error_messages.Studio_Publish_Dispatch_Count;last_attempt=[string]$o.error_messages.Last_Publish_Attempt_At;no_saved_provider_receipt=$true;owner_identity_verified=([bool]($cov.ig_identity_verified -and $cov.fb_page_identity_verified));same_format_caption_candidates=$match;candidate_count=$match.Count;candidate_is_not_verified_original_operation=$true;saved_page_photo_count=$photos.Count;saved_page_photos_owner_verified=$photoVerified;page_photo_observations=$photos;provider_listing_complete= $(if($o.platform -eq 'Instagram'){$cov.ig_media_scan_complete}else{$cov.fb_posts_scan_complete});conclusive_nonpublication=$false;safe_to_retry=$false}
}
$report.provider_coverage=$coverage
$report.graph_get_calls=$script:calls
Write-Output ('P1_META15_AUDIT='+($report|ConvertTo-Json -Compress -Depth 9))
