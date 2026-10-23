# One-time 2026-10-23 morning, exact original IG parent publication only.
$ErrorActionPreference = 'Stop'
$targets = @{
 '1023' = @{record='rec8okeb4bPKvt6FP';parent='17907026859575604';start=330;end=364}
 '1076' = @{record='recsq0S1FeqDP0pZb';parent='17907047976575604';start=365;end=420}
}
if (-not $targets.ContainsKey($TargetId)) { throw 'Output is not authorized' }
$target=$targets[$TargetId]
$ct=[TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow,[TimeZoneInfo]::FindSystemTimeZoneById('Central Standard Time'))
$minute=$ct.Hour*60+$ct.Minute
if ($ct.ToString('yyyy-MM-dd') -ne '2026-10-23' -or $minute -lt $target.start -or $minute -gt $target.end) {
 throw 'Not in exact authorized Chicago morning release window'
}
$envFile='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $envFile)) {throw 'Missing local runner environment'}
function Read-Config([string]$name){
 $value=[Environment]::GetEnvironmentVariable($name)
 if($value){return $value}
 $expr='^\s*'+[regex]::Escape($name)+'\s*='
 $match=@(Get-Content -LiteralPath $envFile | Where-Object {$_ -match $expr}) | Select-Object -Last 1
 if($match){return ($match -split '=',2)[1].Trim().Trim('"').Trim("'")}
 return ''
}
$airtablePat=Read-Config 'AIRTABLE_PAT'
$runnerToken=Read-Config 'PIPELINE_RUNNER_SHARED_SECRET'
if(-not $airtablePat -or -not $runnerToken){throw 'Required existing local service credentials missing'}
$headers=@{Authorization='Bearer '+$airtablePat}
$stageHeaders=@{'X-Pipeline-Secret'=$runnerToken}
$uri='https://api.airtable.com/v0/appe33zkZn35yirTL/tblrlPeboBthkplH0/'+$target.record
function Read-Row(){
 return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 30
}
function Patch-Row([hashtable]$fields){
 $payload=@{fields=$fields}|ConvertTo-Json -Depth 6 -Compress
 return Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 30
}
function Run-Stage([string]$name){
 $body=@{output_record_id=$target.record;test_run_id='QA1050-IG-STEP3-20261022'}|ConvertTo-Json -Compress
 return Invoke-RestMethod -Method Post -Uri ('http://127.0.0.1:3350/stages/'+$name) -Headers $stageHeaders -ContentType 'application/json' -Body $body -TimeoutSec 90
}
$original=(Read-Row).fields
if([string]$original.Output_ID -ne $TargetId -or
   $original.Platform -ne 'Instagram' -or
   $original.Platform_Output_Type -ne 'Instagram Carousel' -or
   $original.Test_Run_ID -ne 'QA1050-IG-STEP3-20261022' -or
   $original.Do_Not_Publish -ne $true -or
   $original.Publish_Status -ne 'Ready to Publish' -or
   $original.Output_Status -ne 'Approved for Publishing' -or
   $original.IG_Carousel_Status -ne 'Parent Ready' -or
   $original.IG_Carousel_Parent_Status -ne 'FINISHED' -or
   [string]$original.IG_Carousel_Parent_Container_ID -ne $target.parent -or
   [int]$original.IG_Carousel_Children_Ready_Count -ne 10 -or
   $original.Platform_Post_ID -or $original.IG_Carousel_Published_Media_ID -or
   $original.Published_At -or $original.Publish_Locked_At) {
 throw 'Preflight did not prove immutable parent, holds, or absence of prior publication'
}
$verified=$false
try {
 $null=Patch-Row @{Do_Not_Publish=$false;Publish_Retry_Eligible=$false}
 $before=(Read-Row).fields
 if($before.Do_Not_Publish -eq $true -or
    [string]$before.IG_Carousel_Parent_Container_ID -ne $target.parent -or
    $before.Test_Run_ID -ne 'QA1050-IG-STEP3-20261022' -or
    $before.Platform_Post_ID -or $before.Published_At) {
   throw 'Prepublish Airtable readback changed unexpectedly'
 }
 $publish=Run-Stage 'ap4c'
 $run=$publish.details.run
 Write-Host ('QA1050 stage=ap4c output='+$TargetId+' result='+$publish.status+' receipt='+[bool]$run.needs_finalize)
 if($publish.status -ne 'ok' -or $run.needs_finalize -ne $true){
   throw 'Unconfirmed Meta media_publish outcome: no second create; manual reconciliation required'
 }
 for($n=0;$n -lt 3;$n++){
   $finish=Run-Stage 'ap5c'
   Write-Host ('QA1050 stage=ap5c output='+$TargetId+' result='+$finish.status)
   $f=(Read-Row).fields
   if($f.Publish_Status -eq 'Published' -and $f.Output_Status -eq 'Published' -and
     $f.Platform_Post_ID -and $f.Platform_Post_ID -eq $f.IG_Carousel_Published_Media_ID -and
     $f.Published_At -and ($f.Platform_Post_URL -match '^https://(www\.)?instagram\.com/')) {
     $verified=$true
     break
   }
   if($n -lt 2){Start-Sleep -Seconds 12}
 }
 if(-not $verified){throw 'Published media and permalink not fully verified; no publish replay'}
 $null=Patch-Row @{Do_Not_Publish=$false;Publish_Retry_Eligible=$false;Test_Run_ID=''}
 $last=(Read-Row).fields
 if($last.Publish_Status -ne 'Published' -or $last.Platform_Post_ID -ne $last.IG_Carousel_Published_Media_ID){
   throw 'Independent final Airtable publication readback failed'
 }
 Write-Host ('QA1050_PUBLISHED_CONFIRMED output='+$TargetId+' media='+$last.Platform_Post_ID)
} finally {
 if(-not $verified){
  try{
   $null=Patch-Row @{Do_Not_Publish=$true;Publish_Retry_Eligible=$false}
   Write-Host ('QA1050_SAFE_HOLD_RESTORED output='+$TargetId)
  }catch{Write-Host ('QA1050_HOLD_RESTORE_FAILED output='+$TargetId);throw}
 }
}
