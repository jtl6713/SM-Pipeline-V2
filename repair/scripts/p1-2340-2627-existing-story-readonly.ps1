# Read-only provider-side recovery of NYC #2627's one previously fenced publish.
# Never attempt to publish/retry/create original or replacement Meta media.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$out=[ordered]@{output=2627;read_only=$true;provider_gets=0;provider_writes=0;output_writes=0;airtable_reads=0;reason='preflight_blocked';original_new_container='18134595583783117';container_status='';recent_stories_count=0;matching_window_count=0;window_candidates=@();identity_confirmed=$false}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E([string]$name){$ln=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1);if($ln.Count -ne 1){throw 'config_absent'};return ([string]$ln[0] -split '=',2)[1].Trim().Trim('"',"'")}
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'runner_not_supabase_authoritative'}
$su=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_prod_supabase'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$o=@(Invoke-RestMethod ($su+'/rest/v1/platform_outputs?output_number=eq.2627&select=airtable_record_id,output_number,content_profile_id,platform,platform_output_type,publish_status,do_not_publish,published_at,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25)
if($o.Count -ne 1 -or $o[0].airtable_record_id -ne 'rec84IjfUIcvTHDKc' -or $o[0].publish_status -ne 'Failed' -or $o[0].platform -ne 'Instagram' -or $o[0].platform_output_type -ne 'Instagram Story' -or $o[0].do_not_publish -ne $true -or $o[0].published_at -or $o[0].platform_post_url){throw 'original_output_drift'}
$bag=$o[0].error_messages
if([string]$bag.P1_2340_Story_Replacement_Container_ID -ne '18134595583783117' -or [string]$bag.P1_2340_Story_Replacement_Create_Fence -ne 'P1-2340:2627:approved-expired-story-replacement-create-v1' -or $bag.IG_Story_Post_ID -or $bag.P1_2340_Story_Replacement_Publish_Fence){throw 'expected_saved_ambiguous_post_state_drift'}
$events=@(Invoke-RestMethod ($su+'/rest/v1/quality_agent_recovery_events?output_number=eq.2627&select=event_key,outcome&limit=3') -Headers $h -Method Get -TimeoutSec 25)
if($events.Count -ne 2 -or @($events|Where-Object{$_.event_key -eq 'P1-2340:2627:approved-expired-story-replacement-create-v1'}).Count -ne 1 -or @($events|Where-Object{$_.event_key -eq 'P1-2340:2627:approved-expired-story-replacement-publish-v1'}).Count -ne 1){throw 'both_one_time_original_fences_not_verified'}
$p=@(Invoke-RestMethod ($su+'/rest/v1/content_profiles?id=eq.'+$o[0].content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25)
if($p.Count -ne 1 -or $p[0].market_name -ne 'New York City'){throw 'not_original_NYC_account'}
$s=Invoke-RestMethod ($su+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$cfg=@{}
foreach($row in $s){$v=$row.payload;$name=[string]$v.Setting_Name;if([string]$v.source -eq 'pipeline' -and [string]$v.Active -eq 'True' -and @('NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','NYC_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION') -contains $name){if($cfg.ContainsKey($name)){throw 'duplicate_setting'};$cfg[$name]=[string]$v.Setting_Value}}
$acct=[string]$cfg.NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID;$token=[string]$cfg.NYC_META_GRAPH_API_ACCESS_TOKEN
$ver=[string]$cfg.META_GRAPH_API_VERSION;if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $acct -notmatch '^\d{6,30}$'){throw 'missing_NYC_Meta_credential'}
$gh=@{Authorization=('Bearer '+$token)}
function G([string]$uri){if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'invalid_api_host'};$out.provider_gets++;return Invoke-RestMethod $uri -Method Get -Headers $gh -TimeoutSec 50}
$own=G ('https://graph.facebook.com/'+$ver+'/'+$acct+'?fields=id')
if([string]$own.id -ne $acct){throw 'provider_ownership_mismatch'}
$original=G ('https://graph.facebook.com/'+$ver+'/18134595583783117?fields=id,status_code')
if([string]$original.id -ne '18134595583783117'){throw 'new_original_container_id_mismatch'}
$out.container_status=[string]$original.status_code
if($out.container_status -eq 'PUBLISHED'){
  # Only count unique recent owned-account Stories in the original publish window.
  # A timestamp match is a candidate, not proof that a specific original video was posted.
  $stories=G ('https://graph.facebook.com/'+$ver+'/'+$acct+'/stories?fields=id,media_type,permalink,timestamp&limit=100')
  if($null -eq $stories.data){throw 'stories_page_unavailable'}
  if($stories.paging.next){throw 'stories_page_incomplete'}
  $out.recent_stories_count=@($stories.data).Count
  $start=[DateTimeOffset]::Parse('2026-11-21T07:25:48Z')
  $end=[DateTimeOffset]::Parse('2026-11-21T07:27:30Z')
  foreach($story in @($stories.data)){
    if(-not $story.timestamp){continue}
    try{$at=[DateTimeOffset]::Parse([string]$story.timestamp)}catch{continue}
    if($at -lt $start -or $at -gt $end){continue}
    if([string]$story.id -notmatch '^\d{12,30}$'){throw 'candidate_id_not_verified'}
    $out.window_candidates+=@{id=[string]$story.id;media_type=[string]$story.media_type;timestamp=[string]$story.timestamp;permalink=[string]$story.permalink}
  }
  $out.matching_window_count=$out.window_candidates.Count
  $out.reason=if($out.matching_window_count -eq 1){'PUBLISHED_one_timed_owner_candidate_not_cryptographically_linked_to_original_video'}elseif($out.matching_window_count -eq 0){'PUBLISHED_but_no_owner_story_in_window'}else{'PUBLISHED_multiple_owner_stories_ambiguous'}
}else{
  $out.reason='existing_container_'+$out.container_status+'_no_replay'
}
Write-Output ('P1_2627_ORIGINAL_RECEIPT_GET='+($out|ConvertTo-Json -Compress -Depth 8))
