# QA-1050 Step 2. One-time, existing-media-only runner operations; no upload/create stages.
$ErrorActionPreference = 'Stop'
$runner = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$envFile = Join-Path $runner '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Runner credential file not available; no stage invoked' }
$line = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*=' }) | Select-Object -Last 1
if (-not $line) { throw 'Runner stage token not configured; no stage invoked' }
$secret = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
if (-not $secret) { throw 'Runner stage token empty; no stage invoked' }
$headers = @{ 'X-Pipeline-Secret' = $secret }
$yt = @(
  @('3229','rec65CfOgdnwrQtuW'),
  @('8303','recnaf4nQV3vhVkaH'),
  @('3314','rec4LCl5W0PFbqLk7'),
  @('2962','recnr5Bl6ROjgiIsf'),
  @('3326','recIZs9XxXQSUJWpO'),
  @('8116','recwOatd6biAtgKMv'),
  @('3148','recSen25VIj8A3TlV'),
  @('8342','recqaZuLGm0laxPoX')
)
$tt = @(
  @('3331','rec8SmwNRuI67mqUW'),
  @('2979','recGaYlVsCmoyhKo4'),
  @('3027','recqFCgVz9VYv3sAt')
)
function Invoke-ExactStage([string]$stage,[string]$number,[string]$recordId) {
  $body = @{output_record_id=$recordId} | ConvertTo-Json -Compress
  try {
    $response = Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:3350/stages/" + $stage) -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 25
    $run = $response.details.run
    $safe = [ordered]@{
      output_id=$number; stage=$stage; status=$response.status
      processed=$run.processed; reason=$run.reason
      needs_finalize=$run.needs_finalize; still_processing=$run.still_processing
      needs_email=$run.needs_email; terminal=$run.terminal
    }
    Write-Host ($safe | ConvertTo-Json -Compress)
    return $response.status -in @('ok','skipped','deferred')
  } catch {
    Write-Host ("PROVIDER_STAGE_ERROR output=" + $number + " stage=" + $stage + " exception=" + $_.Exception.GetType().Name)
    return $false
  }
}
$failures = 0
foreach ($p in $yt) { if (-not (Invoke-ExactStage 'yts2' $p[0] $p[1])) { $failures++ } }
foreach ($p in $tt) { if (-not (Invoke-ExactStage 'ttd2' $p[0] $p[1])) { $failures++ } }
# Finalization stages do not create another YouTube video or TikTok draft.
# Their eligibility requires the exact saved video/draft processing state.
foreach ($p in $yt) { if (-not (Invoke-ExactStage 'yts3' $p[0] $p[1])) { $failures++ } }
foreach ($p in $tt) { if (-not (Invoke-ExactStage 'ttd3' $p[0] $p[1])) { $failures++ } }
Write-Output ("QA1050 exact-item stage failures=" + $failures)
if ($failures -gt 0) { exit 3 }
