# P1 #2340 — NYC Story #2627 READ ONLY. Never recreate or republish fenced provider operations.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$report=[ordered]@{output=2627;provider_gets=0;provider_writes=0;source_writes=0;airtable_ops=0;content_verified=$false;frame_mae=@();state='blocked';old_container_status='';replacement_container_status='';publish_fence_reserved=$false;account_owned=$false;recent_stories_checked=0;candidate_count=0;candidates=@();scan_complete=$false;reason='not_started';stage='init'}
try {
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'authority_not_supabase'}
  $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  if(-not(Test-Path $ef)){throw 'runner_env_missing'}
  function E($name){$ls=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1);if($ls.Count -ne 1){throw 'config_missing'};return ([string]$ls[0] -split '=',2)[1].Trim().Trim('"',"'")}
  $su=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($su -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'project_identity_mismatch'}
  $h=@{apikey=$key;Authorization=('Bearer '+$key)}
  function ReadS($route){return Invoke-RestMethod ($su+$route) -Method Get -Headers $h -TimeoutSec 30}
  $report.stage='read-original-output'
  $rs=ReadS '/rest/v1/platform_outputs?output_number=eq.2627&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,output_status,publish_status,published_at,platform_post_url,do_not_publish,auto_publish_enabled,publish_retry_eligible,publish_asset_url,error_messages&limit=2'
  if(@($rs).Count -ne 1){throw 'source_row_missing'}
  $o=$rs[0];$e=$o.error_messages
  if($o.output_number -ne 2627 -or $o.airtable_record_id -ne 'rec84IjfUIcvTHDKc' -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Failed' -or $o.published_at -or $o.platform_post_url -or $o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_retry_eligible -ne $false){throw 'source_original_state_not_exact'}
  $old='18132638605783117';$new='18134595583783117'
  if([string]$e.IG_Story_Container_ID -ne $old -or [string]$e.P1_2340_Story_Replacement_Container_ID -ne $new -or [string]$e.P1_2340_Story_Replacement_Create_Fence -ne 'P1-2340:2627:approved-expired-story-replacement-create-v1' -or [string]$e.IG_Story_Post_ID){throw 'saved_original_and_replacement_not_exact'}
  $report.stage='read-durable-fences'
  $events=ReadS '/rest/v1/quality_agent_recovery_events?output_number=eq.2627&select=event_key,outcome&limit=10'
  $create=@($events|Where-Object{$_.event_key -eq 'P1-2340:2627:approved-expired-story-replacement-create-v1' -and $_.outcome -eq 'approved_fresh_story_create_reserved'})
  $publish=@($events|Where-Object{$_.event_key -eq 'P1-2340:2627:approved-expired-story-replacement-publish-v1' -and $_.outcome -eq 'approved_fresh_story_publish_reserved'})
  if($create.Count -ne 1 -or $publish.Count -ne 1){throw 'ambiguous_publish_fence_not_verified'}
  $report.publish_fence_reserved=$true
  $report.stage='read-profile'
  $profileRows=ReadS ('/rest/v1/content_profiles?id=eq.'+[string]$o.content_profile_id+'&select=market_name&limit=2')
  if(@($profileRows).Count -ne 1 -or [string]$profileRows[0].market_name -ne 'New York City'){throw 'profile_not_nyc'}
  $report.stage='read-provider-settings'
  $settings=ReadS '/rest/v1/engagement_settings?select=payload&limit=500'
  $cfg=@{}
  foreach($item in $settings){$p=$item.payload
    if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
    $n=[string]$p.Setting_Name
    if(@('NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','NYC_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION') -contains $n){
      if($cfg.ContainsKey($n)){throw 'duplicate_active_owner_setting'}
      $cfg[$n]=[string]$p.Setting_Value
    }
  }
  $report.stage='validate-owner-configuration'
  $acct=[string]$cfg.NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID;$token=[string]$cfg.NYC_META_GRAPH_API_ACCESS_TOKEN;$ver=[string]$cfg.META_GRAPH_API_VERSION
  if($acct -notmatch '^\d{6,30}$' -or -not $token){throw 'owner_credentials_unavailable'}
  if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
  $gh=@{Authorization=('Bearer '+$token)}
  function GraphGet($route){
    return Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$route) -Method Get -Headers $gh -TimeoutSec 40
  }
  $report.stage='graph-owner-get'
  $report.provider_gets=[int]$report.provider_gets+1
  $owner=GraphGet ($acct+'?fields=id')
  if([string]$owner.id -ne $acct){throw 'owner_id_not_verified'}
  $report.account_owned=$true
  $report.stage='graph-original-container-get'
  $report.provider_gets=[int]$report.provider_gets+1
  $oldGet=GraphGet ($old+'?fields=id,status_code')
  if([string]$oldGet.id -ne $old){throw 'old_container_owner_check_failed'}
  $report.old_container_status=[string]$oldGet.status_code
  if($report.old_container_status -ne 'EXPIRED'){throw 'old_container_not_expired'}
  $report.stage='graph-replacement-container-get'
  $report.provider_gets=[int]$report.provider_gets+1
  $newGet=GraphGet ($new+'?fields=id,status_code')
  if([string]$newGet.id -ne $new){throw 'new_container_owner_check_failed'}
  $report.replacement_container_status=[string]$newGet.status_code
  $report.stage='graph-owner-story-list'
  $next='https://graph.facebook.com/'+$ver+'/'+$acct+'/stories?fields=id,permalink,timestamp,media_type&limit=100'
  $attempt=[DateTimeOffset]::Parse('2026-11-21T07:25:53Z')
  $from=$attempt.AddMinutes(-2);$to=$attempt.AddMinutes(8)
  for($page=0;$page -lt 3 -and $next;$page++){
    $uri=[uri]$next
    if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.facebook.com' -or $uri.AbsolutePath -notmatch ('^/'+[regex]::Escape($ver)+'/'+$acct+'/stories$')){throw 'untrusted_meta_pagination'}
    $report.provider_gets++
    $data=Invoke-RestMethod $next -Method Get -Headers $gh -TimeoutSec 40
    foreach($story in @($data.data)){
      $report.recent_stories_checked++
      $ts=[DateTimeOffset]::MinValue
      try{$ts=[DateTimeOffset]::Parse([string]$story.timestamp)}catch{}
      if($ts -ge $from -and $ts -le $to){
        $id=[string]$story.id;$perma=[string]$story.permalink
        if($id -notmatch '^\d{12,30}$'){throw 'recent_story_media_id_unverified'}
        if($perma -and $perma -notmatch '^https://(www\.)?instagram\.com/'){throw 'recent_story_permalink_unverified'}
        $report.candidates+=@{media_id=$id;timestamp=$ts.UtcDateTime.ToString('o');permalink=$perma;type=[string]$story.media_type}
      }
    }
    $next=[string]$data.paging.next
    if(-not $next){$report.scan_complete=$true}
  }
  $report.candidate_count=@($report.candidates).Count

  # A matching timestamp alone is not sufficient. Prove the exact original video by
  # comparing two decoded grayscale frames with the owner-scoped Graph Story video.
  if($report.scan_complete -and $report.candidate_count -eq 1 -and $report.replacement_container_status -eq 'PUBLISHED') {
    $report.stage='graph-candidate-media-proof'
    $candidate=$report.candidates[0]
    if([string]$candidate.media_id -ne '18121057825795225' -or
       [string]$candidate.permalink -ne 'https://www.instagram.com/stories/newyorkshining/4035137750906687672' -or
       [string]$candidate.type -ne 'VIDEO'){throw 'candidate_id_or_permalink_drift'}
    $utc=[DateTimeOffset]::Parse([string]$candidate.timestamp)
    if([math]::Abs(($utc-$attempt).TotalSeconds) -gt 20){throw 'candidate_timestamp_not_tied_to_fence'}
    if([string]$o.publish_asset_url -ne 'https://media.chicagoshining.com/studio/previews/rec84IjfUIcvTHDKc/current.mp4'){throw 'original_approved_video_asset_changed'}
    $report.provider_gets=[int]$report.provider_gets+1
    $remote=GraphGet ('18121057825795225?fields=id,media_type,media_url,permalink,timestamp')
    if([string]$remote.id -ne [string]$candidate.media_id -or [string]$remote.media_type -ne 'VIDEO' -or
       [string]$remote.permalink -ne [string]$candidate.permalink -or
       [DateTimeOffset]::Parse([string]$remote.timestamp) -ne $utc){throw 'provider_exact_media_metadata_mismatch'}
    $cdn=[uri]([string]$remote.media_url)
    if($cdn.Scheme -ne 'https' -or $cdn.Host -notmatch '(^|\.)(fbcdn\.net|cdninstagram\.com)
  if(-not $report.content_verified){$report.reason=if(-not $report.scan_complete){'pagination_incomplete_no_conclusion'}elseif($report.candidate_count -eq 1){'one_timestamp_candidate_but_media_identity_unproven_no_source_change'}elseif($report.candidate_count -eq 0){'no_timed_story_candidate_not_proof_of_nonpublication'}else{'multiple_candidates_no_identity_conclusion'}}
}catch {
  $msg=[string]$_.Exception.Message
  $approved=@('authority_not_supabase','runner_env_missing','config_missing','project_identity_mismatch','source_row_missing','source_original_state_not_exact','saved_original_and_replacement_not_exact','ambiguous_publish_fence_not_verified','profile_not_nyc','duplicate_active_owner_setting','owner_credentials_unavailable','owner_id_not_verified','old_container_owner_check_failed','old_container_not_expired','new_container_owner_check_failed','untrusted_meta_pagination','recent_story_media_id_unverified','recent_story_permalink_unverified','candidate_id_or_permalink_drift','candidate_timestamp_not_tied_to_fence','original_approved_video_asset_changed','provider_exact_media_metadata_mismatch','provider_video_url_host_untrusted','ffmpeg_not_available_to_compare_media','video_download_size_out_of_bounds','original_frame_decode_failed','provider_frame_decode_failed','decoded_frame_size_not_exact','provider_and_approved_frames_not_similar_enough')
  $report.reason=if($approved -contains $msg){$msg}else{'provider_get_unavailable_no_writes'}
}
Write-Output ('P1_2340_2627_OWNED_STORY_GETONLY='+($report|ConvertTo-Json -Compress -Depth 8))
){throw 'provider_video_url_host_untrusted'}
    $ff=Get-Command ffmpeg -ErrorAction SilentlyContinue
    if($null -eq $ff -or -not $ff.Source){throw 'ffmpeg_not_available_to_compare_media'}
    $tmp=Join-Path ([System.IO.Path]::GetTempPath()) ('p1-2340-2627-'+[guid]::NewGuid().ToString('N'))
    New-Item -Path $tmp -ItemType Directory -ErrorAction Stop | Out-Null
    try {
      $report.stage='download-original-and-provider-videos-getonly'
      $src=Join-Path $tmp 'original.mp4';$dst=Join-Path $tmp 'provider.mp4'
      Invoke-WebRequest -Uri ([string]$o.publish_asset_url) -Method Get -OutFile $src -TimeoutSec 90 | Out-Null
      Invoke-WebRequest -Uri $cdn.AbsoluteUri -Method Get -OutFile $dst -TimeoutSec 90 | Out-Null
      $sz1=(Get-Item $src).Length;$sz2=(Get-Item $dst).Length
      if($sz1 -lt 100000 -or $sz2 -lt 100000 -or $sz1 -gt 104857600 -or $sz2 -gt 104857600){throw 'video_download_size_out_of_bounds'}
      $report.stage='compare-two-decoded-video-frames'
      foreach($sec in @(1,3)) {
        $a=Join-Path $tmp ('original-'+$sec+'.raw')
        $b=Join-Path $tmp ('provider-'+$sec+'.raw')
        & $ff.Source -hide_banner -loglevel error -ss ([string]$sec) -i $src -vf 'scale=64:112:flags=bicubic,format=gray' -frames:v 1 -f rawvideo -y $a 2>$null
        if($LASTEXITCODE -ne 0){throw 'original_frame_decode_failed'}
        & $ff.Source -hide_banner -loglevel error -ss ([string]$sec) -i $dst -vf 'scale=64:112:flags=bicubic,format=gray' -frames:v 1 -f rawvideo -y $b 2>$null
        if($LASTEXITCODE -ne 0){throw 'provider_frame_decode_failed'}
        $p=[IO.File]::ReadAllBytes($a);$q=[IO.File]::ReadAllBytes($b)
        if($p.Length -ne 7168 -or $q.Length -ne 7168){throw 'decoded_frame_size_not_exact'}
        [double]$diff=0
        for($j=0;$j -lt $p.Length;$j++){$diff += [math]::Abs([int]$p[$j]-[int]$q[$j])}
        $mae=[math]::Round($diff/($p.Length*255.0),5)
        $report.frame_mae+=@{second=$sec;normalized_mean_absolute_error=$mae}
      }
      if(@($report.frame_mae | Where-Object { $_.normalized_mean_absolute_error -gt 0.16 }).Count -ne 0){throw 'provider_and_approved_frames_not_similar_enough'}
      $report.content_verified=$true
      $report.reason='exact_original_story_media_content_verified_readonly'
    }finally{
      if(Test-Path $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue}
    }
  }
  $report.stage='completed'
  $report.state='read_only_evidence'
  $report.reason=if(-not $report.scan_complete){'pagination_incomplete_no_conclusion'}elseif($report.candidate_count -eq 1){'one_timestamp_candidate_but_media_identity_unproven_no_source_change'}elseif($report.candidate_count -eq 0){'no_timed_story_candidate_not_proof_of_nonpublication'}else{'multiple_candidates_no_identity_conclusion'}
}catch {
  $msg=[string]$_.Exception.Message
  $approved=@('authority_not_supabase','runner_env_missing','config_missing','project_identity_mismatch','source_row_missing','source_original_state_not_exact','saved_original_and_replacement_not_exact','ambiguous_publish_fence_not_verified','profile_not_nyc','duplicate_active_owner_setting','owner_credentials_unavailable','owner_id_not_verified','old_container_owner_check_failed','old_container_not_expired','new_container_owner_check_failed','untrusted_meta_pagination','recent_story_media_id_unverified','recent_story_permalink_unverified')
  $report.reason=if($approved -contains $msg){$msg}else{'provider_get_unavailable_no_writes'}
}
Write-Output ('P1_2340_2627_OWNED_STORY_GETONLY='+($report|ConvertTo-Json -Compress -Depth 8))
