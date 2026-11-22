# Original Meta parent/publication reconciliation for seven historically attempted outputs.
# Authenticated Meta Graph GET only. A missing match NEVER implies safe duplicate create.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{
 version='meta-original-seven-deep-v1';read_only=$true;targets=7;output_writes=0;provider_writes=0;airtable_reads=0;
 results=@();coverage=@();photo_story_associations=@();graph_get_calls=0;safe_to_retry=$false;nonpublication_proven=$false
}
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_not_verified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E([string]$k){
 $line=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($k)+'\s*=')}|Select-Object -Last 1)
 if($line.Count -ne 1){throw 'missing_runner_credential'}
 return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$u=(E 'SUPABASE_URL').TrimEnd('/');$sk=E 'SUPABASE_SERVICE_ROLE_KEY'
if($u -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $sk){throw 'wrong_database_identity'}
$h=@{apikey=$sk;Authorization=('Bearer '+$sk)}
function S([string]$path){
 if($path -notmatch '^/rest/v1/[a-z_]+\?'){throw 'invalid_supabase_path'}
 return Invoke-RestMethod ($u+$path) -Method Get -Headers $h -TimeoutSec 35
}
$spec=@{
 5860=@{id='recxak09o0riLz0B1';market='Chicago';kind='Instagram Reel'};
 8803=@{id='recUXyrC57QnKp5F6';market='Los Angeles';kind='Facebook Photo Set'};
 9777=@{id='recmd8mSZlqbRBh8K';market='Miami';kind='Facebook Photo Set'};
 10152=@{id='recUtsS6GMxN8wDs3';market='Chicago';kind='Facebook Photo Set'};
 10638=@{id='recWvmgW3HdfyKEK5';market='Miami';kind='Facebook Photo Set'};
 10671=@{id='recNvok6XMN6zOSHa';market='Miami';kind='Facebook Photo Set'};
 10694=@{id='recg9sZggvNOGQO54';market='Miami';kind='Facebook Photo Set'}
}
$select='output_number,airtable_record_id,content_profile_id,platform_output_type,review_status,output_status,publish_status,auto_publish_enabled,do_not_publish,output_caption,output_hashtags,platform_post_url,published_at,error_messages'
$rows=@(S ('/rest/v1/platform_outputs?output_number=in.(5860,8803,9777,10152,10638,10671,10694)&select='+$select+'&limit=10'))
if($rows.Count -eq 1 -and $rows[0] -is [array]){$rows=@($rows[0])}
if($rows.Count -ne 7){throw 'target_source_count_wrong'}
$profiles=@(S '/rest/v1/content_profiles?select=id,market_name&limit=20')
if($profiles.Count -eq 1 -and $profiles[0] -is [array]){$profiles=@($profiles[0])}
$markets=@{};foreach($p in $profiles){$markets[[string]$p.id]=[string]$p.market_name}
foreach($r in $rows){
 $n=[int]$r.output_number
 if(-not $spec.ContainsKey($n)){throw 'unexpected_output'}
 $e=$spec[$n]
 if($r.airtable_record_id -cne $e.id -or $r.platform_output_type -cne $e.kind -or
    $markets[[string]$r.content_profile_id] -cne $e.market -or
    $r.output_status -ne 'Approved for Publishing' -or $r.review_status -ne 'Approved' -or
    $r.auto_publish_enabled -ne $false -or $r.do_not_publish -ne $false -or
    $r.published_at -or $r.platform_post_url){throw ('source_state_changed_'+$n)}
}
$settings=@(S '/rest/v1/engagement_settings?select=payload&limit=500')
if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
if($settings.Count -ge 500){throw 'incomplete_settings'}
$cfg=@{}
foreach($v in $settings){$p=$v.payload;if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
 $k=[string]$p.Setting_Name
 if($k -match '^(META_GRAPH_API_VERSION|FACEBOOK_GRAPH_API_VERSION|(LA_|MIAMI_|NYC_)?(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN|FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN))$'){
  if($cfg.ContainsKey($k)){throw 'duplicate_provider_setting'}
  $cfg[$k]=[string]$p.Setting_Value
 }}
