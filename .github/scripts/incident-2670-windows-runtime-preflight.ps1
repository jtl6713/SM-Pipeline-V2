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
  # PowerShell on Windows can turn a Python stderr line into a terminating
  # NativeCommandError before stdout is captured under Stop. Use Continue ONLY
  # for the two isolated child processes; no stderr/log/secret is returned.
  $priorPreference=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try{
    $hello=@(& python -c 'print("incident2670_preflight_hello=PASS")' 2>$null)
    $helloExit=$LASTEXITCODE
  }catch{$hello=@();$helloExit=99}
  finally{$ErrorActionPreference=$priorPreference}
  if($helloExit -ne 0 -or @($hello|Where-Object {$_ -eq 'incident2670_preflight_hello=PASS'}).Count -ne 1){
    Write-Output 'incident2670_preflight_hello=FAILED'
    $ready=$false
  }else{
    Write-Output 'incident2670_preflight_hello=PASS'
    $code=@'
try:
    import requests
    print("incident2670_preflight_requests=AVAILABLE", flush=True)
except Exception:
    print("incident2670_preflight_requests=UNAVAILABLE", flush=True)
    raise SystemExit(42)
try:
    from studio_produce import global_coordinator as g
    print("incident2670_preflight_import=PASS", flush=True)
except Exception:
    print("incident2670_preflight_import=FAIL", flush=True)
    raise SystemExit(43)
try:
    if not g.enabled() or not callable(g.acquire):
        raise RuntimeError("not_ready")
    print("incident2670_preflight_interface=PASS", flush=True)
except Exception:
    print("incident2670_preflight_interface=FAIL", flush=True)
    raise SystemExit(44)
'@
    $priorPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try{
      $receipt=@(& python -c $code 2>$null)
      $pythonExit=$LASTEXITCODE
    }catch{$receipt=@();$pythonExit=99}
    finally{$ErrorActionPreference=$priorPreference}
    @($receipt | Where-Object {
      $_ -match '^incident2670_preflight_(requests=(AVAILABLE|UNAVAILABLE)|import=(PASS|FAIL)|interface=(PASS|FAIL))$'
    }) | ForEach-Object {Write-Output $_}
    if($pythonExit -ne 0){Write-Output 'incident2670_preflight_python_run=FAILED';$ready=$false}
    elseif(@($receipt|Where-Object {$_ -eq 'incident2670_preflight_interface=PASS'}).Count -ne 1){
      Write-Output 'incident2670_preflight_python_run=FAILED'
      $ready=$false
    }
    else{Write-Output 'incident2670_preflight_python_run=PASS'}
  }

}
if($ready){Write-Output 'incident2670_preflight_result=READY_FOR_SYNTHETIC_TEST'}
else{Write-Output 'incident2670_preflight_result=INCOMPLETE_NO_CHANGES'}
