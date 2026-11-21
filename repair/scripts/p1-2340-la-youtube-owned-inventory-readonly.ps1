$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$expected='UCVt3nBxRfPuuxxduuxmz9sw'
$report=[ordered]@{read_only=$true;provider_writes=0;output_writes=0;airtable_reads=0;channel='LA';expected_channel_id=$expected;output_number=4671;original_output_record_id='rec75nNjbFn830TjM';expected_title='Griffith Sunset Plan';complete=$false;pages_scanned=0;videos_seen=0;matched=@();reason='not_started'}
try {
  $health=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 15
  if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'runner_not_supabase_authoritative'}
  $paths=@('D:\Content Creation\ChicagoShining Pipeline\Services\youtube-uploader-la\service\.env')
  $root=(Get-Location).Path
  $paths+=@(Join-Path $root 'Services\youtube-uploader-la\service\.env')
  $paths+=@(Join-Path $root '..\..\Services\youtube-uploader-la\service\.env')
  $found=@($paths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  if($found.Count -ne 1){throw 'la_uploader_env_unavailable'}
  $settings=@{}
  foreach($line in Get-Content -LiteralPath $found[0]) {
    if($line -match '^\s*(YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET|PORT)\s*=(.*)$') {
      $settings[$matches[1]]=$matches[2].Trim().Trim('"',"'")
    }
  }
  $key=[string]$settings['YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET']
  if($key.Length -lt 16){throw 'la_uploader_shared_secret_unavailable'}
  $port=[string]$settings['PORT']
  if(-not $port){$port='3341'}
  if($port -ne '3341'){throw 'la_uploader_port_mismatch'}
  $url='http://127.0.0.1:3341/youtube/channel/uploads?expected_channel_id='+$expected
  $inventory=Invoke-RestMethod -Uri $url -Method Get -Headers @{'x-sm-pipeline-key'=$key} -TimeoutSec 100
  if($inventory.read_only -ne $true -or $inventory.provider_media_writes -ne 0 -or $inventory.output_writes -ne 0 -or $inventory.channel_id -ne $expected){throw 'la_inventory_safety_or_owner_mismatch'}
  $report.complete=($inventory.complete -eq $true)
  $report.pages_scanned=[int]$inventory.playlist_pages_scanned
  $report.videos_seen=[int]$inventory.video_ids_seen
  $report.missing_video_details=[int]$inventory.missing_video_details
  $report.matched=@($inventory.videos | Where-Object { [string]$_.title -eq $report.expected_title } | ForEach-Object {
    [ordered]@{video_id=[string]$_.id;title=[string]$_.title;published_at=$_.published_at;privacy_status=$_.privacy_status;duration=$_.duration}
  })
  $report.reason=if($report.matched.Count -gt 0){'title_candidates_require_exact_original_receipt_reconciliation'}elseif($report.complete){'no_exact_title_match_found_but_absence_not_proven'}else{'incomplete_inventory_cannot_infer_absence'}
} catch {
  # No secrets, full URLs, request bodies or provider tokens in the report.
  $reason=[string]$_.Exception.Message
  if($reason -match 'runner_not_supabase_authoritative|la_uploader_env_unavailable|la_uploader_shared_secret_unavailable|la_uploader_port_mismatch|la_inventory_safety_or_owner_mismatch') {
    $report.reason=$reason
  } else {$report.reason='readonly_inventory_fetch_unavailable_or_failed'}
}
Write-Output ('P1_LA_YT_INVENTORY='+($report|ConvertTo-Json -Compress -Depth 6))
