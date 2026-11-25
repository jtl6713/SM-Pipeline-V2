# Explicit owner-authorized single-host producer trial. No other settings changed.
$ErrorActionPreference='Stop'
$script:phase='PREFLIGHT'
# A single ASCII cap digit can be updated in-place under an exclusive file
# lock. No temporary secret-bearing file, ACL rewrite or File.Replace needed.
function Set-ExactProducerCap([string]$file,[string]$original,[string]$from,[string]$to){
  $script:phase='CAP_EXACT_LINE'
  $pattern='(?m)^[ \t]*STUDIO_MAX_PRODUCER_JOBS[ \t]*=[ \t]*(?<quote>["'']?)(?<digit>'+[regex]::Escape($from)+')\k<quote>[ \t]*(?=\r?$)'
  $hits=[regex]::Matches($original,$pattern)
  if($hits.Count -ne 1){throw 'cap_not_exact'}
  $script:phase='CAP_ENCODING'
  $encoding=[System.Text.UTF8Encoding]::new($false,$true)
  $stream=$null
  try {
    $script:phase='CAP_EXCLUSIVE_OPEN'
    $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    if($stream.Length -gt 1048576 -or $stream.Length -lt 1){throw 'size'}
    $bytes=New-Object byte[] ([int]$stream.Length)
    $offset=0
    while($offset -lt $bytes.Length){
      $n=$stream.Read($bytes,$offset,$bytes.Length-$offset)
      if($n -le 0){throw 'short_read'}
      $offset+=$n
    }
    $bom=if($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191){3}else{0}
    $script:phase='CAP_LOCKED_COMPARE'
    if($encoding.GetString($bytes,$bom,$bytes.Length-$bom) -cne $original){throw 'config_changed'}
    $digit=$hits[0].Groups['digit']
    $position=$bom+$encoding.GetByteCount($original.Substring(0,$digit.Index))
    if($position -ge $bytes.Length -or $bytes[$position] -ne [byte][char]$from){throw 'byte_mismatch'}
    $script:phase='CAP_WRITE_UNCONFIRMED'
    $stream.Position=$position
    $stream.WriteByte([byte][char]$to)
    $stream.Flush($true)
    $stream.Position=0
    $verified=New-Object byte[] $bytes.Length
    $offset=0
    while($offset -lt $verified.Length){
      $n=$stream.Read($verified,$offset,$verified.Length-$offset)
      if($n -le 0){throw 'short_verify'}
      $offset+=$n
    }
    $bytes[$position]=[byte][char]$to
    if($stream.Length -ne $bytes.Length -or [Convert]::ToBase64String($verified) -cne [Convert]::ToBase64String($bytes)){throw 'write_unverified'}
  } finally {if($null -ne $stream){$stream.Dispose()}}
}

try {
  $mode='__MODE__'
  if($mode -notin @('stage','rollback','sample','verify_rollback','inspect')){throw 'mode'}
  $path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
  $raw=[IO.File]::ReadAllText($path)
  function Setting([string]$name){
    $matches=[regex]::Matches($raw,'(?m)^\s*'+[regex]::Escape($name)+'[ \t]*=([^\r\n]*)')
    if($matches.Count -gt 1){throw 'duplicate_setting'}
    if($matches.Count -eq 0){return ''}
    return $matches[0].Groups[1].Value.Trim().Trim('"').Trim([char]39)
  }
  $cap=Setting 'STUDIO_MAX_PRODUCER_JOBS'
  $script:phase='CONFIG_GUARDS'
  if((Setting 'STUDIO_WORKLOAD_GOVERNOR_ENABLED') -notmatch '^(true|1|yes)$' -or
     (Setting 'STUDIO_SIDE_EFFECT_OUTBOX_ENABLED') -match '^(true|1|yes)$' -or
     (Setting 'STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED') -match '^(true|1|yes)$' -or
     (Setting 'SUPABASE_URL').TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'config'}
  $secret=Setting 'PIPELINE_RUNNER_SHARED_SECRET'
  if($secret.Length -lt 24){throw 'secret'}
  if($mode -eq 'inspect'){
    $script:phase='CAP_READBACK'
    $w=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 15
    if($cap -notin @('1','2') -or $w.ok -ne $true -or $w.enabled -ne $true -or [int]$w.max_jobs -notin @(1,2)){throw 'unexpected_cap'}
    Write-Output ('trial2670_cap_readback='+$cap+':'+[int]$w.max_jobs)
    Write-Output 'trial2670=PASS_INSPECT'
    return
  }
  if($mode -eq 'verify_rollback'){
    $script:phase='ROLLBACK_LIVE_READBACK'
    $w=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 15
    if($cap -ne '1' -or $w.ok -ne $true -or $w.enabled -ne $true -or [int]$w.max_jobs -ne 1 -or [int]$w.combined_heavy_active -gt 1){throw 'rollback_unverified'}
    Write-Output 'trial2670=CAP_1_LIVE_VERIFIED'
    return
  }
  if($mode -ne 'rollback'){
    $script:phase='LIVE_GUARDS'
    $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 15
    $w=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 15
    if($h.ok -ne $true -or $h.studio_write_source -ne 'supabase' -or $h.supabase_pipeline_writes -ne $true -or $h.airtable_activity.any_activity -ne $false -or $h.recovery_read_only -ne $false -or $w.enabled -ne $true -or $w.database_circuit_phase -ne 'closed' -or $w.admission_paused -ne $false -or $w.smv1_maintenance_active -ne $false -or [int]$w.paused_jobs -ne 0 -or [int]$w.max_db_reads -gt 6 -or [int]$w.max_db_writes -gt 3 -or [int]$w.max_jobs -ne [int]$cap -or [int]$w.combined_heavy_active -gt [int]$cap){throw 'health'}
    $history=@($w.runner_request_history)
    $failures=[int](($history|Measure-Object -Property failures -Sum).Sum)
    $requests=[int](($history|Measure-Object -Property requests -Sum).Sum)
    $maxMs=[double](($history|Measure-Object -Property max_latency_ms -Maximum).Maximum)
    Write-Output ('trial2670_sample='+(@{cap=[int]$w.max_jobs;active=[int]$w.active_jobs;heavy=[int]$w.combined_heavy_active;queued=[int]$w.queued_jobs;paused=[int]$w.paused_jobs;failures=$failures;requests=$requests;max_ms=$maxMs;read_cap=[int]$w.max_db_reads;write_cap=[int]$w.max_db_writes;photo_cap=[int]$w.max_photo_groups;ratio_cap=[int]$w.max_ratio_workers}|ConvertTo-Json -Compress))
    if($failures -ne 0 -or $maxMs -gt 5000){throw 'rest'}
    if($mode -eq 'sample'){Write-Output 'trial2670=PASS_SAMPLE';return}
    if($cap -ne '1' -or [int]$w.queued_jobs -lt 2){throw 'baseline'}
  }
  $script:phase='CAP_COMPARE_AND_SWAP'
  $from=if($mode -eq 'stage'){'1'}else{'2'}
  $to=if($mode -eq 'stage'){'2'}else{'1'}
  if($cap -ne $from){throw 'cap_changed'}
  Set-ExactProducerCap $path $raw $from $to
  Write-Output ('trial2670=CAP_'+$to+'_STAGED')
} catch {
  Write-Output ('trial2670=FAILED_'+$script:phase)
}
