# P0 3096: exact approved Story #5947, explicit approval-time hold marker. Provider GET and
# approved-video fingerprint inspection ONLY. Never create/replay a Meta Story.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=[ordered]@{
  cohort='issue3096-5947-explicit-early-hold';targets=1;provider_gets=0
  output_writes=0;provider_writes=0;airtable_reads=0;media_publish_calls=0
  pages=0;all_accounts_verified=$false;results=@();reason='not_started';preflight_step='source_identity';failure_code=$null
}
$targets=@(
  @{n=5947;rid='recKw7c9aZ75tDOWU';profile='New York City';prefix='NYC_'}
)
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('p1-2340-six-story-'+[guid]::NewGuid().ToString('N'))
try {
  $health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'source_not_supabase'}
  $ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
  if(-not(Test-Path $ef)){throw 'runner_env_missing'}
  function E($name){
    $lines=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
    if($lines.Count -ne 1){throw 'runner_config_missing'}
    return ([string]$lines[0] -split '=',2)[1].Trim().Trim('"',"'")
  }
  $base=(E 'SUPABASE_URL').TrimEnd('/')
  $key=E 'SUPABASE_SERVICE_ROLE_KEY'
  if($base -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'wrong_production_source'}
  $headers=@{apikey=$key;Authorization=('Bearer '+$key)}
  function S($route){Invoke-RestMethod ($base+$route) -Headers $headers -Method Get -TimeoutSec 30}
  $num='(5947)'
  $rows=@(S ('/rest/v1/platform_outputs?output_number=in.'+$num+'&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,auto_publish_enabled,do_not_publish,scheduled_post_date,published_at,platform_post_url,publish_asset_url,error_messages&limit=2'))
  if($rows.Count -eq 1 -and $rows[0] -is [array]){$rows=@($rows[0])}
  if(@($rows).Count -ne 1){throw 'original_six_row_census_incomplete'}
  $profiles=@(S '/rest/v1/content_profiles?select=id,market_name&limit=12')
  if($profiles.Count -eq 1 -and $profiles[0] -is [array]){$profiles=@($profiles[0])}
  $verified=@{}
  foreach($t in $targets){
    $matches=@($rows|Where-Object{[int]$_.output_number -eq [int]$t.n})
    if($matches.Count -ne 1){throw 'original_output_mismatch'}
    $o=$matches[0]
    $ps=@($profiles|Where-Object{[string]$_.id -eq [string]$o.content_profile_id})
    if($o.airtable_record_id -ne $t.rid -or $o.platform -ne 'Instagram' -or
       $o.platform_output_type -ne 'Instagram Story' -or $o.review_status -ne 'Approved' -or
       $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Schedule' -or
       $o.auto_publish_enabled -ne $true -or $o.do_not_publish -ne $false -or $o.published_at -or
       $o.platform_post_url -or $ps.Count -ne 1 -or $ps[0].market_name -ne $t.profile -or
       [string]$o.error_messages.IG_Story_Container_ID -or
       [string]$o.error_messages.IG_Story_Post_ID -or [string]$o.error_messages.Platform_Post_ID -or
       [string]$o.error_messages.IG_Story_Last_Attempt_At -or
       [string]$o.error_messages.Studio_Publish_Dispatch_Count -ne '1' -or
       [string]$o.error_messages.Studio_Publish_Dispatch_At -ne '2026-11-17T03:42:38.594Z' -or
       [string]$o.error_messages.Studio_Publish_Dispatch_Note -ne 'held until 2026-11-25T21:40:00.000Z' -or
       [string]$o.error_messages.Review_Decision_At -ne '2026-11-17T03:42:36.320Z' -or
       [string]$o.error_messages.Publish_Attempt_Count -or [string]$o.error_messages.Publish_Started_At -or [string]$o.error_messages.Last_Publish_Attempt_At -or
       [string]$o.error_messages.Publish_Locked_By -or [string]$o.error_messages.IG_Story_Attempt_Count -or
       [DateTimeOffset]::Parse([string]$o.scheduled_post_date) -ne [DateTimeOffset]::Parse('2026-11-25T21:40:00Z') -or
       [DateTimeOffset]::Parse([string]$o.scheduled_post_date) -gt [DateTimeOffset]::UtcNow){
      throw 'one_target_not_pristine_approved_and_due'
    }
    $asset=[string]$o.publish_asset_url
    if($asset -notmatch '^https://media\.chicagoshining\.com/studio/previews/rec[A-Za-z0-9]{14}/[^?]+\.mp4$' -or
       -not $asset.Contains($t.rid)){throw 'approved_media_identity_not_verified'}
    $verified[[string]$t.n]=$o
  }
  $settings=@(S '/rest/v1/engagement_settings?select=payload&limit=500')
  if($settings.Count -eq 1 -and $settings[0] -is [array]){$settings=@($settings[0])}
  $cfg=@{}
  foreach($setting in $settings){
    $p=$setting.payload
    if([string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
    $n=[string]$p.Setting_Name
    if($n -match '^(LA_|MIAMI_|NYC_)?(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN)$' -or $n -eq 'META_GRAPH_API_VERSION'){
      if($cfg.ContainsKey($n)){throw 'multiple_active_ig_credential_rows'}
      $cfg[$n]=[string]$p.Setting_Value
    }
  }
  $ver=[string]$cfg.META_GRAPH_API_VERSION
  if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
  $account=@{}
  foreach($t in $targets){
    $prefix=[string]$t.prefix
    if($account.ContainsKey($prefix)){continue}
    $id=[string]$cfg[($prefix+'INSTAGRAM_BUSINESS_ACCOUNT_ID')]
    $token=[string]$cfg[($prefix+'META_GRAPH_API_ACCESS_TOKEN')]
    if($id -notmatch '^\d{6,30}$' -or -not $token){throw 'missing_exact_owner_auth'}
    $gh=@{Authorization=('Bearer '+$token)}
    $report.provider_gets++
    $owner=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id') -Headers $gh -Method Get -TimeoutSec 40
    if([string]$owner.id -ne $id){throw 'provider_owner_id_mismatch'}
    $account[$prefix]=@{id=$id;header=$gh;stories=@();scan_complete=$false;pages=0}
  }
  $report.all_accounts_verified=($account.Count -eq 1)
  foreach($prefix in @('NYC_')){
    $a=$account[$prefix]
    $next='https://graph.facebook.com/'+$ver+'/'+$a.id+'/stories?fields=id,permalink,timestamp,media_type&limit=100'
    $seen=@{}
    for($p=0;$p -lt 3 -and $next;$p++){
      $uri=[uri]$next
      if($uri.Scheme -ne 'https' -or $uri.Host -ne 'graph.facebook.com' -or
         $uri.AbsolutePath -ne ('/'+$ver+'/'+$a.id+'/stories') -or $seen.ContainsKey($next)){
        throw 'untrusted_or_repeated_meta_cursor'
      }
      $seen[$next]=$true
      $report.provider_gets++
      $page=Invoke-RestMethod $next -Headers $a.header -Method Get -TimeoutSec 45
      $a.pages++
      $report.pages++
      foreach($story in @($page.data)){
        if($null -eq $story){continue}
        $st=[DateTimeOffset]::MinValue
        try{$st=[DateTimeOffset]::Parse([string]$story.timestamp)}catch{}
        $id=[string]$story.id
        if($id -match '^\d{12,30}$' -and $st -ne [DateTimeOffset]::MinValue){
          $a.stories+=@{id=$id;timestamp=$st;type=[string]$story.media_type;permalink=[string]$story.permalink}
        }
      }
      $next=[string]$page.paging.next
    }
    $a.scan_complete=(-not $next)
  }
  $report.preflight_step='ffmpeg_lookup'
  $ff=Get-Command ffmpeg -ErrorAction SilentlyContinue
  if(-not $ff -or -not $ff.Source){throw 'ffmpeg_unavailable'}
  $report.preflight_step='temporary_directory'
  New-Item -Path $tmp -ItemType Directory -ErrorAction Stop | Out-Null
  function BytesAt($video,$sec,$out) {
    & $ff.Source -hide_banner -loglevel error -ss ([string]$sec) -i $video -vf 'scale=64:112:flags=bicubic,format=gray' -frames:v 1 -f rawvideo -y $out 2>$null
    if($LASTEXITCODE -ne 0){throw 'video_frame_decode_failed'}
    $buf=[IO.File]::ReadAllBytes($out)
    if($buf.Length -ne 7168){throw 'decoded_frame_size_invalid'}
    return $buf
  }
  foreach($t in $targets){
    $o=$verified[[string]$t.n]
    $a=$account[[string]$t.prefix]
    $time=[DateTimeOffset]::Parse([string]$o.scheduled_post_date)
    $within=@($a.stories|Where-Object{$_.type -eq 'VIDEO' -and $_.timestamp -ge $time.AddHours(-2) -and $_.timestamp -le [DateTimeOffset]::UtcNow})
    $rr=[ordered]@{
      output=$t.n;market=$t.profile;account_owned=$true;stories_scanned=@($a.stories).Count;
      story_scan_complete=[bool]$a.scan_complete;timed_video_candidates=$within.Count;
      compared=0;matching_original_story_ids=@();frame_metrics=@();exact_video_verified=$false;
      conclusion='not_started'
    }
    # Always prove the exact approved original asset is accessible, even if no active Story candidate.
    $src=Join-Path $tmp ($t.n+'-approved.mp4')
    $report.preflight_step='approved_asset_download'
    Invoke-WebRequest ([string]$o.publish_asset_url) -Method Get -OutFile $src -TimeoutSec 85 | Out-Null
    $report.preflight_step='approved_asset_size'
    $len=(Get-Item $src).Length
    $report.approved_asset_bytes=$len
    if($len -lt 100000 -or $len -gt 104857600){throw 'approved_asset_size_untrusted'}
    $report.preflight_step='approved_asset_decode'
    $null=BytesAt $src 1 (Join-Path $tmp ($t.n+'-original-preflight.raw'))
    $rr.approved_asset_decoded=$true
    $report.preflight_step='owned_candidate_comparison'
    if(-not $a.scan_complete){
      $rr.conclusion='incomplete_owned_story_pagination_no_versus_publish_conclusion'
    }elseif($within.Count -gt 4){
      $rr.conclusion='too_many_timed_candidates_for_bounded_media_matching'
    }elseif($within.Count -eq 0){
      $rr.conclusion='no_timed_story_candidate_not_proof_of_nonpublication'
    }else{
      try{
        foreach($story in $within){
          $report.provider_gets++
          $md=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$story.id+'?fields=id,media_type,media_url,permalink,timestamp') -Headers $a.header -Method Get -TimeoutSec 40
          if([string]$md.id -ne $story.id -or [string]$md.media_type -ne 'VIDEO' -or
             [DateTimeOffset]::Parse([string]$md.timestamp) -ne $story.timestamp){throw 'provider_media_identity_mismatch'}
          $remote=[uri]([string]$md.media_url)
          if($remote.Scheme -ne 'https' -or $remote.Host -notmatch '(^|\.)(fbcdn\.net|cdninstagram\.com)$'){throw 'untrusted_owned_video_host'}
          $dst=Join-Path $tmp ($t.n+'-'+$story.id+'.mp4')
          Invoke-WebRequest $remote.AbsoluteUri -Method Get -OutFile $dst -TimeoutSec 75 | Out-Null
          $dl=(Get-Item $dst).Length
          if($dl -lt 100000 -or $dl -gt 104857600){throw 'remote_video_size_untrusted'}
          $match=$true
          $metrics=@()
          foreach($sec in @(1,3)){
            $x=BytesAt $src $sec (Join-Path $tmp ($t.n+'-orig-'+$sec+'.raw'))
            $y=BytesAt $dst $sec (Join-Path $tmp ($t.n+'-'+$story.id+'-'+$sec+'.raw'))
            [double]$diff=0
            for($i=0;$i -lt 7168;$i++){$diff += [math]::Abs([int]$x[$i]-[int]$y[$i])}
            $mae=[math]::Round($diff/(7168*255.0),5)
            $metrics+=@{second=$sec;normalized_mae=$mae}
            if($mae -gt 0.05){$match=$false}
          }
          $rr.frame_metrics+=@{story_id=$story.id;frames=$metrics}
          $rr.compared++
          if($match){$rr.matching_original_story_ids+=($story.id)}
        }
        if($rr.matching_original_story_ids.Count -eq 1){
          $rr.exact_video_verified=$true
          $rr.conclusion='one_existing_account_owned_story_exact_original_video_verified_no_status_write'
        }elseif($rr.matching_original_story_ids.Count -gt 1){
          $rr.conclusion='multiple_matching_stories_duplicate_review_required'
        }else{
          $rr.conclusion='no_exact_timed_media_match_not_proof_of_nonpublication'
        }
      }catch{
        $rr.conclusion='media_comparison_unavailable_no_publication_decision'
      }
    }
    $report.results+=($rr)
  }
  $report.preflight_step='complete'
  $report.reason='bounded_owned_story_and_media_audit_complete'
}catch{
  # Never emit raw exception text: it may contain authenticated URLs or headers.
  $safe=@('ffmpeg_unavailable','video_frame_decode_failed','decoded_frame_size_invalid','approved_asset_size_untrusted')
  $message=[string]$_.Exception.Message
  $report.failure_code=if($safe -contains $message){$message}else{'preflight_exception'}
  $report.reason='source_or_provider_preflight_failed_closed'
}
finally{
  if(Test-Path $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue}
}
Write-Output ('ISSUE3096_5947_STORY_READONLY='+($report|ConvertTo-Json -Depth 7 -Compress))
