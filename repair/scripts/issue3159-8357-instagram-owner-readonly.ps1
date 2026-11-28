# #3159 exact Miami gallery 8357. GET only; never rearm or infer absence from a caption search.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$r=[ordered]@{output=8357;read_only=$true;owner_verified=$false;canonical_unchanged=$false;inventory_complete=$false;provider_get_calls=0;provider_writes=0;output_writes=0;retry_authorized=$false;posts_scanned=0;children=@();caption_candidates=@();reason='unverified'}
function Read-EnvValue([string]$name){
  $line=@(Get-Content -LiteralPath $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
  if($line.Count -ne 1){throw 'missing_runner_config'}
  return ([string]$line[0] -split '=',2)[1].Trim().Trim('"',"'")
}
function GraphGet([string]$path,[hashtable]$params){
  $r.provider_get_calls++
  if($r.provider_get_calls -gt 15){throw 'read_budget_exceeded'}
  if($path -ne $account -and $path -ne ($account+'/media') -and $path -notin $childIds){throw 'unexpected_graph_path'}
  $query=($params.Keys|Sort-Object|ForEach-Object{[uri]::EscapeDataString([string]$_)+'='+[uri]::EscapeDataString([string]$params[$_])}) -join '&'
  return Invoke-RestMethod ('https://graph.facebook.com/'+$version+'/'+$path+'?'+$query) -Method Get -Headers @{Authorization=('Bearer '+$secret);Accept='application/json'} -TimeoutSec 20 -MaximumRedirection 0
}
function Norm([string]$s){return ([regex]::Replace($s.Trim(),'\s+',' ')).Trim()}
function Snapshot{
  $rows=@(Invoke-RestMethod ($url+$q) -Headers $h -Method Get -TimeoutSec 20)
  $slides=@(Invoke-RestMethod ($url+$sq) -Headers $h -Method Get -TimeoutSec 20)
  if($rows.Count -ne 1 -or $slides.Count -ne 8){throw 'canonical_identity'}
  return @{row=$rows[0];slides=$slides}
}
try{
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'source_unverified'}
  $envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  $url=(Read-EnvValue 'SUPABASE_URL').TrimEnd('/');$key=Read-EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
  if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'source_unverified'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  $q='/rest/v1/platform_outputs?airtable_record_id=eq.recSiZREAQuoicqm7&select=*&limit=2'
  $sq='/rest/v1/carousel_slides?deleted_from_carousel=eq.false&fields->PO_Output_ID=cs.'+[uri]::EscapeDataString('[8357]')+'&select=airtable_record_id,current_order,ig_child_container_id,fields&order=current_order.asc,airtable_record_id.asc&limit=9'
  $before=Snapshot;$o=$before.row
  if($o.output_number -ne 8357 -or $o.content_profile_id -ne '65e9071a-d2fd-4898-88a4-111bf8a3bfb5' -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.ig_carousel_status -ne 'Children Processing' -or $o.published_at -or $o.platform_post_url -or $o.error_messages.Platform_Post_ID -or $o.error_messages.IG_Carousel_Parent_Container_ID -or $o.error_messages.IG_Carousel_Published_Media_ID -or $o.error_messages.Studio_Publish_Dispatch_Count -ne 8 -or $o.error_messages.Publish_Attempt_Count -ne 1){throw 'row_drift'}
  $childIds=@()
  foreach($slide in $before.slides){
    $id=[string]$slide.ig_child_container_id;$other=[string]$slide.fields.IG_Child_Container_ID
    if(-not $id){$id=$other}
    if($id -notmatch '^\d{6,35}$' -or ($other -and $other -ne $id) -or $id -in $childIds){throw 'child_identity'}
    $childIds+=$id
  }
  $p=@(Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name,active&limit=2') -Headers $h -Method Get -TimeoutSec 20)
  if($p.Count -ne 1 -or $p[0].market_name -ne 'Miami' -or $p[0].active -ne $true){throw 'profile_drift'}
  $settings=@(Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 20)
  if($settings.Count -ge 500){throw 'settings_incomplete'}
  $cfg=@{}
  foreach($s in $settings){
    $f=$s.payload;$n=[string]$f.Setting_Name
    if([string]$f.source -eq 'pipeline' -and [string]$f.Active -eq 'true' -and $n -in @('MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN','MIAMI_FACEBOOK_GRAPH_API_VERSION','FACEBOOK_GRAPH_API_VERSION','MIAMI_META_GRAPH_API_VERSION','META_GRAPH_API_VERSION')){
      if($cfg.ContainsKey($n)){throw 'duplicate_setting'};$cfg[$n]=[string]$f.Setting_Value
    }
  }
  $account=$cfg['MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID'];$secret=$cfg['MIAMI_META_GRAPH_API_ACCESS_TOKEN']
  if(-not $secret){$secret=$cfg['MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN']}
  $version=$cfg['MIAMI_FACEBOOK_GRAPH_API_VERSION'];if(-not $version){$version=$cfg['FACEBOOK_GRAPH_API_VERSION']};if(-not $version){$version=$cfg['MIAMI_META_GRAPH_API_VERSION']};if(-not $version){$version=$cfg['META_GRAPH_API_VERSION']}
  if($account -notmatch '^\d{6,35}$' -or -not $secret -or $version -notmatch '^v\d+\.\d+$'){throw 'owner_config_unavailable'}
  $owner=GraphGet $account @{fields='id'}
  if([string]$owner.id -ne $account){throw 'owner_identity_unverified'}
  $r.owner_verified=$true
  foreach($id in $childIds){
    $status='unavailable'
    try{$child=GraphGet $id @{fields='id,status_code'};if([string]$child.id -eq $id -and $child.status_code -in @('EXPIRED','ERROR','FINISHED','IN_PROGRESS','PUBLISHED')){$status=[string]$child.status_code}}catch{}
    $r.children+=@{id=$id;status=$status}
  }
  $caption=Norm ([string]$o.output_caption);$expected=Norm ($caption+' '+(Norm ([string]$o.output_hashtags)))
  $start=[DateTimeOffset]::Parse([string]$o.error_messages.Studio_Publish_Dispatch_At).AddMinutes(-10)
  $params=@{fields='id,caption,timestamp,media_type,permalink';limit='100'}
  $seen=@{}
  for($i=0;$i -lt 5;$i++){
    $data=GraphGet ($account+'/media') $params
    if($null -eq $data.data){throw 'provider_inventory_unavailable'}
    foreach($post in @($data.data)){
      $id=[string]$post.id;if(-not $id -or $seen.ContainsKey($id)){continue}
      $seen[$id]=$true;$r.posts_scanned++
      $message=Norm ([string]$post.caption)
      if($caption.Length -ge 24 -and ($message -eq $expected -or $message -eq $caption) -and $post.media_type -eq 'CAROUSEL_ALBUM'){
        $r.caption_candidates+=@{id=$id;timestamp=[string]$post.timestamp;has_permalink=[bool]$post.permalink}
      }
    }
    if(-not $data.paging.next){$r.inventory_complete=$true;break}
    $after=[string]$data.paging.cursors.after
    if(-not $after -or $after -eq $params.after){throw 'pagination_unverified'}
    $params.after=$after
  }
  $r.reason='existing_children_and_inventory_observed_no_retry_authorization'
}catch{$r.reason='owner_or_inventory_unavailable_no_retry'}
finally{
  if($before){try{$after=Snapshot;$r.canonical_unchanged=(ConvertTo-Json -InputObject $before -Compress -Depth 100) -eq (ConvertTo-Json -InputObject $after -Compress -Depth 100)}catch{}}
}
Write-Output ('IG3159_STATUS='+($r|ConvertTo-Json -Compress -Depth 6))
