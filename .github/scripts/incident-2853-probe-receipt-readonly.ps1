# Read-only reconciliation of run 45512704138. No production submit.
$ErrorActionPreference = 'Stop'
$root = 'D:\Content Creation\ChicagoShining Pipeline'
$start = [DateTimeOffset]::Parse('2026-11-24T23:46:15Z')
$end = [DateTimeOffset]::Parse('2026-11-24T23:46:23Z')
$audit = Join-Path $root 'Deployment Logs\Local Services\ops-shell-audit.log'
$matchesFound = @(
  foreach ($line in (Get-Content -LiteralPath $audit -Tail 400)) {
    if ($line -notmatch '^\[(?<ts>[^\]]+)\] (?<payload>\{.*\})$') { continue }
    $stamp = [DateTimeOffset]::Parse($Matches.ts)
    if ($stamp -lt $start -or $stamp -gt $end) { continue }
    $entry = $Matches.payload | ConvertFrom-Json
    if ($entry.event -eq 'start' -and ([string]$entry.command).Length -eq 4806 -and
        ([string]$entry.command).StartsWith('$ErrorActionPreference=''Stop'';$raw=[Convert]::FromBase64String(') -and
        ([string]$entry.jobId) -match '^[0-9a-f-]{36}$') {
      [string]$entry.jobId
    }
  }
)
if ($matchesFound.Count -ne 1) { throw 'incident2853_previous_receipt_not_unique' }
Write-Output ('incident2853_previous_job_id=' + $matchesFound[0])

# Only the approved local read-only workload snapshot; never print secrets.
$envPath = Join-Path $root 'Services\pipeline-runner\service\.env'
$line = Get-Content -LiteralPath $envPath |
  Where-Object { $_ -match '^\s*PIPELINE_RUNNER_SHARED_SECRET\s*=' } |
  Select-Object -Last 1
if (-not $line) { throw 'incident2853_readonly_runner_auth_missing' }
$secret = ([string]$line -split '=', 2)[1].Trim().Trim('"').Trim("'")
if (-not $secret) { throw 'incident2853_readonly_runner_auth_empty' }
try {
  $w = Invoke-RestMethod 'http://127.0.0.1:3350/admin/workload' -Headers @{'X-Pipeline-Secret'=$secret} -TimeoutSec 20
  if ($w.ok -ne $true) { throw 'incident2853_readonly_workload_unverified' }
  Write-Output ('incident2853_workload=' + (@{
    circuit=[string]$w.database_circuit_phase
    max_jobs=[int]$w.max_jobs
    active=[int]$w.active_jobs
    queued=[int]$w.queued_jobs
    paused=[int]$w.paused_jobs
    worker_heavy=[int]$w.active_worker_heavy
    admission_paused=[bool]$w.admission_paused
  } | ConvertTo-Json -Compress))
}
finally { Remove-Variable secret,line -ErrorAction SilentlyContinue }
