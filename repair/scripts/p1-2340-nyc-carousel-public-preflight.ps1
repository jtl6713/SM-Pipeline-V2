$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'read_authority_unverified'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_missing'}
function E($name) {
 $line=@(Get-Content $envfile|Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
 if(-not $line){throw 'required_config_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(E 'SUPABASE_URL').TrimEnd('/')
$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'invalid_read_config'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$records=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=in.(9855,9890,10065)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,ig_carousel_status,do_not_publish,auto_publish_enabled,scheduled_post_date,output_caption,output_hashtags,published_at,platform_post_url,error_messages&limit=4') -Headers $h -Method Get -TimeoutSec 25
if(@($records).Count -ne 3){throw 'exact_three_outputs_not_found'}
$target=@(
 @{number=9855;rid='reccfGD1hDBiG6tIV';parent='18134569969783117'},
 @{number=9890;rid='rec7uB7WQhZLyk28T';parent='18134572765783117'},
 @{number=10065;rid='recX2sdcURmfzfqzf';parent='18134571058783117'}
)
foreach($t in $target){
 $r=@($records|Where-Object {[int]$_.output_number -eq $t.number})
 if($r.Count -ne 1){throw 'target_not_unique'}
 $o=$r[0]
 if($o.airtable_record_id -ne $t.rid -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.ig_carousel_status -ne 'Parent Ready' -or $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $true -or $o.published_at -or $o.platform_post_url -or [string]$o.error_messages.'IG_Carousel_Parent_Container_ID' -ne $t.parent -or [string]$o.error_messages.'IG_Carousel_Parent_Status' -ne 'FINISHED' -or [string]$o.error_messages.'IG_Carousel_Last_Completed_Stage' -ne 'AP3P' -or [string]$o.error_messages.'IG_Carousel_Published_Media_ID' -or [string]$o.error_messages.'Platform_Post_ID' -or [string]$o.error_messages.'IG_Carousel_Publish_Attempt_Count' -or [string]$o.error_messages.'Publish_Locked_At' -or [string]$o.error_messages.'Publish_Locked_By'){throw ('record_ineligible_'+$t.number)}
 if(-not $o.scheduled_post_date -or [DateTimeOffset]::Parse([string]$o.scheduled_post_date) -gt [DateTimeOffset]::UtcNow){throw ('schedule_hold_'+$t.number)}
}
$owner=([string]$records[0].content_profile_id)
if(@($records|Where-Object {[string]$_.content_profile_id -ne $owner}).Count){throw 'mixed_profile'}
$profile=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$owner+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
if(@($profile).Count -ne 1 -or $profile[0].market_name -ne 'New York City'){throw 'profile_owner_not_nyc'}
$settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($s in $settings){
 $x=$s.payload
 if($null -eq $x -or [string]$x.source -ne 'pipeline' -or [string]$x.Active -ne 'True'){continue}
 $name=[string]$x.Setting_Name
 if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){
  if($v.ContainsKey($name)){throw 'duplicate_setting'}
  $v[$name]=[string]$x.Setting_Value
 }
}
$token=[string]$v['NYC_META_GRAPH_API_ACCESS_TOKEN']
$account=[string]$v['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$ver=[string]$v['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'meta_owner_token_missing'}
$gh=@{Authorization=('Bearer '+$token)}
function GraphGet($uri) {
 if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'graph_host_mismatch'}
 return Invoke-RestMethod -Uri $uri -Headers $gh -Method Get -TimeoutSec 45
}
$acct=GraphGet ('https://graph.facebook.com/'+$ver+'/'+$account+'?fields=id')
if([string]$acct.id -ne $account){throw 'account_identity_unverified'}
$check=@{}
foreach($t in $target){
 $p=GraphGet ('https://graph.facebook.com/'+$ver+'/'+$t.parent+'?fields=id,status_code')
 if([string]$p.id -ne $t.parent){throw 'parent_identity_mismatch'}
 $check[[string]$t.number]=[string]$p.status_code
}
$media=@()
$next='https://graph.facebook.com/'+$ver+'/'+$account+'/media?fields=id,caption,permalink,timestamp,media_type&limit=100'
$pages=0
while($next -and $pages -lt 5) {
 $r=GraphGet $next
 if($null -eq $r.data){throw 'missing_media_data'}
 $media+=@($r.data)
 $pages++
 $next=[string]$r.paging.next
}
if($next){throw 'incomplete_media_history_over_500'}
function N([string]$x){return ([regex]::Replace(($x -replace '\u00a0',' '),'\s+',' ').Trim()).ToLowerInvariant()}
$results=@()
foreach($t in $target){
 $o=@($records|Where-Object{[int]$_.output_number -eq $t.number})[0]
 $caption=([string]$o.output_caption).Trim()
 $hashtags=([string]$o.output_hashtags).Trim()
 $expected=if($caption -and $hashtags){$caption+[Environment]::NewLine+[Environment]::NewLine+$hashtags}else{$caption+$hashtags}
 $norm=N $expected
 if($norm.Length -lt 50){throw ('caption_too_short_for_safe_reconciliation_'+$t.number)}
 $prefix=$norm.Substring(0,[Math]::Min(95,$norm.Length))
 $candidate=@($media|Where-Object{
  [string]$_.media_type -eq 'CAROUSEL_ALBUM' -and $null -ne $_.caption -and
  ((N ([string]$_.caption)) -eq $norm -or (N ([string]$_.caption)).StartsWith($prefix))
 })
 $matches=@($candidate|ForEach-Object{@{id=[string]$_.id;permalink=[string]$_.permalink;timestamp=[string]$_.timestamp}})
 $state=[string]$check[[string]$t.number]
 $results+=@{output=$t.number;parent=$t.parent;parent_status=$state;recent_caption_candidates=$matches;ready_for_one_publish=($state -eq 'FINISHED' -and $matches.Count -eq 0)}
}
$report=@{read_only=$true;provider_writes=0;output_writes=0;account_verified=$true;complete_recent_media_scan=$true;media_scanned=$media.Count;pages=$pages;results=$results}
Write-Output ('P1_IG_PUBLIC_PREFLIGHT='+($report|ConvertTo-Json -Compress -Depth 7))
