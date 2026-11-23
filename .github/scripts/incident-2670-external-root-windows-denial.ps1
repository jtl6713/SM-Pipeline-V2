# Incident #2670 external root-claim vs deployed Windows Python client; synthetic ONLY.
# GitHub substitutes __MODE__ with deny/hold; never persist flags or credentials.
$ErrorActionPreference='Stop'
$mode='__MODE__'
if($mode -ne 'deny'){throw 'crosshost_mode_invalid'}
$root='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$file=Join-Path $root '.env'
if(-not (Test-Path -LiteralPath $file)){Write-Output 'incident2670_root_windows_class=RUNNER_ENV_MISSING';throw 'crosshost_runner_env_unavailable'}
if(-not (Test-Path -LiteralPath (Join-Path $root 'studio_produce\global_coordinator.py'))){Write-Output 'incident2670_root_windows_class=COORDINATOR_MODULE_MISSING';throw 'crosshost_runner_code_unavailable'}
$lines=@(Get-Content -LiteralPath $file)
function Lookup([string]$name) {
  $regex='^\s*'+[regex]::Escape($name)+'\s*='
  $found=@($lines|Where-Object {$_ -match $regex})
  if($found.Count -ne 1){throw 'crosshost_runner_config_unavailable'}
  return ([string](($found[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39)
}
$sbUrl=Lookup 'SUPABASE_URL'
$sbKey=Lookup 'SUPABASE_SERVICE_ROLE_KEY'
if($sbUrl.TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or $sbKey.Length -lt 32) {
  throw 'crosshost_wrong_supabase_project'
}
$env:SUPABASE_URL=$sbUrl
$env:SUPABASE_SERVICE_ROLE_KEY=$sbKey
$env:STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED='true'
$env:PYTHONPATH=$root
$env:INCIDENT2670_CROSSHOST_MODE=$mode
$pythonExe=$null
$candidates=@(
  (Join-Path $root '.venv\Scripts\python.exe'),
  (Join-Path $root 'venv\Scripts\python.exe'),
  (Join-Path (Split-Path $root -Parent) '.venv\Scripts\python.exe')
)
foreach($candidate in $candidates){
  if($pythonExe){break}
  if(-not(Test-Path -LiteralPath $candidate -PathType Leaf)){continue}
  $old=$ErrorActionPreference;$ErrorActionPreference='Continue'
  try{$hello=@(& $candidate -c 'print(2670)' 2>$null);$rc=$LASTEXITCODE}
  catch{$hello=@();$rc=99}
  finally{$ErrorActionPreference=$old}
  if($rc -eq 0 -and @($hello|Where-Object {[string]$_ -eq '2670'}).Count -eq 1){$pythonExe=$candidate}
}
if(-not $pythonExe){Write-Output 'incident2670_root_windows_class=PYTHON_EXE_MISSING';throw 'crosshost_python_unavailable'}
Write-Output 'incident2670_root_windows_python=VERIFIED_VENV'
$python=@'
import os, sys, time
try:
  from studio_produce import global_coordinator as g
except Exception:
  print('incident2670_root_windows_class=IMPORT_FAILED')
  raise SystemExit(31)

mode=os.environ["INCIDENT2670_CROSSHOST_MODE"]
settings={
  "supabase_url":os.environ["SUPABASE_URL"],
  "supabase_service_role_key":os.environ["SUPABASE_SERVICE_ROLE_KEY"],
}
identity="incident2670-crosshost-python-synthetic-20261123-r2"
try:
  result=g.acquire("native_gallery", identity, ttl_seconds=90, settings=settings)
except g.GlobalAdmissionUnavailable as exc:
  reason=str(exc)
  allowed={'global_workload_rpc_unconfirmed','global_workload_rpc_rejected',
           'global_workload_rpc_receipt_invalid','global_workload_authority_unavailable'}
  print('incident2670_root_windows_class='+(
      reason.upper() if reason in allowed else 'ADMISSION_UNAVAILABLE'))
  raise SystemExit(32)
except Exception:
  print('incident2670_root_windows_class=RUNTIME_FAILURE')
  raise SystemExit(33)
if mode=="deny":
  if result.accepted or result.reason!="database_capacity":
    if result.accepted:
      g.release(result, settings=settings)
    print("incident2670_root_windows_class=UNEXPECTED_ADMISSION_OR_REASON")
    raise SystemExit("crosshost_runner_deny_invalid")
  print("incident2670_crosshost_runner_DENIED_ROOT_CAP")
elif mode=="hold":
  if not result.accepted:
    raise SystemExit("crosshost_runner_admission_unverified")
  print("incident2670_crosshost_runner_HOLD_ACQUIRED", flush=True)
  try:
    time.sleep(24)
  finally:
    if not g.release(result, settings=settings):
      raise SystemExit("crosshost_runner_release_unverified")
  print("incident2670_crosshost_runner_HOLD_RELEASED", flush=True)
else:
  raise SystemExit("crosshost_mode_invalid")
'@
$tempScript=Join-Path ([IO.Path]::GetTempPath()) ('incident2670-'+[guid]::NewGuid().ToString('N')+'.py')
try{
  [IO.File]::WriteAllText($tempScript,$python,[Text.Encoding]::UTF8)
  $old=$ErrorActionPreference;$ErrorActionPreference='Continue'
  try{$result=@(& $pythonExe $tempScript 2>$null);$pythonExit=$LASTEXITCODE}
  catch{$result=@();$pythonExit=99}
  finally{$ErrorActionPreference=$old}
}finally{
  Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue
}
if($pythonExit -ne 0){
  @($result|Where-Object {$_ -match '^incident2670_root_windows_class=(IMPORT_FAILED|GLOBAL_WORKLOAD_RPC_UNCONFIRMED|GLOBAL_WORKLOAD_RPC_REJECTED|GLOBAL_WORKLOAD_RPC_RECEIPT_INVALID|GLOBAL_WORKLOAD_AUTHORITY_UNAVAILABLE|ADMISSION_UNAVAILABLE|RUNTIME_FAILURE|UNEXPECTED_ADMISSION_OR_REASON)$'})|ForEach-Object {Write-Output $_}
  throw 'crosshost_python_client_failed'
}
$verified=@($result|Where-Object {$_ -match '^incident2670_crosshost_runner_(DENIED_ROOT_CAP|HOLD_ACQUIRED|HOLD_RELEASED)$'})
if($mode -eq 'deny' -and $verified.Count -ne 1){throw 'crosshost_denial_receipt_missing'}
$verified|ForEach-Object {Write-Output $_}
