# Explicit owner-authorized single-host producer trial. No other settings changed.
$ErrorActionPreference='Stop'
$phase='PREFLIGHT'
try {
  $mode='__MODE__'
  if($mode -notin @('stage','rollback','sample')){throw 'mode'}
  $path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
  $raw=[IO.File]::ReadAllText($path)
  function Setting([string]$name){
    $matches=[regex]::Matches($raw,'(?m)^\s*'+[regex]::Escape($name)+'[ \t]*=([^\r\n]*)')
    if($matches.Count -gt 1){throw 'duplicate_setting'}
    if($matches.Count -eq 0){return ''}
    return $matches[0].Groups[1].Value.Trim().Trim('"').Trim([char]39)
  }
  $cap=Setting 'STUDIO_MAX_PRODUCER_JOBS'
  $phase='CONFIG_GUARDS'
  if((Setting 'STUDIO_WORKLOAD_GOVERNOR_ENABLED') -notmatch '^(true|1|yes)$' -or
     (Setting 'STUDIO_SIDE_EFFECT_OUTBOX_ENABLED') -match '^(true|1|yes)$' -or
     (Setting 'STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED') -match '^(true|1|yes)$' -or
     (Setting 'SUPABASE_URL').TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'config'}
  $secret=Setting 'PIPELINE_RUNNER_SHARED_SECRET'
  if($secret.Length -lt 24){throw 'secret'}
  if($mode -ne 'rollback'){
    $phase='LIVE_GUARDS'
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
  $phase='CAP_COMPARE_AND_SWAP'
  $from=if($mode -eq 'stage'){'1'}else{'2'}
  $to=if($mode -eq 'stage'){'2'}else{'1'}
  if($cap -ne $from){throw 'cap_changed'}
  $pattern='(?m)^([ \t]*STUDIO_MAX_PRODUCER_JOBS[ \t]*=[ \t]*)'+$from+'([ \t]*)(?=\r?$)'
  $rx=New-Object regex($pattern)
  if($rx.Matches($raw).Count -ne 1){throw 'cap_not_exact'}
  $next=$rx.Replace($raw, {param($m) $m.Groups[1].Value+$to+$m.Groups[2].Value},1)
  if([IO.File]::ReadAllText($path) -cne $raw){throw 'config_changed'}
  # Preserve the existing file ACL; the exact old cap is known (1) and only
  # its single character changes. No secret-bearing backup is exported.
  $bytes=[IO.File]::ReadAllBytes($path)
  $bom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  $encoding=New-Object System.Text.UTF8Encoding($bom,$true)
  if($encoding.GetString($bytes).TrimStart([char]0xFEFF) -cne $raw){throw 'encoding'}
  $temp=$path+'.cap2670-'+[guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($temp,$next,$encoding)
    Set-Acl -LiteralPath $temp -AclObject (Get-Acl -LiteralPath $path)
    if([IO.File]::ReadAllText($path) -cne $raw){throw 'config_changed'}
    [IO.File]::Replace($temp,$path,$null)
  } finally {if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
  if([IO.File]::ReadAllText($path) -cne $next){throw 'write_unverified'}
  Write-Output ('trial2670=CAP_'+$to+'_STAGED')
} catch {
  Write-Output ('trial2670=FAILED_'+$phase)
}