$igver=[string]$cfg['META_GRAPH_API_VERSION'];if($igver -notmatch '^v\d{1,2}\.\d$'){$igver='v26.0'}
$fbver=[string]$cfg['FACEBOOK_GRAPH_API_VERSION'];if($fbver -notmatch '^v\d{1,2}\.\d$'){$fbver=$igver}
$script:graphCalls=0
function G([string]$url,[string]$token){
 $parsed=$null
 try{$parsed=[uri]$url}catch{throw 'bad_graph_url'}
 if($parsed.Scheme -ne 'https' -or $parsed.Host -ne 'graph.facebook.com' -or -not $token){throw 'disallowed_graph_host'}
 for($retry=0;$retry -lt 3;$retry++){
  $script:graphCalls++
  if($script:graphCalls -gt 110){throw 'bounded_graph_get_budget_exhausted'}
  try{
   $obj=Invoke-RestMethod $url -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 35
   return @{ok=$true;status=200;obj=$obj}
  }catch{
   $status=0;try{$status=[int]$_.Exception.Response.StatusCode}catch{}
   if($retry -eq 2 -or ($status -gt 0 -and $status -lt 500 -and $status -ne 429)){return @{ok=$false;status=$status;obj=$null}}
   Start-Sleep -Seconds (2+$retry)
  }
 }
}
function N([string]$s){return [regex]::Replace(($s -replace '\u00A0',' ').ToLowerInvariant(),'\s+',' ').Trim()}
function AttachedIds($post){
 $ids=@()
 foreach($a in @($post.attachments.data)){
  if($null -eq $a){continue}
  if([string]$a.target.id -match '^\d{12,30}$'){$ids+=[string]$a.target.id}
  foreach($sub in @($a.subattachments.data)){
   if($null -ne $sub -and [string]$sub.target.id -match '^\d{12,30}$'){$ids+=[string]$sub.target.id}
  }
 }
 return @($ids|Sort-Object -Unique)
}
$names=@{'Chicago'='';'Los Angeles'='LA_';'Miami'='MIAMI_'}
$hist=@{}
foreach($city in @('Chicago','Los Angeles','Miami')){
 $prefix=$names[$city]
 $page=[string]$cfg[$prefix+'FACEBOOK_PAGE_ID']
 $token=[string]$cfg[$prefix+'FACEBOOK_PAGE_ACCESS_TOKEN']
 if($page -notmatch '^\d{6,30}$' -or -not $token){throw ('page_credentials_missing_'+$city)}
 $o=G ('https://graph.facebook.com/'+$fbver+'/'+$page+'?fields=id') $token
 if(-not $o.ok -or [string]$o.obj.id -ne $page){throw ('page_owner_id_invalid_'+$city)}
 $posts=@();$edges=@()
 foreach($edge in @('published_posts','posts')){
  $next='https://graph.facebook.com/'+$fbver+'/'+$page+'/'+$edge+'?fields='+[uri]::EscapeDataString('id,message,created_time,permalink_url,attachments.limit(10){target,subattachments.limit(25){target}}')+'&since=2026-11-15&until=2026-11-23&limit=75'
  $pages=0;$complete=$false;$last_http=0;$seen=@{}
  while($next -and $pages -lt 9){
   if($seen.ContainsKey($next)){break};$seen[$next]=$true
   $g=G $next $token;$last_http=$g.status
   if(-not $g.ok -or $null -eq $g.obj.data){break}
   foreach($x in @($g.obj.data)){$posts+=@{edge=$edge;obj=$x}}
   $pages++
   $next=[string]$g.obj.paging.next
   if(-not $next){$complete=$true}
  }
  $edges+=@{edge=$edge;pages=$pages;complete=$complete;last_http=$last_http}
 }
 $hist[$city]=@{page=$page;token=$token;posts=$posts}
 $report.coverage+=@{market=$city;fb_page_verified=$true;scanned_posts=$posts.Count;scan_edges=$edges}
}
$ig=$cfg['INSTAGRAM_BUSINESS_ACCOUNT_ID'];$igToken=[string]$cfg['META_GRAPH_API_ACCESS_TOKEN']
if([string]$ig -notmatch '^\d{6,30}$' -or -not $igToken){throw 'chicago_ig_config_missing'}
$io=G ('https://graph.facebook.com/'+$igver+'/'+$ig+'?fields=id') $igToken
if(-not $io.ok -or [string]$io.obj.id -ne [string]$ig){throw 'chicago_ig_owner_invalid'}
$media=@();$next='https://graph.facebook.com/'+$igver+'/'+$ig+'/media?fields=id,caption,permalink,timestamp,media_type,media_product_type&since=2026-11-16&until=2026-11-23&limit=100'
$pages=0;$complete=$false;$lastHttp=0;$oldest=''
while($next -and $pages -lt 12){
 $g=G $next $igToken;$lastHttp=$g.status
 if(-not $g.ok -or $null -eq $g.obj.data){break}
 $media+=@($g.obj.data);$pages++;$next=[string]$g.obj.paging.next
 if(-not $next){$complete=$true}
}
foreach($m in $media){if($m.timestamp -and (-not $oldest -or [string]$m.timestamp -lt $oldest)){$oldest=[string]$m.timestamp}}
$report.coverage+=@{market='Chicago';ig_owner_verified=$true;ig_media_scanned=$media.Count;ig_pages=$pages;ig_scan_complete=$complete;ig_oldest=$oldest;ig_last_http=$lastHttp}
foreach($r in ($rows|Sort-Object output_number)){
 $n=[int]$r.output_number;$e=$spec[$n];$cap=N([string]$r.output_caption)
 $result=[ordered]@{output=$n;market=$e.market;kind=$e.kind;exact_record_verified=$true;candidate_ids=@();same_format_candidates=0;
  matched_saved_original_photos=0;saved_photo_story_ids=@();individual_story_refs=@();exact_eight_attachment_parent_candidates=@();safe_to_retry=$false;nonpublication_proven=$false}
 if($n -eq 5860){
  foreach($m in $media){
   if([string]$m.media_type -ne 'VIDEO' -or ([string]$m.media_product_type -ne 'REELS' -and [string]$m.permalink -notmatch '/reel/')){continue}
   $c=N([string]$m.caption)
   if($cap.Length -ge 65 -and ($c -eq $cap -or ($c.Length -ge 85 -and $c.StartsWith($cap.Substring(0,85))))){
    $result.candidate_ids+=@{id=[string]$m.id;permalink=[string]$m.permalink;timestamp=[string]$m.timestamp}
   }
  }
  $result.same_format_candidates=$result.candidate_ids.Count
 }else{
  $histCity=$hist[$e.market]
  $photoIds=@()
  if($n -in @(8803,9777)){
   $txt=[string]$r.error_messages.FB_Photo_IDs_JSON
   if($txt -cnotmatch '^\[\s*"\d{12,30}"\s*(,\s*"\d{12,30}"){7}\s*\]$'){throw ('original_eight_photo_id_array_invalid_'+$n)}
   $photoIds=@([regex]::Matches($txt,'"(\d{12,30})"')|ForEach-Object{[string]$_.Groups[1].Value})
   $story=@()
   foreach($pid in $photoIds){
    $get=G ('https://graph.facebook.com/'+$fbver+'/'+$pid+'?fields=id,from{id},page_story_id,created_time') ([string]$histCity.token)
    $owned=($get.ok -and [string]$get.obj.id -eq $pid -and [string]$get.obj.from.id -eq [string]$histCity.page)
    if($owned){$result.matched_saved_original_photos++}
    $sid=if($owned){[string]$get.obj.page_story_id}else{''}
    if($sid){$story+= $sid}
   }
   $result.saved_photo_story_ids=@($story|Sort-Object -Unique)
   foreach($sid in $result.saved_photo_story_ids){
    if($sid -notmatch '^\d{12,30}(_\d{12,30})?$'){continue}
    $get=G ('https://graph.facebook.com/'+$fbver+'/'+$sid+'?fields='+[uri]::EscapeDataString('id,from{id},permalink_url,created_time,attachments{target,subattachments{target}}')) ([string]$histCity.token)
    if($get.ok -and [string]$get.obj.id -eq $sid -and [string]$get.obj.from.id -eq [string]$histCity.page){
     $result.individual_story_refs+=@{id=$sid;permalink=[string]$get.obj.permalink_url;attachment_ids=(AttachedIds $get.obj)}
    }
   }
  }
  $seen=@{}
  foreach($row in $histCity.posts){
   $post=$row.obj
   $postid=[string]$post.id
   if($seen.ContainsKey($postid)){continue};$seen[$postid]=$true
   $pm=N([string]$post.message)
   if($cap.Length -ge 65 -and ($pm -eq $cap -or ($pm.Length -ge 85 -and $pm.StartsWith($cap.Substring(0,85))))){
    $result.candidate_ids+=@{id=$postid;edge=$row.edge;permalink=[string]$post.permalink_url;attachment_ids=(AttachedIds $post)}
   }
   if($photoIds.Count -eq 8){
    $attached=AttachedIds $post
    $hits=@($photoIds|Where-Object{$attached -contains $_})
    if($hits.Count -eq 8){
     $result.exact_eight_attachment_parent_candidates+=@{id=$postid;permalink=[string]$post.permalink_url;attachment_count=$attached.Count;source_edge=$row.edge}
    }
   }
  }
  $result.same_format_candidates=$result.candidate_ids.Count
 }
 $report.results+= $result
}
$report.graph_get_calls=$script:graphCalls
Write-Output ('SM_META7_DEEP_AUDIT='+($report|ConvertTo-Json -Depth 10 -Compress))
