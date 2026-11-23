# Issue 2670: isolated Windows runtime preflight. No RPC, writes, secrets or provider actions.
# Run only on the authorized Windows Ops host. Emit allowlisted classifications.
$ErrorActionPreference='Stop'
$root='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$envFile=Join-Path $root '.env'
$module=Join-Path $root 'studio_produce\global_coordinator.py'
$ready=$true
if(Test-Path -LiteralPath $root){Write-Output 'incident2670_preflight_root=PRESENT'}
else{Write-Output 'incident2670_preflight_root=MISSING';$ready=$false}
if(Test-Path -LiteralPath $module){Write-Output 'incident2670_preflight_module=PRESENT'}
else{Write-Output 'incident2670_preflight_module=MISSING';$ready=$false}
if(Test-Path -LiteralPath $envFile){
  Write-Output 'incident2670_preflight_env=PRESENT'
  try {
    $rows=@(Get-Content -LiteralPath $envFile -ErrorAction Stop)
    function Lookup([string]$name){
      $pattern='^\s*'+[regex]::Escape($name)+'\s*='
      $hits=@($rows|Where-Object {$_ -match $pattern})
      if($hits.Count -ne 1){return ''}
      return ([string](($hits[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39)
    }
    $url=Lookup 'SUPABASE_URL'
    if($url.TrimEnd('/') -eq 'https://vkwvscgisqsbuwagdvtb.supabase.co'){
      Write-Output 'incident2670_preflight_url=EXPECTED'
    }else{Write-Output 'incident2670_preflight_url=INVALID';$ready=$false}
    $key=Lookup 'SUPABASE_SERVICE_ROLE_KEY'
    if($key.Length -ge 32){Write-Output 'incident2670_preflight_authority=PRESENT'}
    else{Write-Output 'incident2670_preflight_authority=MISSING';$ready=$false}
    $key=$null
  }catch{Write-Output 'incident2670_preflight_env=UNREADABLE';$ready=$false}
}else{Write-Output 'incident2670_preflight_env=MISSING';$ready=$false}
$python=Get-Command python -ErrorAction SilentlyContinue
if($null -eq $python){Write-Output 'incident2670_preflight_python=MISSING';$ready=$false}
else{
  Write-Output 'incident2670_preflight_python=FOUND'
  $env:PYTHONPATH=$root
  $env:STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED='true'
  $code=@'
import sys
try:
    import requests
    print("incident2670_preflight_requests=AVAILABLE")
except Exception:
    print("incident2670_preflight_requests=UNAVAILABLE")
    raise SystemExit(42)
try:
    from studio_produce import global_coordinator as g
    print("incident2670_preflight_import=PASS")
except Exception:
    print("incident2670_preflight_import=FAIL")
    raise SystemExit(43)
try:
    if not g.enabled() or not callable(g.acquire):
        raise RuntimeError("not_ready")
    print("incident2670_preflight_interface=PASS")
except Exception:
    print("incident2670_preflight_interface=FAIL")
    raise SystemExit(44)
'@
  try{
    $receipt=@(& python -c $code 2>$null)
    @($receipt | Where-Object {
      $_ -match '^incident2670_preflight_(requests=(AVAILABLE|UNAVAILABLE)|import=(PASS|FAIL)|interface=(PASS|FAIL))$'
    }) | ForEach-Object {Write-Output $_}
    if($LASTEXITCODE -ne 0){Write-Output 'incident2670_preflight_python_run=FAILED';$ready=$false}
    else{Write-Output 'incident2670_preflight_python_run=PASS'}
  }catch{
    Write-Output 'incident2670_preflight_python_run=FAILED'
    $ready=$false
  }
}
if($ready){Write-Output 'incident2670_preflight_result=READY_FOR_SYNTHETIC_TEST'}
else{Write-Output 'incident2670_preflight_result=INCOMPLETE_NO_CHANGES'}
