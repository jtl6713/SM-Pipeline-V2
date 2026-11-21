$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$report=@{read_only=$true;output_writes=0;provider_writes=0;kind='original_youtube_uploader_jobs';source_available=$false;matching=@();scanned=0;scans=@()}
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_runner_not_authoritative'}
$root=(Get-Location).Path
$service=Join-Path $root 'Services\youtube-uploader\service'
$paths=@((Join-Path $service 'data\youtube-jobs.json'),(Join-Path $service 'youtube-jobs.json'),(Join-Path $root 'services\youtube-uploader\data\youtube-jobs.json'))
$envFile=Join-Path $service '.env'
if(Test-Path $envFile){
 $line=@(Get-Content $envFile|Where-Object{$_ -match '^YOUTUBE_JOB_STORE='}|Select-Object -Last 1)
 if($line){
  $value=([string]$line -split '=',2)[1].Trim().Trim('"',"'")
  if($value){
   $extra=if([IO.Path]::IsPathRooted($value)){$value}else{Join-Path $service $value}
   if([IO.Path]::GetFullPath($extra).StartsWith([IO.Path]::GetFullPath($root),[StringComparison]::OrdinalIgnoreCase)){$paths=@($extra)+$paths}
  }
 }
}
$targets=@('rec75nNjbFn830TjM','rec1ooEl74TXu3Iu8')
foreach($file in @($paths|Select-Object -Unique)){
 if(-not(Test-Path $file)){continue}
 try{
  $arr=@(Get-Content -Raw $file|ConvertFrom-Json)
  if($arr.Count -gt 100000){throw 'jobstore_unexpectedly_large'}
  $report.source_available=$true;$report.scanned+=$arr.Count
  foreach($job in $arr){
   if($targets -notcontains [string]$job.outputRecordId){continue}
   $report.matching+=@{output_record_id=[string]$job.outputRecordId;job_id=[string]$job.id;video_id=[string]$job.videoId;status=[string]$job.status;created_at=[string]$job.createdAt;updated_at=[string]$job.updatedAt;completed_at=[string]$job.completedAt;replace_transaction_id=[string]$job.replaceTransactionId}
  }
  $report.scans+=@{source='local_uploader_jobstore';ok=$true;rows=$arr.Count}
 }catch{$report.scans+=@{source='local_uploader_jobstore';ok=$false;reason='unreadable'}}
}
Write-Output ('P1_YT_JOBS='+($report|ConvertTo-Json -Compress -Depth 6))
