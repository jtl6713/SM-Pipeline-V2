<#
.SYNOPSIS
  Local companion for the Chicago Shining autonomous service desk.

.DESCRIPTION
  Probes public /health URLs, reports git drift, and (when Desk_Mode allows)
  restarts or deploys ONE down service using the existing START/VERIFY/DEPLOY
  framework. Never resets git. Never merges unless -AutoMerge is passed AND
  mode is automerge AND paths are allowlisted (Phase 4; default off).
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$DeskMode = '',
    [switch]$RestartDown,
    [switch]$DeployDown,
    [switch]$AutoMerge,
    [string[]]$ChangedPaths = @()
)

$ErrorActionPreference = 'Stop'
$VerifyBat = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\verify-chicagoshining-local-services.bat'
$StartBat = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\start-chicagoshining-local-services.bat'
$DeployScript = Join-Path $RepoRoot 'deploy\local-services\Deploy-SMService.ps1'
$CapsPath = Join-Path $PipelineRoot 'Deployment Logs\Local Services\desk-caps.json'

$HealthTargets = @(
    @{ Id = 'pipeline-runner'; Url = 'https://pipeline.chicagoshining.com/health'; Service = 'pipeline-runner' }
    @{ Id = 'remotion-renderer'; Url = 'https://render.chicagoshining.com/health'; Service = 'remotion-renderer' }
    @{ Id = 'frame-extractor'; Url = 'https://frames.chicagoshining.com/health'; Service = 'frame-extractor' }
    @{ Id = 'video-compressor'; Url = 'https://compress.chicagoshining.com/health'; Service = $null }
    @{ Id = 'timing-engine'; Url = 'https://timing.chicagoshining.com/health'; Service = 'timing-engine' }
    @{ Id = 'watermark'; Url = 'https://watermark.chicagoshining.com/health'; Service = 'watermark' }
    @{ Id = 'voiceover-normalizer'; Url = 'https://voiceover.chicagoshining.com/health'; Service = 'voiceover-normalizer' }
    @{ Id = 'youtube-uploader'; Url = 'https://youtube-upload.chicagoshining.com/health'; Service = 'youtube-uploader' }
)

function Get-DeskRank([string]$Mode) {
    switch ($Mode.ToLowerInvariant()) {
        'off' { 0 }
        'observe' { 1 }
        'infra' { 2 }
        'patch' { 3 }
        'automerge' { 4 }
        default { 1 }
    }
}

function Test-PublicHealth([string]$Url) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 8
        $ok = [int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 300
        return @{ Ok = $ok; Status = [int]$resp.StatusCode; Error = $null }
    } catch {
        return @{ Ok = $false; Status = 0; Error = $_.Exception.Message }
    }
}

function Get-GitState {
    Push-Location $RepoRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        $dirty = [bool](git status --porcelain)
        git fetch origin main 2>$null | Out-Null
        $local = (git rev-parse HEAD).Trim()
        $remote = (git rev-parse origin/main).Trim()
        return @{
            Branch = $branch
            Dirty = $dirty
            Behind = ($local -ne $remote)
            Head = $local
            OriginMain = $remote
        }
    } finally {
        Pop-Location
    }
}

function Get-DeskCaps {
    $today = Get-Date -Format 'yyyy-MM-dd'
    $caps = @{
        date = $today
        auto_prs = 0
        auto_merges = 0
        restarts = @{}
        max_auto_prs_per_day = 3
        max_auto_merges_per_day = 1
        max_restarts_per_service_per_day = 2
    }
    if (Test-Path -LiteralPath $CapsPath) {
        try {
            $parsed = Get-Content -LiteralPath $CapsPath -Raw | ConvertFrom-Json
            if ($parsed.date -eq $today) {
                $caps.auto_prs = [int]$parsed.auto_prs
                $caps.auto_merges = [int]$parsed.auto_merges
                if ($parsed.restarts) {
                    $caps.restarts = @{}
                    $parsed.restarts.PSObject.Properties | ForEach-Object { $caps.restarts[$_.Name] = [int]$_.Value }
                }
            }
        } catch {}
    }
    return $caps
}

