# QA1050 Step 3 bounded prepublish preparation. $TargetId injected by GitHub workflow.
$ErrorActionPreference='Stop'
$targets=@{'1023'='rec8okeb4bPKvt6FP';'1076'='recsq0S1FeqDP0pZb'}
if (-not $targets.ContainsKey($TargetId)) { throw 'Output not allowlisted' }
$recordId=$targets[$TargetId]
$source='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$envFile=Join-Path $source '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Runner secret file unavailable' }
$line=@(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*=' }) | Select-Object -Last 1
if(-not $line){throw 'Runner stage token unavailable'}
$secret=($line -split '=',2)[1].Trim().Trim('"').Trim("'")
if(-not $secret){throw 'Runner stage token empty'}
$headers=@{'X-Pipeline-Secret'=$secret}
function Invoke-Stage([string]$stage) {
  $payload=@{ output_record_id=$recordId; test_run_id='QA1050-IG-STEP3-20261022' } | ConvertTo-Json -Compress
  $response=Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:3350/stages/"+$stage) -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 230
  $run=$response.details.run
  $safe=[ordered]@{output_id=$TargetId;stage=$stage;status=$response.status;processed=$run.processed;reason=$run.reason;assets_ready=$run.assets_ready;ready_count=$run.ready_count;created_count=$run.created_count;needs_child_poll=$run.needs_child_poll;rate_limited=$run.rate_limited}
  Write-Host ($safe | ConvertTo-Json -Compress)
  return $response
}
$first=Invoke-Stage 'ap0c'
if($first.status -ne 'ok' -or $first.details.run.assets_ready -ne $true){throw "AP0C failed for output $TargetId; no subsequent provider calls"}
$second=Invoke-Stage 'ap1c'
if($second.status -ne 'ok' -or $second.details.run.needs_child_poll -ne $true){throw "AP1C could not establish exact 10 child containers; no publish"}
Write-Host ("QA1050_IG_PREPARED output="+$TargetId)
