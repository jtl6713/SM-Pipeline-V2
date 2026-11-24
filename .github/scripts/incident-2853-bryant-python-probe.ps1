param([switch]$NormalClosedRecovery)

$ErrorActionPreference = 'Stop'

$requestId = 'recbD8PLtJpez8Oz0'
$expectedJobId = 'spj-7807a7691bb6'
$expectedOutputs = @{
  'rectw2pvgnBzK3wCN' = 10853
  'recJ8jTynJDxsN0hl' = 10854
}
$envPath = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'

function Read-Setting([string]$name) {
  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') } |
    Select-Object -Last 1
  if (-not $line) { throw "incident2853_required_setting_missing_$name" }
  $value = ([string]$line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if (-not $value) { throw "incident2853_required_setting_empty_$name" }
  return $value
}

function Get-RequestRow {
  $rows = @(Invoke-RestMethod -Uri (
    "$script:sb/rest/v1/production_requests?airtable_record_id=eq.$requestId&select=*&limit=2"
  ) -Headers $script:sbHeaders -TimeoutSec 25)
  if ($rows.Count -ne 1) { throw 'incident2853_exact_request_not_unique' }
  return $rows[0]
}

function Get-OutputRows {
  $ids = ($expectedOutputs.Keys | Sort-Object) -join ','
  $rows = @(Invoke-RestMethod -Uri (
    "$script:sb/rest/v1/platform_outputs?airtable_record_id=in.($ids)&select=*&limit=3"
  ) -Headers $script:sbHeaders -TimeoutSec 25)
  if ($rows.Count -ne 2) { throw 'incident2853_exact_outputs_not_unique' }
  return $rows
}

function Get-OutputSlides([int]$number) {
  $encoded = [uri]::EscapeDataString((ConvertTo-Json @($number) -Compress))
  return @(Invoke-RestMethod -Uri (
    "$script:sb/rest/v1/carousel_slides?deleted_from_carousel=eq.false&fields-%3EPO_Output_ID=cs.$encoded&select=airtable_record_id,current_order,deleted_from_carousel,fields&limit=8"
  ) -Headers $script:sbHeaders -TimeoutSec 25)
}

function Has-Value($value) {
  if ($null -eq $value) { return $false }
  return -not [string]::IsNullOrWhiteSpace([string]$value)
}

function Assert-NoProviderOrApproval([object]$row) {
  foreach ($name in @(
    'published_at', 'scheduled_post_date', 'studio_scheduled_at', 'youtube_scheduled_publish_at',
    'platform_post_url', 'platform_publish_response', 'publish_asset_url'
  )) {
    if (Has-Value $row.$name) { throw "incident2853_output_external_state_changed_$name" }
  }
  $bag = $row.error_messages
  if ($null -ne $bag) {
    foreach ($name in @(
      'SM_Factory_Supabase_Approval_Receipt', 'SM_Factory_Held_Review_Receipt',
      'Platform_Publish_Response', 'FB_Photo_ID', 'IG_Child_Container_ID',
      'Platform_Post_ID', 'Platform_Media_ID', 'Publish_Locked_At',
      'Publish_Started_At', 'Studio_Publish_Dispatch_At'
    )) {
      if ($null -ne $bag.PSObject.Properties[$name] -and (Has-Value $bag.$name)) {
        throw "incident2853_output_receipt_changed_$name"
      }
    }
  }
}

function Assert-Baseline([object]$requestRow, [object[]]$outputs) {
  $job = $requestRow.production_job
  if ($requestRow.request_status -ne 'Promoted' -or
      $requestRow.master_asset_status -ne 'Ready' -or
      $requestRow.output_plan_status -ne 'Ready' -or
      $requestRow.variant_status -ne 'Ready' -or
      $null -eq $job -or $job.job_id -ne $expectedJobId -or
      $job.step -ne 'done' -or (Has-Value $job.error)) {
    throw 'incident2853_request_baseline_changed'
  }
  foreach ($row in $outputs) {
    $expected = $expectedOutputs[[string]$row.airtable_record_id]
    if ($null -eq $expected -or [int]$row.output_number -ne $expected -or
        $row.output_status -ne 'Ready for Review' -or
        $row.render_status -ne 'Native Photo Route' -or
        (Has-Value $row.review_status) -or $row.publish_status -ne 'Not Ready' -or
        $row.do_not_publish -ne $false -or $row.auto_publish_enabled -ne $false -or
        (Has-Value $row.output_caption) -or [int]$row.selected_clip_count -ne 4 -or
        (Has-Value $row.aspect_ratio)) {
      throw "incident2853_output_baseline_changed_$($row.output_number)"
    }
    $selected = $row.selected_assets
    if ($null -eq $selected -or $selected.authority -ne 'studio_owner_uploaded_exact_source' -or
        $selected.production_request_record_id -ne $requestId -or
        @($selected.selected_clips).Count -ne 4) {
      throw "incident2853_output_selection_changed_$($row.output_number)"
    }
    Assert-NoProviderOrApproval $row
  }
}

function Assert-Recovered([object]$requestRow, [object[]]$outputs) {
  $job = $requestRow.production_job
  if ($null -eq $job -or $job.job_id -ne $expectedJobId -or
      $job.step -ne 'done' -or (Has-Value $job.error)) {
    throw 'incident2853_probe_not_terminal_done'
  }
  foreach ($row in $outputs) {
    $expected = $expectedOutputs[[string]$row.airtable_record_id]
    if ($null -eq $expected -or [int]$row.output_number -ne $expected -or
        $row.output_status -ne 'Ready for Review' -or
        $row.render_status -ne 'Native Photo Route' -or
        $row.review_status -ne 'Review Sent' -or $row.publish_status -ne 'Not Ready' -or
        $row.do_not_publish -ne $false -or $row.auto_publish_enabled -ne $false -or
        -not (Has-Value $row.output_caption) -or $row.aspect_ratio -ne '4:5' -or
        [int]$row.selected_clip_count -ne 5) {
      throw "incident2853_recovered_output_invalid_$($row.output_number)"
    }
    Assert-NoProviderOrApproval $row
    $marker = $row.error_messages.SM_Studio_Native_Gallery_2873
    $packageMarker = $row.selected_assets.SM_Studio_Native_Gallery_2873
    if ($null -eq $marker -or $marker.complete -ne $true -or
        [int]$marker.slide_count -ne 5 -or $marker.human_approval_required -ne $true -or
        [int]$marker.provider_writes -ne 0 -or
        $null -eq $packageMarker -or $packageMarker.package_sha256 -ne $marker.package_sha256) {
      throw "incident2853_recovery_receipt_invalid_$($row.output_number)"
    }
    $slides = @(Get-OutputSlides ([int]$row.output_number))
    if ($slides.Count -ne 5) { throw "incident2853_slide_count_invalid_$($row.output_number)" }
    foreach ($slide in $slides) {
      $fields = $slide.fields
      if ($slide.deleted_from_carousel -ne $false -or
          $fields.'Approved For Final' -ne $false -or
          $fields.'Shared_Asset_Approved' -ne $false -or
          $fields.'Review Status' -ne 'Review Sent') {
        throw "incident2853_slide_approval_fence_changed_$($row.output_number)"
      }
    }
  }
}

function Get-I1BusyCount {
  # Existing I1 spool, read-only, no job claims or setting changes.
  $dbPath = Read-Setting 'I1_JOB_DB_PATH'
  if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) {
    throw 'incident2853_i1_spool_unavailable'
  }
  $code = 'import sqlite3,sys; from pathlib import Path; db=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True,timeout=3); print(db.execute("SELECT count(*) FROM jobs WHERE status IN (''queued'',''running'')").fetchone()[0]); db.close()'
  $value = & python -c $code $dbPath
  if ($LASTEXITCODE -ne 0 -or ([string]$value) -notmatch '^\d+
  return Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' `
    -Headers $script:runnerHeaders -TimeoutSec 20
}

if (-not (Test-Path -LiteralPath $envPath)) { throw 'incident2853_runner_env_missing' }
$secret = Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$script:sb = (Read-Setting 'SUPABASE_URL').TrimEnd('/')
$sbKey = Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$script:runnerHeaders = @{'X-Pipeline-Secret' = $secret}
$script:sbHeaders = @{apikey = $sbKey; Authorization = "Bearer $sbKey"}

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
  if ($health.ok -ne $true -or $health.service -ne 'pipeline-runner' -or
      $health.studio_write_source -ne 'supabase' -or
      $health.supabase_pipeline_writes -ne $true -or
      $health.workload_governor_enabled -ne $true -or
      $health.recovery_read_only -ne $false -or
      (-not $NormalClosedRecovery -and $health.i1_durable_jobs -ne $false) -or
      $health.airtable_activity.any_activity -ne $false -or
      $health.studio_native_gallery_companion_2873 -ne $true) {
    throw 'incident2853_runner_health_gate_failed'
  }

  # Wait for existing crop/producer work to leave every shared slot. Nothing is
  # submitted while the protected runner is active or while its circuit is open.
  $work = $null
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    $work = Get-Workload
    $resourceTotal = 0
    foreach ($property in $work.active_resource_slots.PSObject.Properties) {
      $resourceTotal += [int]$property.Value
    }
    $i1Busy = 0
    if ($NormalClosedRecovery -and $health.i1_durable_jobs -eq $true) {
      $i1Busy = Get-I1BusyCount
    }
    if ($i1Busy -eq 0 -and $work.enabled -eq $true -and $work.max_jobs -eq 1 -and
        $work.active_jobs -eq 0 -and $work.queued_jobs -eq 0 -and
        $work.paused_jobs -eq 0 -and $work.active_worker_heavy -eq 0 -and
        $resourceTotal -eq 0 -and $work.database_circuit_phase -ne 'open' -and
        $work.admission_paused -eq $false) {
      break
    }
    if ($attempt -eq 60) { throw 'incident2853_governor_not_idle' }
    Start-Sleep -Seconds 5
  }

  if ($work.database_circuit_phase -eq 'closed' -and -not $NormalClosedRecovery) {
    Write-Output 'incident2853_probe=NOT_NEEDED_CIRCUIT_ALREADY_CLOSED'
    exit 0
  }
  if ($NormalClosedRecovery -and $work.database_circuit_phase -ne 'closed') {
    throw 'incident2853_normal_resume_requires_closed_circuit'
  }
  if (-not $NormalClosedRecovery -and $work.database_circuit_phase -ne 'half_open') {
    throw 'incident2853_unexpected_circuit_phase'
  }

  $beforeRequest = Get-RequestRow
  $beforeOutputs = @(Get-OutputRows)
  Assert-Baseline $beforeRequest $beforeOutputs
  if ($NormalClosedRecovery) {
    Write-Output 'incident2853_probe_preflight=PASS_CAP1_CLOSED_EXACT_BASELINE'
  } else {
    Write-Output 'incident2853_probe_preflight=PASS_CAP1_HALF_OPEN_EXACT_BASELINE'
  }

  # Exactly one governed submission. Never retry an accepted or ambiguous POST.
  $body = @{production_request_record_id = $requestId; resume = $true} |
    ConvertTo-Json -Compress
  $answer = Invoke-RestMethod -Method POST `
    -Uri 'http://127.0.0.1:3350/jobs/studio-produce/resume' `
    -Headers $script:runnerHeaders -ContentType 'application/json' `
    -Body $body -TimeoutSec 60
  if ($answer.ok -ne $true -or $answer.accepted -ne $true -or
      $answer.production_request_record_id -ne $requestId -or
      $answer.queued -ne $true) {
    throw 'incident2853_exact_probe_not_accepted'
  }
  Write-Output 'incident2853_probe_submit=ACCEPTED_ONCE'

  $settled = $false
  for ($attempt = 1; $attempt -le 150; $attempt++) {
    Start-Sleep -Seconds 5
    $work = Get-Workload
    if ($work.max_jobs -ne 1 -or $work.active_jobs -gt 1 -or
        $work.active_worker_heavy -gt 0 -or $work.database_circuit_phase -eq 'open') {
      throw 'incident2853_post_submit_safety_gate_failed'
    }
    $requestRow = Get-RequestRow
    $step = [string]$requestRow.production_job.step
    if ($step -in @('blocked', 'escalated')) {
      throw "incident2853_probe_terminal_failure_$step"
    }
    if ($work.database_circuit_phase -eq 'closed' -and
        $work.active_jobs -eq 0 -and $work.queued_jobs -eq 0 -and
        $work.paused_jobs -eq 0 -and $step -eq 'done') {
      $settled = $true
      break
    }
  }
  if (-not $settled) { throw 'incident2853_probe_settle_timeout_no_retry' }

  $afterRequest = Get-RequestRow
  $afterOutputs = @(Get-OutputRows)
  Assert-Recovered $afterRequest $afterOutputs
  if ($NormalClosedRecovery) {
    Write-Output 'incident2853_probe=PASS_NORMAL_RECOVERY_CIRCUIT_CLOSED'
  } else {
    Write-Output 'incident2853_probe=PASS_CANONICAL_PROGRESS_CIRCUIT_CLOSED'
  }
  Write-Output 'incident2853_bryant_factory_packages=PASS_10853_10854_HUMAN_REVIEW_REQUIRED'
  Write-Output 'incident2853_safety=CAP1_ZERO_APPROVAL_SCHEDULE_PUBLISH'
}
finally {
  Remove-Variable secret, sbKey, runnerHeaders, sbHeaders -Scope Script -ErrorAction SilentlyContinue
}
) {
    throw 'incident2853_i1_spool_read_failed'
  }
  return [int]$value
}

function Get-Workload {
  return Invoke-RestMethod -Uri 'http://127.0.0.1:3350/admin/workload' `
    -Headers $script:runnerHeaders -TimeoutSec 20
}