function Save-DeskCaps($Caps) {
    $dir = Split-Path -Parent $CapsPath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    ($Caps | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $CapsPath -Encoding UTF8
}

function Test-AllowlistedPath([string]$Path) {
    $rel = ($Path -replace '\\', '/').TrimStart('./')
    return $rel -match '^apps/studio-api/(worker\.js|desk-inventory\.mjs)$' `
        -or $rel -match '^services/pipeline-runner/studio_produce/' `
        -or $rel -match '^services/pipeline-runner/item4/'
}

if ($DeskMode -eq '') { $DeskMode = 'observe' }
$rank = Get-DeskRank $DeskMode
$git = Get-GitState
$caps = Get-DeskCaps
$probes = @()
foreach ($target in $HealthTargets) {
    $probe = Test-PublicHealth $target.Url
    $probes += [pscustomobject]@{
        id = $target.Id
        url = $target.Url
        service = $target.Service
        ok = [bool]$probe.Ok
        status = $probe.Status
        error = $probe.Error
    }
}

$down = @($probes | Where-Object { -not $_.ok })
Write-Host "Desk companion mode=$DeskMode dirty=$($git.Dirty) behind=$($git.Behind) down=$($down.Count)"
$probes | ForEach-Object {
    $state = if ($_.ok) { 'ok' } else { 'DOWN' }
    Write-Host ("  {0,-22} {1}" -f $_.id, $state)
}

if ($rank -lt 1) {
    Write-Host 'Mode off: inventory-only. No tickets, restarts, or deploys.'
    exit 0
}

if ($AutoMerge) {
    if ($rank -lt 4) {
        Write-Host 'REFUSE auto-merge: STUDIO_DESK_MODE is not automerge.'
        exit 2
    }
    if ($git.Dirty) {
        Write-Host 'REFUSE auto-merge: dirty checkout.'
        exit 2
    }
    if ($caps.auto_merges -ge $caps.max_auto_merges_per_day) {
        Write-Host 'REFUSE auto-merge: daily merge cap.'
        exit 2
    }
    $bad = @($ChangedPaths | Where-Object { $_ -and -not (Test-AllowlistedPath $_) })
    if ($ChangedPaths.Count -eq 0 -or $bad.Count -gt 0) {
        Write-Host 'REFUSE auto-merge: path not allowlisted or empty.'
        if ($bad) { $bad | ForEach-Object { Write-Host "  $_" } }
        exit 2
    }
    Write-Host 'Auto-merge gate passed (caller must still require CI green and gh pr merge).'
}

if (-not $RestartDown -and -not $DeployDown) {
    if ($git.Dirty) { Write-Host 'Git checkout is dirty. Companion will not SYNC or DEPLOY.' }
    if ($git.Behind) { Write-Host 'Checkout is behind origin/main. Run SYNC Local Git Checkout.bat when the tree is clean.' }
    exit 0
}

if ($rank -lt 2) {
    Write-Host 'Mode below infra: not restarting or deploying.'
    exit 0
}

if ($git.Dirty) {
    Write-Host 'STOP: dirty Git checkout. Will not SYNC, restart-deploy, or reset --hard.'
    exit 3
}

if ($down.Count -eq 0) {
    Write-Host 'All public health probes passed.'
    exit 0
}

if ($RestartDown -and (Test-Path -LiteralPath $StartBat) -and (Test-Path -LiteralPath $VerifyBat)) {
    Write-Host 'Public health failed. Running START then VERIFY (existing bats).'
    & cmd.exe /c "`"$StartBat`""
    & cmd.exe /c "`"$VerifyBat`""
}

if ($DeployDown) {
    $deployed = 0
    foreach ($row in $down) {
        if (-not $row.service) {
            Write-Host "SKIP deploy for $($row.id): not in Deploy-SMService selector (use dedicated compressor install)."
            continue
        }
        $used = 0
        if ($caps.restarts.ContainsKey($row.service)) { $used = [int]$caps.restarts[$row.service] }
        if ($used -ge $caps.max_restarts_per_service_per_day) {
            Write-Host "SKIP $($row.service): daily restart cap."
            continue
        }
        if ($deployed -ge 1) {
            Write-Host 'One service per companion run. Remaining downs left for the next tick.'
            break
        }
        Write-Host "PLAN+DEPLOY $($row.service) from origin/main"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DeployScript -Service $row.service -PlanOnly
        if ($LASTEXITCODE -ne 0) { throw "PLAN failed for $($row.service)" }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DeployScript -Service $row.service
        if ($LASTEXITCODE -ne 0) { throw "DEPLOY failed for $($row.service)" }
        $caps.restarts[$row.service] = $used + 1
        $deployed++
    }
    Save-DeskCaps $caps
}

exit 0
