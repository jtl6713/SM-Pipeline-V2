# QA1050 Step3 existing children poll + parent container create (never publishes).
$ErrorActionPreference='Stop'
$targets=@{'1023'='rec8okeb4bPKvt6FP';'1076'='recsq0S1FeqDP0pZb'}
if(-not $targets.ContainsKey($TargetId)){throw 'Not allowlisted'}
$recordId=$targets[$TargetId]
$envFile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $envFile)){throw 'Runner credentials unavailable'}
$line=@(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*=' }) | Select-Object -Last 1
if(-not $line){throw 'No runner secret'}
$secret=($line -split '=',2)[1].Trim().Trim('"').Trim("'")
if(-not $secret){throw 'Empty runner secret'}
$headers=@{'X-Pipeline-Secret'=$secret}
function Poll([string]$stage) {
  $body=@{output_record_id=$recordId;test_run_id='QA1050-IG-STEP3-20261022'}|ConvertTo-Json -Compress
  $response=Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:3350/stages/"+$stage) -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 120
  $run=$response.details.run
  $safe=[ordered]@{id=$TargetId;stage=$stage;status=$response.status;processed=$run.processed;reason=$run.reason;children_ready=$run.children_ready;still_processing=$run.still_processing;needs_parent_poll=$run.needs_parent_poll;parent_ready=$run.parent_ready}
  Write-Host ($safe|ConvertTo-Json -Compress)
  return $response
}
$child=Poll 'ap2c'
if($child.status -eq 'error'){throw 'AP2C provider error; no parent created'}
if($child.details.run.children_ready -eq $true){
  $parent=Poll 'ap3c'
  if($parent.status -eq 'error'){throw 'AP3C error; no publish'}
  if($parent.details.run.needs_parent_poll -eq $true){
    Start-Sleep -Seconds 8
    $parentPoll=Poll 'ap3p'
    if($parentPoll.status -eq 'error'){throw 'AP3P error; no publish'}
  }
} elseif($child.status -eq 'skipped'){
  # A prior exact run may already have moved the row forward. Stage guards fail closed.
  Write-Host ("QA1050_IG_CHILD_POLL_SKIPPED output="+$TargetId)
} else {
  Write-Host ("QA1050_IG_CHILDREN_PENDING output="+$TargetId)
}
Write-Host ("QA1050_IG_PARENT_POLL_DONE output="+$TargetId)
