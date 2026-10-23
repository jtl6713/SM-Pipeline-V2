# QA1050 Step 3: restore single missing cover child for output 1076; existing nine children retained.
$ErrorActionPreference='Stop'
$record='recsq0S1FeqDP0pZb'
$envFile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $envFile)){throw 'Runner credentials missing'}
$line=@(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*=' })|Select-Object -Last 1
if(-not $line){throw 'Missing runner secret'}
$secret=($line -split '=',2)[1].Trim().Trim('"').Trim("'")
if(-not $secret){throw 'Empty runner secret'}
$headers=@{'X-Pipeline-Secret'=$secret}
function Exact([string]$stage){
  $body=@{output_record_id=$record;test_run_id='QA1050-IG-STEP3-20261022'}|ConvertTo-Json -Compress
  $x=Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:3350/stages/"+$stage) -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 120
  $run=$x.details.run
  Write-Host ([ordered]@{id=1076;stage=$stage;status=$x.status;processed=$run.processed;reason=$run.reason;created_now=$run.created_now;retained_count=$run.retained_count;children_ready=$run.children_ready;needs_parent_poll=$run.needs_parent_poll;parent_ready=$run.parent_ready}|ConvertTo-Json -Compress)
  return $x
}
$a=Exact 'ap1c'
if($a.status -ne 'ok' -or $a.details.run.needs_child_poll -ne $true){throw 'AP1C failed: stop without any parent or post creation'}
Start-Sleep -Seconds 10
$b=Exact 'ap2c'
if($b.status -eq 'error'){throw 'AP2C failure: stop without parent'}
if($b.details.run.children_ready -eq $true){
  $c=Exact 'ap3c'
  if($c.status -eq 'error'){throw 'AP3C failure'}
  if($c.details.run.needs_parent_poll -eq $true){
    Start-Sleep -Seconds 8
    $d=Exact 'ap3p'
    if($d.status -eq 'error'){throw 'AP3P failure'}
  }
}else{Write-Host 'QA1050_IG1076_CHILD_POLL_PENDING'}
Write-Host 'QA1050_IG1076_COVER_REPAIR_PROCESSED'
