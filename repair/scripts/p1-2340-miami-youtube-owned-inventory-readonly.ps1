$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$proofId='WMszupIwRgg'
$proofTitle='Wynwood Walls Texture Tease'
$report=[ordered]@{read_only=$true;provider_writes=0;output_writes=0;airtable_reads=0;channel='Miami';output_number=6252;original_output_record_id='rec1ooEl74TXu3Iu8';expected_title='Lincoln Road Golden Hour';prior_verified_output_number=10634;prior_video_id=$proofId;prior_receipt_verified=$false;expected_channel_id=$null;complete=$false;pages_scanned=0;videos_seen=0;matched=@();reason='not_started'}
try {
  $health=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 15
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'runner_not_supabase_authoritative'}
  $paths=@('D:\Content Creation\ChicagoShining Pipeline\Services\youtube-uploader-miami\service\.env')
  $root=(Get-Location).Path
  $paths+=@(Join-Path $root 'Services\youtube-uploader-miami\service\.env')
  $paths+=@(Join-Path $root '..\..\Services\youtube-uploader-miami\service\.env')
  $found=@($paths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  if($found.Count -ne 1){throw 'miami_uploader_env_unavailable'}
  $settings=@{}
  foreach($line in Get-Content -LiteralPath $found[0]) {
    if($line -match '^\s*(YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET|PORT)\s*=(.*)$') {
      $settings[$matches[1]]=$matches[2].Trim().Trim('"',"'")
    }
  }
  $key=[string]$settings['YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']
  if($key.Length -lt 16){throw 'miami_uploader_shared_secret_unavailable'}
  $port=[string]$settings['PORT']
  if(-not $port){$port='3343'}
  if($port -ne '3343'){throw 'miami_uploader_port_mismatch'}
  $base='http://127.0.0.1:3343'
  $headers=@{'x-sm-pipeline-key'=$key}
  $oauth=Invoke-RestMethod -Uri ($base+'/youtube/oauth/status') -Method Get -Headers $headers -TimeoutSec 40
  $prior=Invoke-RestMethod -Uri ($base+'/youtube/videos/'+$proofId) -Method Get -Headers $headers -TimeoutSec 40
  $v=@($prior.items | Select-Object -First 1)
  if($v.Count -ne 1){throw 'prior_video_receipt_not_found'}
  $knownChannel=[string]$v[0].snippet.channelId
  if($oauth.refresh_ok -ne $true -or $oauth.channel_identity_ok -ne $true -or $oauth.channel_id -ne $knownChannel -or $v[0].id -ne $proofId -or $v[0].snippet.title -ne $proofTitle -or $v[0].status.privacyStatus -ne 'public' -or $knownChannel -notmatch '^UC[A-Za-z0-9_-]{22}$'){throw 'prior_public_receipt_or_ownership_mismatch'}
  $report.prior_receipt_verified=$true
  $report.expected_channel_id=$knownChannel
  $url=$base+'/youtube/channel/uploads?expected_channel_id='+$knownChannel
  $inventory=Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 100
  if($inventory.read_only -ne $true -or $inventory.provider_media_writes -ne 0 -or $inventory.output_writes -ne 0 -or $inventory.channel_id -ne $knownChannel){throw 'miami_inventory_safety_or_owner_mismatch'}
  $report.complete=($inventory.complete -eq $true)
  $report.pages_scanned=[int]$inventory.playlist_pages_scanned
  $report.videos_seen=[int]$inventory.video_ids_seen
  $report.missing_video_details=[int]$inventory.missing_video_details
  $report.matched=@($inventory.videos | Where-Object { [string]$_.title -eq $report.expected_title } | ForEach-Object {
    [ordered]@{video_id=[string]$_.id;title=[string]$_.title;published_at=$_.published_at;privacy_status=$_.privacy_status;duration=$_.duration}
  })
  $report.reason=if($report.matched.Count -gt 0){'title_candidates_require_exact_original_receipt_reconciliation'}elseif($report.complete){'no_exact_title_match_found_but_absence_not_proven'}else{'incomplete_inventory_cannot_infer_absence'}
} catch {
  $reason=[string]$_.Exception.Message
  if($reason -match 'runner_not_supabase_authoritative|miami_uploader_env_unavailable|miami_uploader_shared_secret_unavailable|miami_uploader_port_mismatch|prior_video_receipt_not_found|prior_public_receipt_or_ownership_mismatch|miami_inventory_safety_or_owner_mismatch'){$report.reason=$reason}
  else {$report.reason='readonly_inventory_fetch_unavailable_or_failed'}
}
Write-Output ('P1_MIAMI_YT_INVENTORY='+($report|ConvertTo-Json -Compress -Depth 6))
