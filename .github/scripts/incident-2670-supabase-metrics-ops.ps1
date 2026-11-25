# #2670 privileged Supabase Metrics API readback; fixed project and GET only.
# Existing runner .env credential remains on Windows. Print numeric summaries ONLY.
$ErrorActionPreference='Stop'
$script:phase='RUNNER_ENV_UNAVAILABLE'
$script:httpStatus=0
try {
$file='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not(Test-Path -LiteralPath $file)){Write-Output 'incident2670_metrics=RUNNER_ENV_UNAVAILABLE';throw 'metrics_preflight'}
$lines=@(Get-Content -LiteralPath $file)
function Setting([string]$name){
  $found=@($lines|Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})
  if($found.Count -gt 1){throw 'metrics_ambiguous_env'}
  if($found.Count -eq 0){return ''}
  return ([string](($found[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39)
}
$script:phase='ENV_PROJECT_OR_DUPLICATE'
if((Setting 'SUPABASE_URL').TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'metrics_wrong_project'}
# The owner must provision a dedicated server-side secret on this Windows host.
# Do NOT fall back to application credentials or legacy service_role keys.
$script:phase='ENV_KEY_DUPLICATE_OR_UNREADABLE'
$secret=Setting 'SUPABASE_METRICS_SECRET_KEY'
Write-Output ('incident2670_key_length='+$secret.Length)
Write-Output ('incident2670_key_prefix_valid='+[int]$secret.StartsWith('sb_secret_'))
$script:phase='NEEDS_EXISTING_SB_SECRET'
if(-not $secret.StartsWith('sb_secret_') -or $secret.Length -lt 32){
  throw 'metrics_key_unavailable'
}
$basic=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('service_role:'+$secret))
$headers=@{Authorization='Basic '+$basic;Accept='text/plain'}
$endpoint='https://vkwvscgisqsbuwagdvtb.supabase.co/customer/v1/privileged/metrics'
function Scrape {
  try {
    $script:phase='API_UNAVAILABLE'
    $reply=Invoke-WebRequest -Method Get -Uri $endpoint -Headers $headers -TimeoutSec 20 -MaximumRedirection 0 -UseBasicParsing
    $script:httpStatus=[int]$reply.StatusCode
    if($reply.StatusCode -ne 200){throw 'metrics_http_not_200'}
    return [string]$reply.Content
  } catch {
    if($_.Exception.Response){try{$script:httpStatus=[int]$_.Exception.Response.StatusCode}catch{}}
    $script:phase='API_UNAVAILABLE'
    throw 'metrics_read_failed'
  }
}
function Value([string]$body,[string]$name){
  $pat='(?m)^'+[regex]::Escape($name)+'(?:\{[^}]*\})?\s+([0-9.eE+-]+)(?:\s|$)'
  $hits=[regex]::Matches($body,$pat)
  if($hits.Count -ne 1){return [double]::NaN}
  $v=0.0
  if(-not [double]::TryParse($hits[0].Groups[1].Value,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$v)){return [double]::NaN}
  return $v
}
function Snapshot([string]$body){
  $script:phase='REQUIRED_SERIES_UNAVAILABLE'
  $total=Value $body 'node_memory_MemTotal_bytes'
  $avail=Value $body 'node_memory_MemAvailable_bytes'
  $swapTotal=Value $body 'node_memory_SwapTotal_bytes'
  $swapFree=Value $body 'node_memory_SwapFree_bytes'
  if([double]::IsNaN($total) -or [double]::IsNaN($avail) -or $total -le 0 -or $avail -gt $total -or [double]::IsNaN($swapTotal) -or [double]::IsNaN($swapFree) -or $swapFree -gt $swapTotal){
    throw 'metrics_required_series'
  }
  return [PSCustomObject]@{Total=$total;Available=$avail;SwapTotal=$swapTotal;SwapFree=$swapFree}
}
$first=Snapshot (Scrape)
Start-Sleep -Seconds 10
$second=Snapshot (Scrape)
$script:phase='METRIC_CALCULATION_FAILED'
$used=100.0*($second.Total-$second.Available)/$second.Total
$swapUsed=if($second.SwapTotal -eq 0){0.0}else{100.0*($second.SwapTotal-$second.SwapFree)/$second.SwapTotal}
Write-Output ('incident2670_memory_total_mb='+[math]::Round($second.Total/1048576,1))
Write-Output ('incident2670_memory_available_mb='+[math]::Round($second.Available/1048576,1))
Write-Output ('incident2670_memory_used_pct='+[math]::Round($used,1))
Write-Output ('incident2670_swap_total_mb='+[math]::Round($second.SwapTotal/1048576,1))
Write-Output ('incident2670_swap_used_pct='+[math]::Round($swapUsed,1))
Write-Output ('incident2670_memory_available_delta_mb='+[math]::Round(($second.Available-$first.Available)/1048576,1))
Write-Output 'incident2670_metrics=PASS_TWO_READONLY_SAMPLES'

} catch {
  # Never emit exception text, headers, response body, or secret material.
  Write-Output ('incident2670_metrics_http_status='+$script:httpStatus)
  Write-Output ('incident2670_metrics='+$script:phase)
  # Let the outer protected workflow fail on missing success receipt, while
  # preserving the sanitized stdout even if Ops discards failed-job output.
}
