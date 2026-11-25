$ErrorActionPreference = 'Stop'
$envPath = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
function Read-Setting([string]$name) {
$line = Get-Content -LiteralPath $envPath |
Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') } |
Select-Object -Last 1
if (-not $line) { throw "watchdog_setting_missing_$name" }
$value = ([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
if (-not $value) { throw "watchdog_setting_empty_$name" }
return $value
}
$phase = 'settings'
try {
$secret = Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$sb = (Read-Setting 'SUPABASE_URL').TrimEnd('/')
$key = Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
if ($sb -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co') { throw 'watchdog_unexpected_project' }
$headers = @{apikey=$key; Authorization="Bearer $key"}
$phase = 'rest_selector'
$select = 'id,airtable_record_id,production_request_id,organization_id,brand_id,idea_candidate_id,request_status,requested_title,production_notes,master_asset_status,output_plan_status,variant_status,master_assets,output_plan,variant_manifest,production_job,publish_status,created_at,updated_at,organizations(airtable_record_id),brands(airtable_record_id),idea_candidates(airtable_record_id)'
$filter = '(or(publish_status->>Test_Run_ID.is.null,publish_status->>Test_Run_ID.eq.),or(production_job->>step.is.null,production_job->>step.not.in.(done,escalated)))'
$order = 'production_job->>updated_at.asc.nullsfirst,id.asc'
$uri = "$sb/rest/v1/production_requests?production_job=not.is.null&request_status=in.(Promoted,Submitted)&and=$([uri]::EscapeDataString($filter))&created_at=gte.2026-11-22T12%3A48%3A45.000Z&select=$([uri]::EscapeDataString($select))&order=$([uri]::EscapeDataString($order))&limit=100"
$sw = [Diagnostics.Stopwatch]::StartNew()
$response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 25
$sw.Stop()
$rows = @($response | ForEach-Object { $_ } | Where-Object { $null -ne $_ })
if ($rows.Count -gt 100) { throw 'watchdog_candidate_cap_violation' }
$ids = @()
foreach ($row in $rows) {
if ([string]$row.airtable_record_id -notmatch '^rec[A-Za-z0-9]{14}$' -or
$row.request_status -notin @('Promoted','Submitted') -or
$row.production_job.step -in @('done','escalated') -or
-not [string]::IsNullOrWhiteSpace([string]$row.publish_status.Test_Run_ID) -or
[DateTimeOffset]::Parse([string]$row.created_at) -lt [DateTimeOffset]::Parse('2026-11-22T12:48:45Z')) {
throw 'watchdog_candidate_scope_violation'
}
$ids += [string]$row.airtable_record_id
}
if (@($ids | Select-Object -Unique).Count -ne $ids.Count) { throw 'watchdog_duplicate_candidates' }
$stages = @{}
foreach ($row in $rows) {
$step = [string]$row.production_job.step
if ($step -notmatch '^[a-z_]{1,40}$') { $step = 'unset_or_other' }
$stages[$step] = [int]$stages[$step] + 1
}
Write-Output ('watchdog2853_rest=' + (@{count=$rows.Count;elapsed_ms=$sw.ElapsedMilliseconds;stages=$stages} | ConvertTo-Json -Compress -Depth 5))
$phase = 'runner_workload'
$health = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if ($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.workload_governor_enabled -ne $true -or $health.supabase_pipeline_writes -ne $true) { throw 'watchdog_runner_authority_unverified' }
$work = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
if ($work.ok -ne $true -or $work.enabled -ne $true) { throw 'watchdog_workload_unverified' }
Write-Output ('watchdog2853_workload=' + (@{
circuit=[string]$work.database_circuit_phase;cap=[int]$work.max_jobs;
active=[int]$work.active_jobs;queued=[int]$work.queued_jobs;paused=[int]$work.paused_jobs;
worker_heavy=[int]$work.active_worker_heavy;admission_paused=[bool]$work.admission_paused;
i1_durable=[bool]$health.i1_durable_jobs;maintenance=[bool]$work.smv1_maintenance_active
} | ConvertTo-Json -Compress))
$phase = 'local_queue_readonly'
$dbPath = Read-Setting 'STUDIO_GOVERNOR_DB_PATH'
if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) { throw 'watchdog_queue_missing' }
$code = @'
import collections, json, sqlite3, sys, time
from pathlib import Path
ids = [i for i in sys.argv[2].split(",") if i]
now = time.time()
db = sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro", uri=True, timeout=3)
try:
    rows = db.execute("SELECT request_id,state,available_at,lease_until,consecutive_yields FROM producer_jobs WHERE request_id IN ("+",".join("?" for _ in ids)+")", ids).fetchall() if ids else []
finally:
    db.close()
counts = collections.Counter(str(row[1]) if row[1] in ("queued","running","paused") else "other" for row in rows)
counts["absent"] = len(ids)-len(rows)
print(json.dumps({"identities":[{"id":r[0],"state":r[1],"yield_count":int(r[4] or 0),"wait_s":max(0,int(float(r[2] or 0)-now))} for r in rows],"matched":len(rows),"states":dict(counts),"queued_available":sum(r[1]=="queued" and float(r[2] or 0)<=now for r in rows),"running_expired":sum(r[1]=="running" and float(r[3] or 0)<=now for r in rows),"max_yields":max((int(r[4] or 0) for r in rows),default=0)},separators=(",",":")))
'@
$candidateArg = if ($ids.Count) { $ids -join ',' } else { ',' }
$queue = $code | & python - $dbPath $candidateArg
if ($LASTEXITCODE -ne 0 -or -not $queue) { throw 'watchdog_queue_read_failed' }
$parsed = $queue | ConvertFrom-Json
if ([int]$parsed.matched -gt $rows.Count) { throw 'watchdog_queue_count_invalid' }
$cohort=@()
foreach($identity in $parsed.identities){
  $r=$rows | Where-Object {$_.airtable_record_id -eq $identity.id} | Select-Object -First 1
  if(-not $r){continue}
  $name=[string]$r.production_request_id
  $step=[string]$r.production_job.step
  if($name -notmatch '^PR-[0-9]{14}-[A-Z0-9]{6}$'){$name='other'}
  if($step -notmatch '^[a-z_]{1,40}$'){$step='other'}
  $age=-1
  if($r.production_job.updated_at){$age=[int]([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($r.production_job.updated_at)).TotalSeconds}
  $cohort+=@{request=$name;stage=$step;state=$identity.state;yields=$identity.yield_count;wait_s=$identity.wait_s;age_s=$age}
}
$parsed.PSObject.Properties.Remove('identities')
Write-Output ('watchdog2853_cohort='+(@{requests=$cohort} | ConvertTo-Json -Compress -Depth 6))
Write-Output ('watchdog2853_queue=' + ($parsed | ConvertTo-Json -Compress -Depth 5))
$phase='metrics'
$history=@($work.runner_request_history)
$metrics=@{}
foreach($op in @('read','write')){
  $items=@($history | Where-Object {$_.operation -eq $op})
  $metrics[$op]=@{requests=[int](($items | Measure-Object -Property requests -Sum).Sum);failures=[int](($items | Measure-Object -Property failures -Sum).Sum);max_ms=[double](($items | Measure-Object -Property max_latency_ms -Maximum).Maximum)}
}
Write-Output ('watchdog2853_metrics='+($metrics | ConvertTo-Json -Compress -Depth 5))
Write-Output 'watchdog2853_proof=PASS_READONLY'
} catch {
throw ('watchdog2853_failed_' + $phase)
} finally {
Remove-Variable secret,key,headers -ErrorAction SilentlyContinue
}