if (-not (Test-Path -LiteralPath $envPath)) { throw 'incident2853_runner_env_missing' }
$secret = Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$script:sb = (Read-Setting 'SUPABASE_URL').TrimEnd('/')
$sbKey = Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$script:runnerHeaders = @{'X-Pipeline-Secret' = $secret}
$script:sbHeaders = @{apikey = $sbKey; Authorization = "Bearer $sbKey"}

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
  if ($health.ok -ne $true -or $health.service -ne 'pipeline-runner' -or
      $health.studio_write_source -ne 'supabase' -or
      $health.supabase_pipeline_writes -ne $true -or
      $health.workload_governor_enabled -ne $true -or
      $health.recovery_read_only -ne $false -or
      (-not $NormalClosedRecovery -and $health.i1_durable_jobs -ne $false) -or
      $health.airtable_activity.any_activity -ne $false -or
      $health.studio_native_gallery_companion_2873 -ne $true) {
    throw 'incident2853_runner_health_gate_failed'
  }

  # Wait for existing crop/producer work to leave every shared slot. Nothing is
  # submitted while the protected runner is active or while its circuit is open.
  $work = $null
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    $work = Get-Workload
    $resourceTotal = 0
    foreach ($property in $work.active_resource_slots.PSObject.Properties) {
      $resourceTotal += [int]$property.Value
    }
    if ($work.enabled -eq $true -and $work.max_jobs -eq 1 -and
        $work.active_jobs -eq 0 -and $work.queued_jobs -eq 0 -and
        $work.paused_jobs -eq 0 -and $work.active_worker_heavy -eq 0 -and
        $resourceTotal -eq 0 -and $work.database_circuit_phase -ne 'open' -and
        $work.admission_paused -eq $false) {
      break
    }
    if ($attempt -eq 60) { throw 'incident2853_governor_not_idle' }
    Start-Sleep -Seconds 5
  }

  if ($work.database_circuit_phase -eq 'closed' -and -not $NormalClosedRecovery) {
    Write-Output 'incident2853_probe=NOT_NEEDED_CIRCUIT_ALREADY_CLOSED'
    exit 0
  }
  if ($NormalClosedRecovery -and $work.database_circuit_phase -ne 'closed') {
    throw 'incident2853_normal_resume_requires_closed_circuit'
  }
  if (-not $NormalClosedRecovery -and $work.database_circuit_phase -ne 'half_open') {
    throw 'incident2853_unexpected_circuit_phase'
  }

  $beforeRequest = Get-RequestRow
  $beforeOutputs = @(Get-OutputRows)
  Assert-Baseline $beforeRequest $beforeOutputs
  if ($NormalClosedRecovery) {
    Write-Output 'incident2853_probe_preflight=PASS_CAP1_CLOSED_EXACT_BASELINE'
  } else {
    Write-Output 'incident2853_probe_preflight=PASS_CAP1_HALF_OPEN_EXACT_BASELINE'
  }

  # Exactly one governed submission. Never retry an accepted or ambiguous POST.
  $body = @{production_request_record_id = $requestId; resume = $true} |
    ConvertTo-Json -Compress
  $answer = Invoke-RestMethod -Method POST `
    -Uri 'http://127.0.0.1:3350/jobs/studio-produce/resume' `
    -Headers $script:runnerHeaders -ContentType 'application/json' `
    -Body $body -TimeoutSec 60
  if ($answer.ok -ne $true -or $answer.accepted -ne $true -or
      $answer.production_request_record_id -ne $requestId -or
      $answer.queued -ne $true) {
    throw 'incident2853_exact_probe_not_accepted'
  }
  Write-Output 'incident2853_probe_submit=ACCEPTED_ONCE'

  $settled = $false
  for ($attempt = 1; $attempt -le 150; $attempt++) {
    Start-Sleep -Seconds 5
    $work = Get-Workload
    if ($work.max_jobs -ne 1 -or $work.active_jobs -gt 1 -or
        $work.active_worker_heavy -gt 0 -or $work.database_circuit_phase -eq 'open') {
      throw 'incident2853_post_submit_safety_gate_failed'
    }
    $requestRow = Get-RequestRow
    $step = [string]$requestRow.production_job.step
    if ($step -in @('blocked', 'escalated')) {
      throw "incident2853_probe_terminal_failure_$step"
    }
    if ($work.database_circuit_phase -eq 'closed' -and
        $work.active_jobs -eq 0 -and $work.queued_jobs -eq 0 -and
        $work.paused_jobs -eq 0 -and $step -eq 'done') {
      $settled = $true
      break
    }
  }
  if (-not $settled) { throw 'incident2853_probe_settle_timeout_no_retry' }

  $afterRequest = Get-RequestRow
  $afterOutputs = @(Get-OutputRows)
  Assert-Recovered $afterRequest $afterOutputs
  if ($NormalClosedRecovery) {
    Write-Output 'incident2853_probe=PASS_NORMAL_RECOVERY_CIRCUIT_CLOSED'
  } else {
    Write-Output 'incident2853_probe=PASS_CANONICAL_PROGRESS_CIRCUIT_CLOSED'
  }
  Write-Output 'incident2853_bryant_factory_packages=PASS_10853_10854_HUMAN_REVIEW_REQUIRED'
  Write-Output 'incident2853_safety=CAP1_ZERO_APPROVAL_SCHEDULE_PUBLISH'
}
finally {
  Remove-Variable secret, sbKey, runnerHeaders, sbHeaders -Scope Script -ErrorAction SilentlyContinue
}
