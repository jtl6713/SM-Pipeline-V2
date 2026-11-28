$ErrorActionPreference='Stop'
$phase='health'
$local='http://127.0.0.1:3333'
$runner='http://127.0.0.1:3350'
$id='job-3159-recovery-smoke-20261128'
$file='3159-recovery-smoke-20261128.mp4'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
$secret=$null
$temp=$null
try {
  $line=Get-Content -LiteralPath $envPath | Where-Object {$_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*='} | Select-Object -Last 1
  if(-not $line){throw 'secret_absent'}
  $secret=([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
  if(-not $secret){throw 'secret_empty'}
  $rh=Invoke-RestMethod -Uri "$runner/health" -TimeoutSec 15
  $wh=Invoke-RestMethod -Uri "$runner/admin/workload" -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 15
  $h=Invoke-RestMethod -Uri "$local/health" -TimeoutSec 15
  Write-Output ('recovery3159_remotion='+(@{ok=$h.ok;service=$h.service;version=$h.version;max=$h.remotionMaxConcurrent;active=$h.remotionActiveRenders;preparing=$h.remotionPreparingJobs;queued=$h.remotionQueuedRenders;inflight=$h.remotionInFlightJobs} | ConvertTo-Json -Compress))
  Write-Output ('recovery3159_governor='+(@{circuit=$wh.database_circuit_phase;cap=$wh.max_jobs;active=$wh.active_jobs;queued=$wh.queued_jobs;paused=$wh.paused_jobs;worker_heavy=$wh.active_worker_heavy;admission_paused=$wh.admission_paused;maintenance=$wh.smv1_maintenance_active} | ConvertTo-Json -Compress))
  if($rh.ok -ne $true -or $rh.studio_write_source -ne 'supabase' -or $rh.supabase_pipeline_writes -ne $true -or $rh.workload_governor_enabled -ne $true -or $wh.ok -ne $true -or $wh.enabled -ne $true -or $wh.database_circuit_phase -notin @('half_open','closed') -or $wh.admission_paused -ne $false -or $wh.smv1_maintenance_active -eq $true -or $wh.active_jobs -ne 0 -or $wh.queued_jobs -ne 0 -or $wh.active_worker_heavy -ne 0){throw 'governor_not_idle_or_safe'}
  if($h.ok -ne $true -or $h.service -ne 'SM Pipeline V2 Remotion Render Server' -or $h.remotionMaxConcurrent -ne 1 -or $h.remotionActiveRenders -ne 0 -or $h.remotionPreparingJobs -ne 0 -or $h.remotionQueuedRenders -ne 0 -or $h.remotionInFlightJobs -ne 0){throw 'renderer_not_idle_or_safe'}
  $phase='preflight'
  $ffprobe=Get-Command ffprobe -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $ffmpeg=Get-Command ffmpeg -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $existing=$null
  try { $existing=Invoke-RestMethod -Uri "$local/status/$id" -TimeoutSec 10 } catch { if([int]$_.Exception.Response.StatusCode -ne 404){throw} }
  if($existing){throw 'existing_job_no_retry'}
  # Durable local one-shot reservation, outside production queues. Never delete it.
  $marker=Join-Path (Split-Path -Parent $envPath) 'outage3159-remotion-smoke-once.json'
  $stream=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    $bytes=[Text.Encoding]::UTF8.GetBytes((@{id=$id;filename=$file;created_at=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json -Compress))
    $stream.Write($bytes,0,$bytes.Length)
    $stream.Flush()
  } finally {$stream.Dispose()}
  $phase='submit'
  # One fixed synthetic 15-frame composition; no media sources, DB or provider actions.
  $body=@{jobId=$id;compositionId='ARM-SMOKE';filename=$file} | ConvertTo-Json -Compress
  $receipt=Invoke-RestMethod -Method Post -Uri "$local/render" -ContentType 'application/json' -Body $body -TimeoutSec 15
  if($receipt.accepted -ne $true -or $receipt.jobId -ne $id){throw 'submit_not_verified'}
  Write-Output ('recovery3159_accepted='+$id)
  $phase='wait'
  $done=$null
  for($i=0;$i -lt 40;$i++){
    $done=Invoke-RestMethod -Uri "$local/status/$id" -TimeoutSec 10
    if($done.jobId -ne $id -or $done.filename -ne $file){throw 'job_identity_mismatch'}
    if($done.status -eq 'completed'){break}
    if($done.status -eq 'failed'){throw 'render_failed'}
    Start-Sleep -Seconds 3
  }
  if($done.status -ne 'completed'){throw 'render_timeout_no_retry'}
  $phase='bytes'
  $temp=Join-Path ([IO.Path]::GetTempPath()) ('3159-'+[guid]::NewGuid().ToString('N')+'.mp4')
  Invoke-WebRequest -UseBasicParsing -Uri "$local/out/$file" -OutFile $temp -TimeoutSec 20
  $info=Get-Item -LiteralPath $temp
  if($info.Length -lt 1000 -or $info.Length -gt 20000000){throw 'unexpected_bytes'}
  $probeRaw=& $ffprobe.Source -v error -count_frames -select_streams v:0 -show_entries 'stream=codec_name,width,height,nb_read_frames,r_frame_rate' -of json $temp
  if($LASTEXITCODE -ne 0){throw 'ffprobe_failed'}
  $video=($probeRaw -join "`n" | ConvertFrom-Json).streams | Select-Object -First 1
  if($video.codec_name -ne 'h264' -or $video.width -ne 1080 -or $video.height -ne 1920 -or [int]$video.nb_read_frames -ne 15 -or $video.r_frame_rate -ne '30/1'){throw 'video_contract_failed'}
  & $ffmpeg.Source -v error -xerror -i $temp -map '0:v:0' -f null NUL
  if($LASTEXITCODE -ne 0){throw 'decode_failed'}
  Write-Output ('recovery3159_media='+(@{job=$id;bytes=$info.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $temp).Hash;codec=$video.codec_name;width=$video.width;height=$video.height;frames=[int]$video.nb_read_frames;fps=$video.r_frame_rate;decode='PASS'} | ConvertTo-Json -Compress))
  $phase='cleanup'
  $clean=Invoke-RestMethod -Method Post -Uri "$local/cleanup/$id" -ContentType 'application/json' -Body (@{filename=$file}|ConvertTo-Json -Compress) -TimeoutSec 20
  if($clean.ok -ne $true -or $clean.jobId -ne $id){throw 'cleanup_unverified'}
  $after=Invoke-RestMethod -Uri "$local/health" -TimeoutSec 15
  if($after.remotionActiveRenders -ne 0 -or $after.remotionPreparingJobs -ne 0 -or $after.remotionQueuedRenders -ne 0){throw 'renderer_not_idle_after'}
  $w2=Invoke-RestMethod -Uri "$runner/admin/workload" -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 15
  Write-Output ('recovery3159_after='+(@{active=$after.remotionActiveRenders;queued=$after.remotionQueuedRenders;circuit=$w2.database_circuit_phase;producer_active=$w2.active_jobs;producer_queued=$w2.queued_jobs;cleanup=$clean.ok} | ConvertTo-Json -Compress))
  Write-Output 'recovery3159_proof=PASS_SYNTHETIC_ONLY'
} catch {throw ('recovery3159_failed_'+$phase)} finally {
  if($temp -and (Test-Path -LiteralPath $temp)){Remove-Item -LiteralPath $temp -Force}
  Remove-Variable secret -ErrorAction SilentlyContinue
}
