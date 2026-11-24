$ErrorActionPreference='Stop'
$phase='preflight'
trap {Write-Output ('smv1_2965_failure_phase='+$phase);exit 1}
$root='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$lines=@(Get-Content -LiteralPath (Join-Path $root '.env'))
function Get-Setting([string]$name){
  $k=@($lines | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})
  if($k.Count -ne 1){throw 'setting_missing_or_ambiguous'}
  return ([string]($k[0] -split '=',2)[1]).Trim().Trim('"').Trim([char]39)
}
$secret=Get-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$db=Get-Setting 'STUDIO_GOVERNOR_DB_PATH'
if($secret.Length -lt 24 -or -not [IO.Path]::IsPathRooted($db) -or -not (Test-Path -LiteralPath $db -PathType Leaf)){throw 'preflight_invalid'}
$header=@{'X-Pipeline-Secret'=$secret}
$api='http://127.0.0.1:3350'
$h=Invoke-RestMethod -Uri "$api/health" -TimeoutSec 15
if($h.ok -ne $true -or $h.studio_write_source -ne 'supabase' -or $h.supabase_pipeline_writes -ne $true -or $h.workload_governor_enabled -ne $true -or $h.recovery_read_only -ne $false -or $h.airtable_activity.any_activity -ne $false){throw 'authority_gate_failed'}
$phase='python_discovery'
$candidates=@((Join-Path $root '.venv\Scripts\python.exe'),(Join-Path $root 'venv\Scripts\python.exe'),(Join-Path (Split-Path $root -Parent) '.venv\Scripts\python.exe'))
$candidates+=@(Get-Process -Name python,python3 -ErrorAction SilentlyContinue | ForEach-Object {$_.Path})
$python=$null
foreach($candidate in $candidates){
 if($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)){
  & $candidate -c 'import sqlite3' 2>$null
  if($LASTEXITCODE -eq 0){$python=$candidate;break}
 }
}
if(-not $python){throw 'python_unavailable'}
$phase='readonly_lease_observation'
$code=@'
import sqlite3, sys, time, json, hashlib, pathlib
p=pathlib.Path(sys.argv[1]).resolve()
db=sqlite3.connect(p.as_uri()+"?mode=ro",uri=True,timeout=5)
db.execute("PRAGMA query_only=ON")
scopes=("smv1_drain","photo_group","transfer","ratio","supabase_read","supabase_write")
def sample():
    now=time.time()
    rows=db.execute("SELECT scope,lease_key,token,lease_until,owner_pid FROM resource_leases WHERE scope IN (?,?,?,?,?,?) AND lease_until>?",(*scopes,now)).fetchall()
    return {hashlib.sha256((r[0]+":"+r[1]+":"+r[2]).encode()).hexdigest()[:16]:(r[0],r[3],r[4],now) for r in rows}
a=sample()
time.sleep(36)
b=sample()
out=[]
for k in sorted(a.keys()|b.keys()):
    x,y=a.get(k),b.get(k)
    z=y or x
    out.append({"scope":z[0],"fingerprint":k,"state":"renewed" if x and y and y[1]>x[1]+1 else "unchanged" if x and y else "new" if y else "released_or_expired","remaining_seconds":round(y[1]-y[3],1) if y else None,"owner_recorded":bool(z[2])})
print("smv1_2965_lease_evidence="+json.dumps(out,separators=(",",":")))
db.close()
'@
# Native Windows PowerShell can strip embedded Python quotes from -c.
# Pass source over stdin, which preserves it exactly; never expose DB path/errors.
$code | & $python - $db 2>$null
$readCode=$LASTEXITCODE
if($readCode -ne 0){Write-Output ('smv1_2965_probe_exit='+[int]$readCode)}
# A failed observation must not prevent the normal governed recovery if the
# independent authenticated admission check confirms the drain is free.
$phase='governor_recheck'
$g=Invoke-RestMethod -Uri "$api/admin/workload" -Headers $header -TimeoutSec 15
$summary=[ordered]@{enabled=$g.enabled;admission_paused=$g.admission_paused;database_circuit_open=$g.database_circuit_open;active_jobs=$g.active_jobs;queued_jobs=$g.queued_jobs;active_resource_slots=$g.active_resource_slots}
Write-Output ('smv1_2965_after='+($summary|ConvertTo-Json -Compress -Depth 5))
if($g.ok -ne $true -or $g.enabled -ne $true -or $g.admission_paused -ne $false -or $g.database_circuit_open -ne $false -or $null -eq $g.active_resource_slots.smv1_drain){throw 'admission_unavailable'}
if([int]$g.active_resource_slots.smv1_drain -gt 0){Write-Output 'smv1_2965_existing_drain_active=1';exit 1}
$phase='exact_pinned_drain'
$body=@{production_request_record_id='recZswSwDPUSNoW9N';extra=@{max_runs=1;photo_workers=1}}|ConvertTo-Json -Compress -Depth 4
$result=Invoke-RestMethod -Uri "$api/stages/smv1/drain" -Method POST -ContentType 'application/json' -Headers $header -Body $body -TimeoutSec 180
$state=[string]$result.status
if($state -notin @('ok','skipped','deferred','error')){throw 'unknown_stage_state'}
Write-Output ('smv1_2965_stage='+$state+';processed='+[int]$result.details.processed_count)
if($state -ne 'ok' -or [int]$result.details.processed_count -lt 1){throw 'no_confirmed_crop_progress'}
Write-Output 'smv1_2965_exact_drain_progress=PASS'
