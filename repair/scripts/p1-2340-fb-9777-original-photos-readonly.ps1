$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{
  output_number=9777;profile='Miami';read_only=$true;provider_writes=0;output_writes=0;airtable_reads=0;
  expected=8;verified_owned=0;all_photo_ids_retained=$false;page_owned=$false;observations=@();reason='not_started';stage='preflight'
}
try {
  $report.stage='authority-health'
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'not_supabase_authoritative'}
  $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  if(-not(Test-Path $ef)){throw 'runner_env_unavailable'}
  function E($n){
    $lines=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1)
    if($lines.Count -ne 1){throw 'runner_config_unavailable'}
    return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
  }
  $report.stage='production-config'
  $url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($url -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'production_project_mismatch'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  $report.stage='read-original-output'
  $r=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.9777&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,publish_status,do_not_publish,auto_publish_enabled,image_count,published_at,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25
  if(@($r).Count -ne 1){throw 'source_output_unavailable'}
  $o=$r[0]
  if($o.airtable_record_id -ne 'recmd8mSZlqbRBh8K' -or $o.platform -ne 'Facebook' -or $o.platform_output_type -ne 'Facebook Photo Set' -or $o.publish_status -ne 'Ready to Schedule' -or $o.image_count -ne 8 -or $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $false -or $o.platform_post_url -or $o.published_at){throw 'output_state_changed'}
  $report.stage='read-profile'
  $p=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 20
  if(@($p).Count -ne 1 -or $p[0].market_name -ne 'Miami'){throw 'profile_mismatch'}
  $report.stage='read-original-slides'
  $slides=Invoke-RestMethod ($url+'/rest/v1/carousel_slides?fields->>PO_Output_ID=eq.%5B9777%5D&select=airtable_record_id,current_order,deleted_from_carousel,fields&limit=20') -Headers $h -Method Get -TimeoutSec 30
  $report.stage='check-ordered-approved-slides'
  $owned=@($slides|Where-Object { @($_.fields.'Platform Output') -contains $o.airtable_record_id }|Sort-Object current_order)
  if($owned.Count -ne 8){throw 'ordered_slide_count_mismatch'}
  $ids=@();$n=0
  foreach($slide in $owned){
    $n++
    $id=[string]$slide.fields.FB_Photo_ID
    if($slide.current_order -ne $n -or $slide.deleted_from_carousel -eq $true -or
       [string]$slide.fields.'Review Status' -ne 'Final Approved' -or
       [string]$slide.fields.Shared_Asset_Approved -ne 'True' -or
       $id -notmatch '^\d{12,30}$'){throw 'photo_slide_not_approved_or_incomplete'}
    $ids+= $id
  }
  if(@($ids|Select-Object -Unique).Count -ne 8){throw 'duplicate_photo_receipts'}
  # ConvertFrom-Json can emit one nested array rather than eight scalar
  # pipeline elements; keep the JSON array shape explicit using System.Text.Json.
  $report.stage='compare-saved-photo-identities'
  $report.stage='read-parent-ids-json-string'
  $saved=[string]$o.error_messages.FB_Photo_IDs_JSON
  if(-not $saved){throw 'parent_photo_receipts_differ'}
  $report.stage='parse-parent-json-document'
  # This source column is a JSON array of exactly eight digit-only photo IDs.
  # Windows Ops PowerShell may not load System.Text.Json. Validate the entire
  # syntax before extracting digit captures; never interpret arbitrary JSON.
  $report.stage='validate-strict-parent-id-array'
  $strictPattern='^\[\s*"\d{12,30}"\s*(,\s*"\d{12,30}"){7}\s*\]$'
  if($saved -cnotmatch $strictPattern){throw 'parent_photo_receipts_differ'}
  $report.stage='enumerate-strict-photo-ids'
  $photoIdTokens=[regex]::Matches($saved,'"(\d{12,30})"')
  if($photoIdTokens.Count -ne 8){throw 'parent_photo_receipts_differ'}
  $savedIds=@()
  foreach($tokenMatch in $photoIdTokens){$savedIds += [string]$tokenMatch.Groups[1].Value}
  $report.stage='compare-parent-photo-count'
  if($savedIds.Count -ne 8){throw 'parent_photo_receipts_differ'}
  $report.stage='compare-all-ordered-photo-ids'
  for($i=0;$i -lt 8;$i++){
    if([string]$savedIds[$i] -cne [string]$ids[$i]){throw 'parent_photo_receipts_differ'}
  }
  $report.stage='parent-and-slides-match'
  $report.all_photo_ids_retained=$true
  $report.stage='read-owner-config'
  $rows=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
  $cfg=@{}
  foreach($item in $rows){
    $x=$item.payload
    if([string]$x.source -ne 'pipeline' -or [string]$x.Active -ne 'True'){continue}
    $name=[string]$x.Setting_Name
    if(@('MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN','MIAMI_FACEBOOK_PAGE_ID','META_GRAPH_API_VERSION') -contains $name){
      if($cfg.ContainsKey($name)){throw 'duplicate_active_provider_setting'}
      $cfg[$name]=[string]$x.Setting_Value
    }
  }
  $token=[string]$cfg.MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN;$page=[string]$cfg.MIAMI_FACEBOOK_PAGE_ID
  $ver=[string]$cfg.META_GRAPH_API_VERSION
  if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
  if(-not $token -or $page -notmatch '^\d{6,30}$'){throw 'page_identity_unavailable'}
  function G($id,$fields){
    $result=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 35
    return $result
  }
  $report.stage='meta-page-owner-get'
  $owner=G $page 'id'
  if([string]$owner.id -ne $page){throw 'page_identity_get_mismatch'}
  $report.page_owned=$true
  $report.stage='meta-photo-ids-get'
  foreach($id in $ids){
    try{
      $photo=G $id 'id,from,page_story_id,created_time'
      $same=[string]$photo.id -eq $id
      $from=[string]$photo.from.id
      $ownedPhoto=$same -and $from -eq $page
      if($ownedPhoto){$report.verified_owned++}
      $report.observations+=@{
        id=$id;get_ok=$same;page_owned=$ownedPhoto;
        possible_existing_story=([string]$photo.page_story_id -ne '');
        created_time=[string]$photo.created_time
      }
    } catch{
      $report.observations+=@{id=$id;get_ok=$false;page_owned=$false;possible_existing_story=$null}
    }
  }
  $report.stage='completed'
  $report.reason=if($report.verified_owned -eq 8 -and @($report.observations|Where-Object{$_.possible_existing_story -eq $true}).Count -eq 0){'all_eight_original_photo_receipts_owned_no_saved_story_but_public_post_not_proven_absent'}else{'original_photo_ids_incomplete_or_ambiguous_no_publish'}
}catch{
  $reason=[string]$_.Exception.Message
  $whitelist=@('not_supabase_authoritative','runner_env_unavailable','runner_config_unavailable','production_project_mismatch','source_output_unavailable','output_state_changed','profile_mismatch','ordered_slide_count_mismatch','photo_slide_not_approved_or_incomplete','duplicate_photo_receipts','parent_photo_receipts_differ','duplicate_active_provider_setting','page_identity_unavailable','page_identity_get_mismatch')
  $report.exception_type=[string]$_.Exception.GetType().Name
  $report.reason=if($whitelist -contains $reason){$reason}else{'provider_or_runtime_get_unavailable'}
}
Write-Output ('P1_FB9777_RECEIPTS='+($report|ConvertTo-Json -Depth 6 -Compress))
