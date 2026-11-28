# #3159 #3096 exact gallery 10427. Provider GET only; no rebooking or retry authorization.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{output=10427;read_only=$true;owner_verified=$false;inventory_complete=$false;provider_get_calls=0;provider_writes=0;output_writes=0;retry_authorized=$false;posts_scanned=0;exact_caption_candidates=@();reason='unverified'}
function Read-EnvValue([string]$name){
  $line=@(Get-Content -LiteralPath $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
  if($line.Count -ne 1){throw 'missing_runner_config'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
function GraphGet([string]$path,[hashtable]$params){
  $r.provider_get_calls++
  if($r.provider_get_calls -gt 6){throw 'read_budget_exceeded'}
  if($path -ne 'me' -and $path -ne ($page+'/feed')){throw 'unexpected_graph_path'}
  $query=($params.Keys|Sort-Object|ForEach-Object{[uri]::EscapeDataString([string]$_)+'='+[uri]::EscapeDataString([string]$params[$_])}) -join '&'
  return Invoke-RestMethod ('https://graph.facebook.com/'+$version+'/'+$path+'?'+$query) -Method Get -Headers @{Authorization=('Bearer '+$secret);Accept='application/json'} -TimeoutSec 30 -MaximumRedirection 0
}
function Norm([string]$s){return ([regex]::Replace($s.Trim(),'\s+',' ')).Trim()}
try {
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'source_unverified'}
  $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  $url=(Read-EnvValue 'SUPABASE_URL').TrimEnd('/');$key=Read-EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
  if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'source_unverified'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  $q='/rest/v1/platform_outputs?output_number=eq.10427&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,fb_resolved_publish_mode,output_caption,output_hashtags,review_status,output_status,publish_status,auto_publish_enabled,do_not_publish,published_at,platform_post_url,scheduled_post_date,error_messages&limit=2'
  $rows=@(Invoke-RestMethod ($url+$q) -Headers $h -Method Get -TimeoutSec 20)
  if($rows.Count -ne 1){throw 'row_identity'}
  $o=$rows[0]
  if($o.airtable_record_id -ne 'recqpfjbIQQrRZ4ZO' -or $o.platform -ne 'Facebook' -or $o.platform_output_type -ne 'Facebook Photo Set' -or $o.fb_resolved_publish_mode -ne 'Multi-Photo Collage' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Schedule' -or $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $true -or $o.published_at -or $o.platform_post_url){throw 'row_drift'}
  $p=@(Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=airtable_record_id,market_name,active&limit=2') -Headers $h -Method Get -TimeoutSec 20)
  if($p.Count -ne 1 -or $p[0].airtable_record_id -ne 'recgtK8Z7eNADNtVy' -or $p[0].market_name -ne 'New York City' -or $p[0].active -ne $true){throw 'profile_drift'}
  $settings=@(Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 20)
  if($settings.Count -ge 500){throw 'settings_incomplete'}
  $cfg=@{}
  foreach($s in $settings){
    $f=$s.payload;$n=[string]$f.Setting_Name
    if([string]$f.source -eq 'pipeline' -and [string]$f.Active -eq 'true' -and $n -in @('NYC_FACEBOOK_PAGE_ID','NYC_FACEBOOK_PAGE_ACCESS_TOKEN','NYC_FACEBOOK_GRAPH_API_VERSION','FACEBOOK_GRAPH_API_VERSION')){
      if($cfg.ContainsKey($n)){throw 'duplicate_setting'}
      $cfg[$n]=[string]$f.Setting_Value
    }
  }
  $page=$cfg['NYC_FACEBOOK_PAGE_ID'];$secret=$cfg['NYC_FACEBOOK_PAGE_ACCESS_TOKEN']
  $version=$cfg['NYC_FACEBOOK_GRAPH_API_VERSION'];if(-not $version){$version=$cfg['FACEBOOK_GRAPH_API_VERSION']}
  if($page -notmatch '^\d{5,25}$' -or -not $secret -or $version -notmatch '^v\d+\.\d+$'){throw 'owner_config_unavailable'}
  $me=GraphGet 'me' @{fields='id'}
  if([string]$me.id -ne $page){throw 'owner_identity_unverified'}
  $r.owner_verified=$true
  $caption=Norm ([string]$o.output_caption)
  $hashtags=Norm ([string]$o.output_hashtags)
  if($caption.Length -lt 24){throw 'caption_too_short'}
  $expected=Norm ($caption+' '+$hashtags)
  $start=[DateTimeOffset]::Parse([string]$o.error_messages.Studio_Publish_Dispatch_At).AddMinutes(-10).ToUnixTimeSeconds()
  $end=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  if($start -ge $end -or $end-$start -gt 30*86400){throw 'inventory_window_invalid'}
  $params=@{fields='id,message,created_time,permalink_url,attachments{media_type,subattachments{media_type}}';since=[string]$start;until=[string]$end;limit='100'}
  $seen=@{}
  for($i=0;$i -lt 5;$i++){
    $data=GraphGet ($page+'/feed') $params
    if($null -eq $data.data){throw 'provider_inventory_unavailable'}
    foreach($post in @($data.data)){
      $id=[string]$post.id
      if(-not $id -or $seen.ContainsKey($id)){continue}
      $seen[$id]=$true;$r.posts_scanned++
      $message=Norm ([string]$post.message)
      if($message -eq $expected -or $message -eq $caption){
        $r.exact_caption_candidates+=@{post_id=$id;created_time=[string]$post.created_time;owned_page_id_prefix=$id.StartsWith($page+'_');has_permalink=([bool]$post.permalink_url)}
      }
    }
    if(-not $data.paging.next){$r.inventory_complete=$true;break}
    $after=[string]$data.paging.cursors.after
    if(-not $after -or $after -eq $params.after){throw 'pagination_unverified'}
    $params.after=$after
  }
  $r.reason=if($r.exact_caption_candidates.Count){'caption_candidate_requires_media_and_time_proof'}elseif($r.inventory_complete){'no_exact_caption_match_not_negative_publication_proof'}else{'bounded_inventory_incomplete_no_retry'}
}catch{
  $r.reason='owner_or_inventory_unavailable_no_retry'
}
Write-Output ('FB3159_STATUS='+($r|ConvertTo-Json -Compress -Depth 5))
