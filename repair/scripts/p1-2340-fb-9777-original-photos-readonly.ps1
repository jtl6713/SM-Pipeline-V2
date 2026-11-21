$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{
  output_number=9777;profile='Miami';read_only=$true;provider_writes=0;output_writes=0;airtable_reads=0;
  expected=8;verified_owned=0;all_photo_ids_retained=$false;page_owned=$false;observations=@();page_stories=@();distinct_page_story_ids=0;owned_story_refs=0;reason='not_started';stage='preflight'
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
  # Previous general JSON array parsing could emit an unexpected envelope
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
      $pageStoryId=[string]$photo.page_story_id
      if($ownedPhoto){$report.verified_owned++}
      $report.observations+=@{
        id=$id;get_ok=$same;page_owned=$ownedPhoto;
        possible_existing_story=($pageStoryId -ne '');page_story_id=$pageStoryId;
        created_time=[string]$photo.created_time
      }
    } catch{
      $report.observations+=@{id=$id;get_ok=$false;page_owned=$false;possible_existing_story=$null}
    }
  }
  # Original photo Page story references may already point to published
  # Facebook posts. Never create a new parent photo set without this audit.
  $report.stage='compare-original-page-story-ids'
  $storyIds=@($report.observations | Where-Object { $_.page_owned -eq $true -and [string]$_.page_story_id -ne '' } | ForEach-Object { [string]$_.page_story_id } | Sort-Object -Unique)
  $report.distinct_page_story_ids=$storyIds.Count
  if($storyIds.Count -gt 8){throw 'too_many_original_page_story_refs'}
  $report.stage='meta-original-page-post-get'
  foreach($sid in $storyIds){
    if($sid -notmatch '^\d{6,30}(_\d{6,30})?$'){
      $report.page_stories+=@{page_story_id=$sid;get_ok=$false;page_owned=$false;reason='unexpected_story_id_format'}
      continue
    }
    try{
      $post=G $sid 'id,from,permalink_url,created_time'
      $sameStory=[string]$post.id -eq $sid
      $fromPage=[string]$post.from.id
      $samePage=$sameStory -and $fromPage -eq $page
      $perma=[string]$post.permalink_url
      if($perma -and $perma -notmatch '^https://(www\.|m\.)?facebook\.com/'){
        $samePage=$false
        $perma=''
      }
      if($samePage){$report.owned_story_refs++}
      $report.page_stories+=@{page_story_id=$sid;get_ok=$sameStory;page_owned=$samePage;permalink=$perma;created_time=[string]$post.created_time}
    }catch{
      $report.page_stories+=@{page_story_id=$sid;get_ok=$false;page_owned=$false}
    }
  }
  # Inspect account-owned Page posts in original creation window, GET only.
  # An absent exact parent in this bounded window is NOT non-delivery proof.
  $report.album_scan=[ordered]@{
    attempted=$false;complete=$false;pages=0;posts=0;exact_eight_attachment_candidates=0;
    candidate_parent_id='';candidate_permalink='';reason='not_started'
  }
  $report.stage='meta-page-post-album-association-get'
  try {
    $scan=$report.album_scan
    $scan.attempted=$true
    $fields='id,from,created_time,permalink_url,attachments.limit(10){target,subattachments.limit(25){target}}'
    $next='https://graph.facebook.com/'+$ver+'/'+$page+'/posts?fields='+[uri]::EscapeDataString($fields)+'&since=2026-11-16&until=2026-11-21&limit=100'
    $seenNext=@{}
    for($pn=0;$pn -lt 5 -and $next;$pn++){
      if($next -notmatch '^https://graph[.]facebook[.]com/' -or $seenNext.ContainsKey($next)){throw 'unsafe_cursor'}
      $seenNext[$next]=$true
      $result=Invoke-RestMethod -Uri $next -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 35
      $scan.pages++
      foreach($post in @($result.data)){
        if($null -eq $post){continue}
        $scan.posts++
        $postId=[string]$post.id
        if($postId -notmatch ('^'+[regex]::Escape($page)+'_\d{6,30}$') -or [string]$post.from.id -ne $page){continue}
        $attachmentIds=@()
        foreach($a in @($post.attachments.data)){
          if($null -eq $a){continue}
          if([string]$a.target.id -match '^\d{12,30}$'){$attachmentIds+=[string]$a.target.id}
          foreach($sub in @($a.subattachments.data)){
            if($null -ne $sub -and [string]$sub.target.id -match '^\d{12,30}$'){$attachmentIds+=[string]$sub.target.id}
          }
        }
        $uniqueAttachments=@($attachmentIds|Sort-Object -Unique)
        $matched=@($ids|Where-Object{$uniqueAttachments -contains $_})
        if($matched.Count -eq 8){
          $scan.exact_eight_attachment_candidates++
          $perma=[string]$post.permalink_url
          if($perma -match '^https://(www[.]|m[.])?facebook[.]com/'){
            $scan.candidate_parent_id=$postId
            $scan.candidate_permalink=$perma
          }else{$scan.reason='attachment_match_but_permalink_unverified'}
        }
      }
      $following=[string]$result.paging.next
      if($following -and $following -notmatch '^https://graph[.]facebook[.]com/'){throw 'unsafe_page_cursor'}
      $next=$following
    }
    $scan.complete=(-not $next)
    if(-not $scan.complete){$scan.reason='pagination_bound_reached_no_absence_claim'}
    elseif($scan.exact_eight_attachment_candidates -eq 1 -and $scan.candidate_parent_id -and $scan.candidate_permalink){
      $scan.reason='exact_eight_attachment_parent_candidate_requires_approval_and_public_verification'
    }elseif($scan.exact_eight_attachment_candidates -gt 1){$scan.reason='multiple_existing_parent_candidates_no_duplicate_publish'}
    else{$scan.reason='no_exact_eight_attachment_parent_in_bounded_window_no_absence_claim'}
  }catch{$report.album_scan.reason='bounded_account_owned_album_get_unavailable'}
  $report.stage='completed'
  $report.reason=if($report.verified_owned -ne 8){'original_photo_ids_incomplete_or_ambiguous_no_publish'}elseif($report.distinct_page_story_ids -eq 0){'eight_owned_photos_without_story_refs_parent_post_not_proven'}elseif($report.distinct_page_story_ids -eq 1 -and $report.owned_story_refs -eq 1){'one_page_owned_existing_story_candidate_parent_attachments_unverified'}elseif($report.distinct_page_story_ids -gt 1){'multiple_original_page_stories_detected_do_not_create_duplicate_parent'}else{'original_page_story_association_ambiguous_no_publish'}
}catch{
  $reason=[string]$_.Exception.Message
  $whitelist=@('not_supabase_authoritative','runner_env_unavailable','runner_config_unavailable','production_project_mismatch','source_output_unavailable','output_state_changed','profile_mismatch','ordered_slide_count_mismatch','photo_slide_not_approved_or_incomplete','duplicate_photo_receipts','parent_photo_receipts_differ','duplicate_active_provider_setting','page_identity_unavailable','page_identity_get_mismatch','too_many_original_page_story_refs')
  $report.exception_type=[string]$_.Exception.GetType().Name
  $report.reason=if($whitelist -contains $reason){$reason}else{'provider_or_runtime_get_unavailable'}
}
Write-Output ('P1_FB9777_RECEIPTS='+($report|ConvertTo-Json -Depth 6 -Compress))
