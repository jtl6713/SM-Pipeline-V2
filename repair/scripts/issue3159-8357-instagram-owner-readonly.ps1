# Exact #8357 evidence only. No provider or output writes; no retry authorization.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{output=8357;read_only=$true;owner_verified=$false;inventory_complete=$false;provider_get_calls=0;provider_writes=0;output_writes=0;retry_authorized=$false;posts_scanned=0;child_statuses=@();exact_caption_candidates=@();canonical_unchanged=$false;reason='unverified';phase='init';failure_class=$null}
$expectedChildren=@('18117284342139610','18117284369139610','18117284408139610','18117284441139610','18117284492139610','18117284531139610','18117284567139610','18117284609139610')
function Read-EnvValue([string]$name){
  $line=@(Get-Content -LiteralPath $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
  if($line.Count -ne 1){throw 'missing_runner_config'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
function GraphGet([string]$path,[hashtable]$params){
  $r.provider_get_calls++
  if($r.provider_get_calls -gt 14){throw 'read_budget_exceeded'}
  if($path -ne $account -and $path -ne ($account+'/media') -and $path -notin $expectedChildren){throw 'unexpected_graph_path'}
  $query=($params.Keys|Sort-Object|ForEach-Object{[uri]::EscapeDataString([string]$_)+'='+[uri]::EscapeDataString([string]$params[$_])}) -join '&'
  return Invoke-RestMethod ('https://graph.facebook.com/'+$version+'/'+$path+'?'+$query) -Method Get -Headers @{Authorization=('Bearer '+$secret);Accept='application/json'} -TimeoutSec 25 -MaximumRedirection 0
}
function Read-Rows([string]$path){
  $value=Invoke-RestMethod ($url+$path) -Headers $h -Method Get -TimeoutSec 20
  foreach($item in $value){ Write-Output $item }
}
function Norm([string]$s){return ([regex]::Replace($s.Trim(),'\s+',' ')).Trim()}
try {
  $r.phase='runner_health'
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'source_unverified'}
  $r.phase='runner_config'
  $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  $url=(Read-EnvValue 'SUPABASE_URL').TrimEnd('/');$key=Read-EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
  if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'source_unverified'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  $q='/rest/v1/platform_outputs?output_number=eq.8357&select=*&limit=2'
  $r.phase='canonical_output'
  $rows=@(Read-Rows $q)
  if($rows.Count -ne 1){throw 'row_identity'}
  $o=$rows[0]
  if($o.airtable_record_id -ne 'recSiZREAQuoicqm7' -or $o.content_profile_id -ne '65e9071a-d2fd-4898-88a4-111bf8a3bfb5' -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.ig_carousel_status -ne 'Children Processing' -or $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $true -or $o.published_at -or $o.platform_post_url -or [int]$o.error_messages.Studio_Publish_Dispatch_Count -ne 8 -or [int]$o.error_messages.Publish_Attempt_Count -ne 1 -or $o.error_messages.IG_Carousel_Parent_Container_ID -or $o.error_messages.IG_Carousel_Published_Media_ID -or $o.error_messages.Platform_Post_ID -or $o.error_messages.Platform_Media_ID){throw 'row_drift'}
  $r.phase='canonical_profile'
  $p=@(Read-Rows ('/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=airtable_record_id,market_name,active&limit=2'))
  if($p.Count -ne 1 -or $p[0].airtable_record_id -ne 'recpNlNn6U6eq0M9r' -or $p[0].market_name -ne 'Miami' -or $p[0].active -ne $true){throw 'profile_drift'}
  $sq='/rest/v1/carousel_slides?deleted_from_carousel=eq.false&fields-%3EPO_Output_ID=cs.%5B8357%5D&select=airtable_record_id,current_order,fields&order=current_order.asc&limit=9'
  $r.phase='canonical_slides'
  $slides=@(Read-Rows $sq)
  $actual=@($slides|ForEach-Object{[string]$_.fields.IG_Child_Container_ID})
  if($slides.Count -ne 8 -or ($actual -join ',') -ne ($expectedChildren -join ',')){throw 'child_identity_changed'}
  $r.phase='destination_config'
  $wanted=@('MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN','MIAMI_FACEBOOK_GRAPH_API_VERSION','FACEBOOK_GRAPH_API_VERSION','MIAMI_META_GRAPH_API_VERSION','META_GRAPH_API_VERSION')
  $filter=[uri]::EscapeDataString('in.('+($wanted -join ',')+')')
  $settings=@(Read-Rows ('/rest/v1/engagement_settings?select=payload&payload-%3E%3ESetting_Name='+$filter+'&payload-%3E%3Esource=eq.pipeline&limit=16'))
  if($settings.Count -eq 0 -or $settings.Count -ge 16){throw 'settings_incomplete'}
  $cfg=@{}
  foreach($s in $settings){
    $f=$s.payload;$n=[string]$f.Setting_Name
    if([string]$f.source -eq 'pipeline' -and [string]$f.Active -eq 'true' -and $n -in @('MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN','MIAMI_FACEBOOK_GRAPH_API_VERSION','FACEBOOK_GRAPH_API_VERSION','MIAMI_META_GRAPH_API_VERSION','META_GRAPH_API_VERSION')){
      if($cfg.ContainsKey($n)){throw 'duplicate_setting'}
      $cfg[$n]=[string]$f.Setting_Value
    }
  }
  $account=$cfg['MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID'];$secret=$cfg['MIAMI_META_GRAPH_API_ACCESS_TOKEN']
  if(-not $secret){$secret=$cfg['MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN']}
  $version=$cfg['MIAMI_FACEBOOK_GRAPH_API_VERSION'];if(-not $version){$version=$cfg['FACEBOOK_GRAPH_API_VERSION']}
  if(-not $version){$version=$cfg['MIAMI_META_GRAPH_API_VERSION']};if(-not $version){$version=$cfg['META_GRAPH_API_VERSION']}
  if($account -notmatch '^\d{6,35}$' -or -not $secret -or $version -notmatch '^v\d+\.\d+$'){throw 'owner_config_unavailable'}
  $r.phase='owner_graph_get'
  $me=GraphGet $account @{fields='id'}
  if([string]$me.id -ne $account){throw 'owner_identity_unverified'}
  $r.owner_verified=$true
  $r.phase='saved_child_graph_get'
  foreach($child in $expectedChildren){
    $state='unavailable'
    try{
      $v=GraphGet $child @{fields='id,status_code'}
      if([string]$v.id -eq $child -and [string]$v.status_code -in @('IN_PROGRESS','FINISHED','ERROR','EXPIRED','PUBLISHED')){$state=[string]$v.status_code}
    }catch{}
    $r.child_statuses+=@{id=$child;status=$state}
  }
  $r.phase='bounded_media_inventory'
  $caption=Norm ([string]$o.output_caption);$hashtags=Norm ([string]$o.output_hashtags)
  if($caption.Length -lt 24){throw 'caption_too_short'}
  $expected=Norm ($caption+' '+$hashtags)
  $start=[DateTimeOffset]::Parse([string]$o.error_messages.Studio_Publish_Dispatch_At).AddMinutes(-10)
  $params=@{fields='id,caption,timestamp,media_type,permalink';limit='100'}
  $seen=@{}
  for($i=0;$i -lt 5;$i++){
    $data=GraphGet ($account+'/media') $params
    if($null -eq $data.data){throw 'provider_inventory_unavailable'}
    $older=$false
    foreach($post in @($data.data)){
      $id=[string]$post.id
      if(-not $id -or $seen.ContainsKey($id)){continue}
      $seen[$id]=$true;$r.posts_scanned++
      $stamp=[DateTimeOffset]::Parse([string]$post.timestamp)
      if($stamp -lt $start){$older=$true;continue}
      $message=Norm ([string]$post.caption)
      if($message -eq $expected -or $message -eq $caption){
        $r.exact_caption_candidates+=@{media_id=$id;timestamp=[string]$post.timestamp;media_type=[string]$post.media_type;has_permalink=([bool]$post.permalink)}
      }
    }
    if(-not $data.paging.next){$r.inventory_complete=$true;break}
    if($older){break}
    $after=[string]$data.paging.cursors.after
    if(-not $after -or $after -eq $params.after){throw 'pagination_unverified'}
    $params.after=$after
  }
  $r.phase='canonical_readback'
  $again=@(Read-Rows $q)
  $slidesAgain=@(Read-Rows $sq)
  $r.canonical_unchanged=($again.Count -eq 1 -and (ConvertTo-Json $again[0] -Depth 100 -Compress) -eq (ConvertTo-Json $o -Depth 100 -Compress) -and (ConvertTo-Json -InputObject $slidesAgain -Depth 100 -Compress) -eq (ConvertTo-Json -InputObject $slides -Depth 100 -Compress))
  $r.reason=if(-not $r.canonical_unchanged){'canonical_changed_no_retry'}elseif($r.exact_caption_candidates.Count){'caption_candidates_require_exact_media_proof'}else{'no_exact_receipt_no_retry'}
  $r.phase='complete'
}catch{
  # Report only a finite known internal reason or exception type; never raw
  # HTTP errors, request URLs, secret material, settings or provider bodies.
  $known=@('missing_runner_config','read_budget_exceeded','unexpected_graph_path','source_unverified','row_identity','row_drift','profile_drift','child_identity_changed','settings_incomplete','duplicate_setting','owner_config_unavailable','owner_identity_unverified','caption_too_short','provider_inventory_unavailable','pagination_unverified')
  $m=[string]$_.Exception.Message
  $r.failure_class=if($m -in $known){$m}else{$_.Exception.GetType().Name}
  $r.reason='owner_or_inventory_unavailable_no_retry'
}
Write-Output ('IG3159_STATUS='+($r|ConvertTo-Json -Compress -Depth 6))
