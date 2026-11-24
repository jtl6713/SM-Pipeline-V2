# Exact Miami Story #5628 reconciliation. No provider/source mutations.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{output=5628;state='blocked';stage='init';reason='not_started';provider_gets=0;provider_writes=0;source_writes=0;account_owned=$false;current_story_scan_complete=$false;historical_nonpublication_proven=$false}
try {
  $report.stage='authority'
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'authority_unverified'}
  $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  function E([string]$name){
    $lines=@(Get-Content $ef | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1)
    if($lines.Count -ne 1){throw 'runner_configuration_missing'}
    return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
  }
  $su=(E 'SUPABASE_URL').TrimEnd('/')
  $key=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'authority_unverified'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  function ReadS([string]$route){return Invoke-RestMethod ($su+$route) -Headers $h -Method Get -TimeoutSec 30}
  $report.stage='exact_source'
  $rows=@(ReadS '/rest/v1/platform_outputs?output_number=eq.5628&select=output_number,airtable_record_id,content_profile_id,platform_output_type,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,publish_retry_eligible,published_at,platform_post_url,studio_preview_url,error_messages&limit=2')
  if($rows.Count -ne 1){throw 'source_identity_mismatch'}
  $o=$rows[0];$e=$o.error_messages
  if($o.airtable_record_id -ne 'rec1Zg5eEJjQKzUDO' -or $o.content_profile_id -ne '65e9071a-d2fd-4898-88a4-111bf8a3bfb5' -or $o.platform_output_type -ne 'Instagram Story' -or $o.output_status -ne 'Ready for Review' -or $o.review_status -ne 'Review Sent' -or $o.publish_status -ne 'Not Ready' -or $o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_retry_eligible -ne $false -or $o.published_at -or $o.platform_post_url -or $e.IG_Story_Post_ID -or $e.Platform_Post_ID -or [string]$e.IG_Story_Container_ID -ne '18116418158139610' -or [int]$e.IG_Story_Attempt_Count -ne 2 -or $o.studio_preview_url -ne 'https://media.chicagoshining.com/studio/previews/repairs/issue2915/miami-1018/po5628-e9f4ad61913fe88a.mp4'){throw 'source_state_changed'}
  $report.stage='owner_settings'
  # Query each exact setting using the same service authorization. Do not
  # rely on PowerShell pipeline enumeration of a REST array or a wide scan.
  $cfg=@{}
  $needed=@('MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION')
  foreach($name in $needed){
    $route='/rest/v1/engagement_settings?select=payload&payload->>Setting_Name=eq.'+[Uri]::EscapeDataString($name)+'&payload->>source=eq.pipeline&payload->>Active=eq.true&limit=2'
    $raw=Invoke-WebRequest ($su+$route) -Headers $h -Method Get -UseBasicParsing -TimeoutSec 30
    $parsed=ConvertFrom-Json -InputObject ([string]$raw.Content)
    $matches=@($parsed | ForEach-Object { $_ })
    if($matches.Count -ne 1){$report.setting_name=$name;$report.setting_count=$matches.Count;throw 'owner_setting_not_unique'}
    $p=$matches[0].payload
    if([string]$p.Setting_Name -ne $name -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){throw 'owner_setting_identity_mismatch'}
    $cfg[$name]=([string]$p.Setting_Value).Trim()
    if(-not $cfg[$name]){$report.setting_name=$name;throw 'owner_credentials_unavailable'}
  }
  $ver=[string]$cfg.META_GRAPH_API_VERSION
  if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
  $acct=[string]$cfg.MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID
  $token=[string]$cfg.MIAMI_META_GRAPH_API_ACCESS_TOKEN
  if($acct -notmatch '^\d{6,30}$' -or -not $token){throw 'owner_credentials_unavailable'}
  $gh=@{Authorization=('Bearer '+$token)}
  function GraphGet([string]$path){
    $report.provider_gets=[int]$report.provider_gets+1
    return Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$path) -Headers $gh -Method Get -TimeoutSec 45
  }
  $report.stage='owner_get'
  $owner=GraphGet ($acct+'?fields=id,username')
  if([string]$owner.id -ne $acct -or [string]$owner.username -notmatch '^[a-zA-Z0-9._]+$'){throw 'owner_account_mismatch'}
  $report.account_owned=$true
  $report.owner_username=[string]$owner.username
  $report.stage='original_container_get'
  $container=GraphGet '18116418158139610?fields=id,status_code'
  if([string]$container.id -ne '18116418158139610'){throw 'container_identity_mismatch'}
  $report.container_status=[string]$container.status_code
  if($report.container_status -ne 'EXPIRED'){throw 'container_not_expired'}
  $report.stage='current_story_inventory'
  $next='https://graph.facebook.com/'+$ver+'/'+$acct+'/stories?fields=id,timestamp,media_type&limit=100'
  $seen=@{};$pages=0;$originalWindowMatches=0
  while($next -and $pages -lt 3){
    $uri=[Uri]$next
    if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.facebook.com' -or $uri.AbsolutePath -ne ('/'+$ver+'/'+$acct+'/stories')){throw 'untrusted_pagination'}
    $report.provider_gets=[int]$report.provider_gets+1
    $page=Invoke-RestMethod $next -Headers $gh -Method Get -TimeoutSec 45
    if($null -eq $page.data){throw 'story_inventory_missing'}
    $pages++
    foreach($s in $page.data){
      if([string]$s.id -notmatch '^\d+$' -or $seen.ContainsKey([string]$s.id)){throw 'story_inventory_invalid'}
      $seen[[string]$s.id]=$true
      $stamp=[DateTimeOffset]::Parse([string]$s.timestamp)
      if([Math]::Abs(($stamp-[DateTimeOffset]::Parse('2026-11-17T10:40:31Z')).TotalHours) -le 24){$originalWindowMatches++}
    }
    $next=[string]$page.paging.next
  }
  if($next){throw 'story_inventory_truncated'}
  $report.current_story_scan_complete=$true
  $report.current_story_count=$seen.Count
  $report.original_window_matches=$originalWindowMatches
  $report.stage='completed'
  $report.state='expired_original_verified'
  $report.reason='exact_account_and_expired_container_verified_current_stories_only_no_historical_absence_claim'
}catch{
  $msg=[string]$_.Exception.Message
  $known=@('authority_unverified','runner_configuration_missing','source_identity_mismatch','source_state_changed','duplicate_owner_setting','owner_setting_not_unique','owner_setting_identity_mismatch','owner_credentials_unavailable','owner_account_mismatch','container_identity_mismatch','container_not_expired','untrusted_pagination','story_inventory_missing','story_inventory_invalid','story_inventory_truncated')
  $report.reason=if($known -contains $msg){$msg}else{'protected_read_unavailable'}
}
Write-Output ('ISSUE2915_STORY_OWNER_GETONLY='+($report|ConvertTo-Json -Compress -Depth 5))
