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
$env:PYTHONPATH=$root
$env:STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED='true'
$script:SelectedPython=$null
function Probe-Python([string]$exe,[string[]]$prefix,[string]$kind){
  if(-not $exe){return}
  $old=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try{
    $out=@(& $exe @prefix -c 'print("incident2670_preflight_hello=PASS")' 2>$null)
    $exit=$LASTEXITCODE
  }catch{
    $out=@();$exit=99
  }finally{$ErrorActionPreference=$old}
  if($exit -eq 0 -and @($out|Where-Object {$_ -eq 'incident2670_preflight_hello=PASS'}).Count -eq 1){
    $script:SelectedPython=[PSCustomObject]@{exe=$exe;prefix=$prefix;kind=$kind}
  }
}
$venvs=@(
  (Join-Path $root '.venv\Scripts\python.exe'),
  (Join-Path $root 'venv\Scripts\python.exe'),
  (Join-Path (Split-Path $root -Parent) '.venv\Scripts\python.exe')
)
foreach($candidate in $venvs){
  if($script:SelectedPython){break}
  if(Test-Path -LiteralPath $candidate -PathType Leaf){
    Probe-Python $candidate @() 'VENV'
  }
}
if(-not $script:SelectedPython){
  $running=@(Get-Process -Name python,python3 -ErrorAction SilentlyContinue)
  foreach($proc in $running){
    if($script:SelectedPython){break}
    $exe=[string]$proc.Path
    if($exe -and $exe -notmatch '(?i)\\WindowsApps\\' -and
       (Test-Path -LiteralPath $exe -PathType Leaf)){
      Probe-Python $exe @() 'RUNNING'
    }
  }
}
$regFound=$false
if(-not $script:SelectedPython){
  foreach($base in @('HKLM:\SOFTWARE\Python\PythonCore',
                     'HKCU:\SOFTWARE\Python\PythonCore',
                     'HKLM:\SOFTWARE\WOW6432Node\Python\PythonCore')){
    if($script:SelectedPython){break}
    if(-not(Test-Path -LiteralPath $base)){continue}
    foreach($version in @(Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)){
      if($script:SelectedPython){break}
      try{
        $install=Get-Item -LiteralPath (Join-Path $version.PSPath 'InstallPath') -ErrorAction Stop
        $folder=[string]$install.GetValue('')
        if($folder){
          $candidate=Join-Path $folder 'python.exe'
          if(Test-Path -LiteralPath $candidate -PathType Leaf){
            $regFound=$true
            Probe-Python $candidate @() 'REGISTRY'
          }
        }
      }catch{}
    }
  }
}
Write-Output ('incident2670_preflight_python_registry='+$(if($regFound){'FOUND'}else{'NONE'}))
if(-not $script:SelectedPython){
  $userCandidates=@()
  $localPrograms=if($env:LOCALAPPDATA){Join-Path $env:LOCALAPPDATA 'Programs\Python'}else{''}
  if($localPrograms -and (Test-Path -LiteralPath $localPrograms)){
    foreach($dir in @(Get-ChildItem -LiteralPath $localPrograms -Directory -ErrorAction SilentlyContinue)){
      $userCandidates+=Join-Path $dir.FullName 'python.exe'
    }
  }
  $userCandidates+=@(
    'C:\Python311\python.exe','C:\Python312\python.exe',
    'C:\Python313\python.exe','C:\Python314\python.exe',
    'C:\Program Files\Python311\python.exe',
    'C:\Program Files\Python312\python.exe',
    'C:\Program Files\Python313\python.exe'
  )
  foreach($candidate in $userCandidates){
    if($script:SelectedPython){break}
    if(Test-Path -LiteralPath $candidate -PathType Leaf){
      Probe-Python $candidate @() 'LOCAL'
    }
  }
}
if(-not $script:SelectedPython){
  try{
    $cim=@(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction Stop)
    foreach($item in $cim){
      if($script:SelectedPython){break}
      $candidate=[string]$item.ExecutablePath
      if($candidate -and [IO.Path]::GetFileName($candidate) -ieq 'python.exe' -and
         $candidate -notlike '*\WindowsApps\*' -and
         (Test-Path -LiteralPath $candidate -PathType Leaf)){
        Probe-Python $candidate @() 'CIM_RUNNING'
      }
    }
  }catch{}
}
$pathCommand=Get-Command python -ErrorAction SilentlyContinue
$pathEntry=[string]$pathCommand.Source
$pathCategory=if(-not $pathCommand){'MISSING'}elseif($pathEntry -like '*\WindowsApps\*'){'WINDOWS_APPS_ALIAS'}else{'OTHER'}
Write-Output ('incident2670_preflight_python_path_category='+$pathCategory)
if(-not $script:SelectedPython){
  $launcher=Get-Command py -ErrorAction SilentlyContinue
  if($launcher){Probe-Python 'py' @('-3') 'LAUNCHER'}
}
if(-not $script:SelectedPython){
  $pathPython=Get-Command python -ErrorAction SilentlyContinue
  if($pathPython){Probe-Python 'python' @() 'PATH'}
}
if(-not $script:SelectedPython){
  Write-Output 'incident2670_preflight_python=UNUSABLE'
  Write-Output 'incident2670_preflight_hello=FAILED'
  $ready=$false
}else{
  Write-Output 'incident2670_preflight_python=FOUND'
  Write-Output ('incident2670_preflight_python_source='+$script:SelectedPython.kind)
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
  $exe=$script:SelectedPython.exe
  $prefix=[string[]]$script:SelectedPython.prefix
  $old=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try{
    $receipt=@(& $exe @prefix -c $code 2>$null)
    $pythonExit=$LASTEXITCODE
  }catch{$receipt=@();$pythonExit=99}
  finally{$ErrorActionPreference=$old}
  @($receipt|Where-Object {
    $_ -match '^incident2670_preflight_(requests=(AVAILABLE|UNAVAILABLE)|import=(PASS|FAIL)|interface=(PASS|FAIL))$'
  })|ForEach-Object {Write-Output $_}
  if($pythonExit -ne 0 -or
     @($receipt|Where-Object {$_ -eq 'incident2670_preflight_interface=PASS'}).Count -ne 1){
    Write-Output 'incident2670_preflight_python_run=FAILED'
    $ready=$false
  }else{Write-Output 'incident2670_preflight_python_run=PASS'}
}
if($ready){Write-Output 'incident2670_preflight_result=READY_FOR_SYNTHETIC_TEST'}
else{Write-Output 'incident2670_preflight_result=INCOMPLETE_NO_CHANGES'}
