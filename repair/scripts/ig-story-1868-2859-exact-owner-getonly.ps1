# Exact existing Meta Story receipt verification for LA #1868 and Miami #2859.
# GET only: no provider create/publish, source updates, lock/hold changes or Airtable traffic.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{state='blocked';stage='init';reason='not_started';outputs=@(1868,2859);results=@();provider_gets=0;provider_writes=0;source_writes=0;airtable_ops=0}
try {
  $report.stage='authority-check'
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
  $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  if(-not (Test-Path $ef)){throw 'runner_env_missing'}
  function E([string]$name){
    $lines=@(Get-Content $ef | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1)
    if($lines.Count -ne 1){throw 'runner_configuration_missing'}
    return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
  }
  $su=(E 'SUPABASE_URL').TrimEnd('/')
  $key=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'supabase_project_mismatch'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  function ReadS([string]$route){return Invoke-RestMethod ($su+$route) -Headers $h -Method Get -TimeoutSec 30}
  $targets=@(
    @{number=1868;record='recyS0BqWsDYjYQTU';market='Los Angeles';scope='LA';post='18137012170781129';container='18127636639917943';timestamp='2026-11-21T05:58:13Z'},
    @{number=2859;record='recsS0EQuhCTgDe2e';market='Miami';scope='MIAMI';post='18111262559246476';container='18117163232139610';timestamp='2026-11-21T05:58:55Z'}
  )
  $report.stage='original-source-read'
  $rows=@(ReadS '/rest/v1/platform_outputs?output_number=in.(1868,2859)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,published_at,platform_post_url,test_run_id,error_messages&limit=3')
  if($rows.Count -ne 2){throw 'exact_original_row_count_mismatch'}
  foreach($t in $targets){
    $matched=@($rows | Where-Object {[int]$_.output_number -eq $t.number})
    if($matched.Count -ne 1){throw 'duplicate_or_missing_original'}
    $o=$matched[0];$e=$o.error_messages
    if($o.airtable_record_id -ne $t.record -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Published' -or $o.publish_status -ne 'Published' -or $o.test_run_id -or $o.platform_post_url){throw 'original_state_changed_no_write'}
    if([string]$e.IG_Story_Post_ID -ne $t.post -or [string]$e.Platform_Post_ID -ne $t.post -or [string]$e.IG_Story_Container_ID -ne $t.container -or [string]$e.IG_Story_Status -ne 'Published' -or [string]$e.IG_Story_Published_At -ne $t.timestamp){throw 'original_receipt_mismatch'}
    $at=[DateTimeOffset]::Parse([string]$o.published_at)
    if([Math]::Abs(($at-[DateTimeOffset]::Parse($t.timestamp)).TotalSeconds) -gt 1){throw 'original_timestamp_mismatch'}
    $pr=@(ReadS ('/rest/v1/content_profiles?id=eq.'+[string]$o.content_profile_id+'&select=market_name&limit=2'))
    if($pr.Count -ne 1 -or [string]$pr[0].market_name -ne $t.market){throw 'cross_market_profile'}
  }
  $report.stage='owner-settings-read'
  $settings=@(ReadS '/rest/v1/engagement_settings?select=payload&limit=500')
  $cfg=@{}
  $needed=@('LA_INSTAGRAM_BUSINESS_ACCOUNT_ID','LA_META_GRAPH_API_ACCESS_TOKEN','MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION')
  foreach($row in $settings){
    $p=$row.payload
    if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
    $name=[string]$p.Setting_Name
    if($needed -contains $name){
      if($cfg.ContainsKey($name)){throw 'duplicate_active_owner_setting'}
      $cfg[$name]=[string]$p.Setting_Value
    }
  }
  $ver=[string]$cfg.META_GRAPH_API_VERSION
  if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
  foreach($t in $targets){
    $report.stage=('provider-get-'+[string]$t.number)
    $acct=[string]$cfg[($t.scope+'_INSTAGRAM_BUSINESS_ACCOUNT_ID')]
    $token=[string]$cfg[($t.scope+'_META_GRAPH_API_ACCESS_TOKEN')]
    if($acct -notmatch '^\d{6,30}$' -or -not $token){throw 'owner_credentials_unavailable'}
    $gh=@{Authorization=('Bearer '+$token)}
    function GraphGet([string]$path){
      $report.provider_gets=[int]$report.provider_gets+1
      return Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$path) -Headers $gh -Method Get -TimeoutSec 45
    }
    $owner=GraphGet ($acct+'?fields=id,username')
    if([string]$owner.id -ne $acct -or [string]$owner.username -notmatch '^[a-zA-Z0-9._]+$'){throw 'provider_account_not_exact'}
    $media=GraphGet ([string]$t.post+'?fields=id,permalink,timestamp,media_type')
    if([string]$media.id -ne $t.post){throw 'provider_saved_media_id_mismatch'}
    $container=GraphGet ([string]$t.container+'?fields=id,status_code')
    if([string]$container.id -ne $t.container -or [string]$container.status_code -ne 'PUBLISHED'){throw 'provider_container_not_confirmed_published'}
    $next='https://graph.facebook.com/'+$ver+'/'+$acct+'/stories?fields=id,permalink,timestamp,media_type&limit=100'
    $matches=@();$pages=0;$complete=$false
    while($next -and $pages -lt 3){
      $uri=[Uri]$next
      if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.facebook.com' -or $uri.AbsolutePath -ne ('/'+$ver+'/'+$acct+'/stories')){throw 'untrusted_meta_pagination'}
      $report.provider_gets=[int]$report.provider_gets+1
      $page=Invoke-RestMethod $next -Headers $gh -Method Get -TimeoutSec 45
      if($null -eq $page.data){throw 'provider_stories_scan_incomplete'}
      $pages++
      $matches+=@($page.data | Where-Object {[string]$_.id -eq $t.post})
      $next=[string]$page.paging.next
      if(-not $next){$complete=$true}
    }
    if(-not $complete){throw 'provider_story_pagination_incomplete'}
    if(@($matches).Count -ne 1){throw 'original_media_not_in_owned_stories'}
    $story=$matches[0]
    $stamp=[DateTimeOffset]::Parse([string]$story.timestamp)
    if([Math]::Abs(($stamp-[DateTimeOffset]::Parse($t.timestamp)).TotalMinutes) -gt 10){throw 'provider_story_time_mismatch'}
    if([string]$story.media_type -ne 'VIDEO' -or [string]$media.media_type -ne 'VIDEO'){throw 'provider_story_media_type_mismatch'}
    $link=[string]$story.permalink
    if(-not $link){$link=[string]$media.permalink}
    $expected='^https://(www\.)?instagram\.com/stories/'+[regex]::Escape([string]$owner.username)+'/'
    if($link -notmatch $expected){throw 'provider_story_permalink_not_exact_owner'}
    $report.results+=@{output=$t.number;market=$t.market;verified=$true;owner_username=[string]$owner.username;story_media_id=$t.post;container_status='PUBLISHED';permalink=$link;provider_timestamp=$stamp.UtcDateTime.ToString('o');pages_checked=$pages;scan_complete=$true}
  }
  $report.stage='completed'
  $report.state='read_only_verified'
  $report.reason='both_exact_owned_original_story_receipts_verified_no_mutations'
}catch{
  $msg=[string]$_.Exception.Message
  $known=@('supabase_authority_unverified','runner_env_missing','runner_configuration_missing','supabase_project_mismatch','exact_original_row_count_mismatch','duplicate_or_missing_original','original_state_changed_no_write','original_receipt_mismatch','original_timestamp_mismatch','cross_market_profile','duplicate_active_owner_setting','owner_credentials_unavailable','provider_account_not_exact','provider_saved_media_id_mismatch','provider_container_not_confirmed_published','untrusted_meta_pagination','provider_stories_scan_incomplete','provider_story_pagination_incomplete','original_media_not_in_owned_stories','provider_story_time_mismatch','provider_story_media_type_mismatch','provider_story_permalink_not_exact_owner')
  $report.reason=if($known -contains $msg){$msg}else{'provider_read_unavailable_no_writes'}
}
Write-Output ('IG_STORY_1868_2859_EXACT_GETONLY='+($report|ConvertTo-Json -Compress -Depth 8))
