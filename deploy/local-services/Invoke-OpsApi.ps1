<#
.SYNOPSIS
  Callable CLI + HTTP client for the Chicago Shining Ops Dashboard API.

.DESCRIPTION
  Use this from ChatGPT Code Interpreter, Cursor, or any automation on Joseph's PC.
  Default: HTTP to http://127.0.0.1:3361. Pass -Direct to run Invoke-OpsDashboardAction.ps1
  without the dashboard process (run actions only).

.EXAMPLE
  .\Invoke-OpsApi.ps1 status

.EXAMPLE
  .\Invoke-OpsApi.ps1 run -Action deploy-pipeline-runner -Confirm -Wait

.EXAMPLE
  .\Invoke-OpsApi.ps1 run -Action plan -Service pipeline-runner
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('health', 'catalog', 'status', 'run', 'job', 'unlock')]
    [string]$Command,

    [ValidateSet(
        'start-all', 'stop-all', 'verify', 'desk-probe', 'desk-restart', 'close-orphans',
        'start-one', 'restart-one', 'stop-one', 'sync', 'plan', 'deploy',
        'deploy-pipeline-runner', 'rollback'
    )]
    [string]$Action = '',

    [string]$Service = '',

    [switch]$Confirm,

    [string]$JobId = '',

    [switch]$Wait,

    [int]$PollSeconds = 2,

    [int]$TimeoutSeconds = 1800,

    [string]$BaseUrl = 'http://127.0.0.1:3361',

    [string]$Token = '',

    [switch]$Direct,

    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',

    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2'
)

$ErrorActionPreference = 'Stop'

function Read-DashboardToken {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) { return $Explicit.Trim() }
    if ($env:OPS_DASHBOARD_TOKEN) { return $env:OPS_DASHBOARD_TOKEN.Trim() }
    if ($env:DASHBOARD_TOKEN) { return $env:DASHBOARD_TOKEN.Trim() }
    $envPath = Join-Path $PipelineRoot 'Services\ops-dashboard\.env'
    if (Test-Path -LiteralPath $envPath -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $envPath) {
            if ($line -match '^DASHBOARD_TOKEN=(.+)$') { return $Matches[1].Trim() }
        }
    }
    return ''
}

function Invoke-OpsHttp {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    $token = Read-DashboardToken -Explicit $Token
    $uri = ($BaseUrl.TrimEnd('/') + $Path)
    $headers = @{ Accept = 'application/json' }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    if ($Body -ne $null) {
        $json = $Body | ConvertTo-Json -Compress -Depth 5
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
}

function Invoke-OpsDirectRun {
    param([string]$ActionName, [string]$ServiceName, [bool]$NeedsConfirm)
    $runner = Join-Path $RepoRoot 'deploy\local-services\Invoke-OpsDashboardAction.ps1'
    if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
        throw "Missing $runner"
    }
    if ($NeedsConfirm -and -not $Confirm) {
        throw "Action $ActionName requires -Confirm when using -Direct."
    }
    $args = @('-Action', $ActionName, '-PipelineRoot', $PipelineRoot, '-RepoRoot', $RepoRoot)
    if ($ServiceName) { $args += @('-Service', $ServiceName) }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner @args
    $code = $LASTEXITCODE
    return [PSCustomObject]@{
        ok = ($code -eq 0)
        exitCode = $code
        mode = 'direct'
        action = $ActionName
        service = $ServiceName
    }
}

function Wait-OpsJob {
    param([string]$Id, [int]$TimeoutSec, [int]$IntervalSec)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        $job = Invoke-OpsHttp -Method GET -Path "/api/jobs/$Id"
        if ($job.job.status -ne 'running') { return $job.job }
        Start-Sleep -Seconds $IntervalSec
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for job $Id after ${TimeoutSec}s"
}

$needsConfirm = @(
    'stop-all', 'desk-restart', 'restart-one', 'stop-one', 'sync', 'deploy',
    'deploy-pipeline-runner', 'rollback'
)

switch ($Command) {
    'health' {
        if ($Direct) {
            try {
                $r = Invoke-OpsHttp -Method GET -Path '/health'
            } catch {
                [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 5
                exit 1
            }
        } else {
            $r = Invoke-OpsHttp -Method GET -Path '/health'
        }
        $r | ConvertTo-Json -Depth 8
        exit 0
    }
    'catalog' {
        (Invoke-OpsHttp -Method GET -Path '/api/catalog') | ConvertTo-Json -Depth 12
        exit 0
    }
    'status' {
        (Invoke-OpsHttp -Method GET -Path '/api/status') | ConvertTo-Json -Depth 12
        exit 0
    }
    'unlock' {
        (Invoke-OpsHttp -Method POST -Path '/api/jobs/unlock') | ConvertTo-Json -Depth 8
        exit 0
    }
    'job' {
        if ([string]::IsNullOrWhiteSpace($JobId)) { throw 'job command requires -JobId' }
        $result = Invoke-OpsHttp -Method GET -Path "/api/jobs/$JobId"
        $result | ConvertTo-Json -Depth 12
        if ($result.job.status -eq 'failed') { exit 1 }
        exit 0
    }
    'run' {
        if ([string]::IsNullOrWhiteSpace($Action)) { throw 'run command requires -Action' }
        if ($Direct) {
            $out = Invoke-OpsDirectRun -ActionName $Action -ServiceName $Service -NeedsConfirm:($needsConfirm -contains $Action)
            $out | ConvertTo-Json -Depth 8
            if (-not $out.ok) { exit 1 }
            exit 0
        }
        if ($needsConfirm -contains $Action -and -not $Confirm) {
            throw "Action $Action requires -Confirm."
        }
        $body = @{ action = $Action }
        if ($Service) { $body.service = $Service }
        if ($Confirm) { $body.confirm = $true }
        $started = Invoke-OpsHttp -Method POST -Path '/api/run' -Body $body
        if (-not $Wait) {
            $started | ConvertTo-Json -Depth 12
            exit 0
        }
        $finished = Wait-OpsJob -Id $started.job.id -TimeoutSec $TimeoutSeconds -IntervalSec $PollSeconds
        [PSCustomObject]@{ ok = ($finished.status -eq 'ok'); job = $finished } | ConvertTo-Json -Depth 12
        if ($finished.status -ne 'ok') { exit 1 }
        exit 0
    }
}

throw "Unhandled command: $Command"
