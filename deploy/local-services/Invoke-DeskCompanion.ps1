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
$VerifyPs1 = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services\verify-chicagoshining-local-services.ps1'
$HiddenStart = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'
$DeployScript = Join-Path $RepoRoot 'deploy\local-services\Deploy-SMService.ps1'
$CapsPath = Join-Path $PipelineRoot 'Deployment Logs\Local Services\desk-caps.json'

$HealthTargets = @(
    @{ Id = 'pipeline-runner'; Url = 'https://pipeline.chicagoshining.com/health'; Service = 'pipeline-runner' }
    @{ Id = 'remotion-renderer'; Url = 'https://render.chicagoshining.com/health'; Service = 'remotion-renderer' }
    @{ Id = 'frame-extractor'; Url = 'https://frames.chicagoshining.com/health'; Service = 'frame-extractor' }
    @{ Id = 'video-compressor'; Url = 'https://compress.chicagoshining.com/health'; Service = $null }
    @{ Id = 'timing-engine'; Url = 'https://timing.chicagoshining.com/health'; Service = 'timing-engine'; WarnOnly = $true }
    @{ Id = 'watermark'; Url = 'https://watermark.chicagoshining.com/health'; Service = 'watermark' }
    @{ Id = 'voiceover-normalizer'; Url = 'https://voiceover.chicagoshining.com/health'; Service = 'voiceover-normalizer' }
    @{ Id = 'youtube-uploader'; Url = 'https://youtube-upload.chicagoshining.com/health'; Service = 'youtube-uploader' }
    @{ Id = 'youtube-uploader-la'; Url = 'https://youtube-upload-la.chicagoshining.com/health'; Service = 'youtube-uploader-la' }
    @{ Id = 'youtube-uploader-nyc'; Url = 'https://youtube-upload-nyc.chicagoshining.com/health'; Service = 'youtube-uploader-nyc' }
    @{ Id = 'youtube-uploader-miami'; Url = 'https://youtube-upload-miami.chicagoshining.com/health'; Service = 'youtube-uploader-miami' }
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
        $version = $null
        if ($ok -and $resp.Content) {
            try {
                $parsed = $resp.Content | ConvertFrom-Json
                if ($parsed.version) { $version = [string]$parsed.version }
            } catch {}
        }
        return @{ Ok = $ok; Status = [int]$resp.StatusCode; Error = $null; Version = $version }
    } catch {
        return @{ Ok = $false; Status = 0; Error = $_.Exception.Message; Version = $null }
    }
}

function Test-YoutubeUploaderNeedsEngageDeploy([string]$ServiceName, $Probe) {
    if ($ServiceName -notmatch '^youtube-uploader') { return $false }
    if (-not $Probe -or -not $Probe.ok) { return $false }
    $version = [string]$Probe.version
    if (-not $version) { return $true }
    return ($version -notmatch 'engagement')
}

function Get-GitState {
    Push-Location $RepoRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        $dirty = [bool](git status --porcelain)
        cmd.exe /c "git fetch origin main >nul 2>&1" | Out-Null
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
        noop_commits = @{}
        max_auto_prs_per_day = 3
        max_auto_merges_per_day = 1
        max_restarts_per_service_per_day = 2
    }
    if (Test-Path -LiteralPath $CapsPath) {
        try {
            $parsed = Get-Content -LiteralPath $CapsPath -Raw | ConvertFrom-Json
            if ($parsed.noop_commits) {
                $parsed.noop_commits.PSObject.Properties | ForEach-Object { $caps.noop_commits[$_.Name] = [string]$_.Value }
            }
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

$RuntimePaths = @{
    'frame-extractor' = 'Services\Frame_Extractor'
    'remotion-renderer' = 'Services\Remotion_Renderer'
    'watermark' = 'Services\Watermark'
    'voiceover-normalizer' = 'Services\voiceover-normalizer\service'
    'youtube-uploader' = 'Services\youtube-uploader\service'
    'youtube-uploader-la' = 'Services\youtube-uploader-la\service'
    'youtube-uploader-nyc' = 'Services\youtube-uploader-nyc\service'
    'youtube-uploader-miami' = 'Services\youtube-uploader-miami\service'
    'pipeline-runner' = 'Services\pipeline-runner\service'
    'timing-engine' = 'Services\timing-engine\service'
}

function Get-LiveDeployedCommit([string]$ServiceName) {
    $rel = $RuntimePaths[$ServiceName]
    if (-not $rel) { return $null }
    $manifest = Join-Path $PipelineRoot ($rel + '\.smv2-deployment.json')
    if (-not (Test-Path -LiteralPath $manifest)) { return $null }
    try {
        $parsed = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
        return [string]$parsed.deployed_commit
    } catch {
        return $null
    }
}

function Test-LiveBehindOriginMain([string]$LiveCommit, [string]$OriginMain) {
    if (-not $LiveCommit -or -not $OriginMain) { return $false }
    if ($LiveCommit -eq $OriginMain) { return $false }
    Push-Location $RepoRoot
    try {
        cmd.exe /c "git merge-base --is-ancestor $LiveCommit $OriginMain >nul 2>&1" | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        Pop-Location
    }
}

if ($DeskMode -eq '') {
    if ($env:STUDIO_DESK_MODE) { $DeskMode = $env:STUDIO_DESK_MODE }
    else { $DeskMode = 'observe' }
}
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
        version = $probe.Version
        warnOnly = [bool]$target.WarnOnly
    }
}

$down = @($probes | Where-Object { -not $_.ok -and -not $_.warnOnly })
$staleYoutube = @($probes | Where-Object { Test-YoutubeUploaderNeedsEngageDeploy $_.service $_ })
Write-Host "Desk companion mode=$DeskMode dirty=$($git.Dirty) behind=$($git.Behind) down=$($down.Count) staleYoutube=$($staleYoutube.Count)"
$probes | ForEach-Object {
    $state = if ($_.ok) { 'ok' } elseif ($_.warnOnly) { 'WARN' } else { 'DOWN' }
    $ver = if ($_.version) { " v=$($_.version)" } else { '' }
    Write-Host ("  {0,-22} {1}{2}" -f $_.id, $state, $ver)
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

$didStart = $false
if ($down.Count -eq 0) {
    Write-Host 'All public health probes passed.'
} elseif ($RestartDown -and (Test-Path -LiteralPath $HiddenStart) -and (Test-Path -LiteralPath $VerifyPs1)) {
    if ($git.Dirty) {
        Write-Host 'Git checkout is dirty. Hidden START/VERIFY still allowed.'
    }
    Write-Host 'Public health failed. Starting down services hidden (no extra console windows).'
    foreach ($row in $down) {
        $svc = $row.service
        if (-not $svc) { $svc = $row.id }
        Write-Host "Hidden start $svc"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HiddenStart -Service $svc -StopFirst
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARN hidden start failed for $svc (exit $LASTEXITCODE)"
        }
    }
    Start-Sleep -Seconds 20
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $VerifyPs1
    $didStart = $true
}

if (-not $DeployDown) {
    if ($git.Dirty) { Write-Host 'Git checkout is dirty. Companion will not SYNC or DEPLOY.' }
    exit 0
}

if ($didStart) {
    Write-Host 'Skipped origin/main DEPLOY this tick because START already relaunched live Services.'
    exit 0
}

if ($git.Dirty) {
    Write-Host 'Git checkout is dirty. DEPLOY still uses an origin/main worktree. Will not reset --hard.'
}

$behind = New-Object System.Collections.Generic.List[string]
foreach ($svc in @('frame-extractor','remotion-renderer','watermark','voiceover-normalizer','youtube-uploader','youtube-uploader-la','youtube-uploader-nyc','youtube-uploader-miami','pipeline-runner','timing-engine')) {
    $live = Get-LiveDeployedCommit $svc
    if (Test-LiveBehindOriginMain $live $git.OriginMain) {
        Write-Host ("  {0} live={1} origin/main={2} (behind)" -f $svc, $live.Substring(0, [Math]::Min(12, $live.Length)), $git.OriginMain.Substring(0, 12))
        $behind.Add($svc)
    }
}
foreach ($row in $staleYoutube) {
    $svc = [string]$row.service
    if (-not $svc) { continue }
    if (-not $behind.Contains($svc)) {
        Write-Host ("  {0} health.version={1} lacks engagement build (force DEPLOY)" -f $svc, $row.version)
        $behind.Add($svc)
    }
}

if ($behind.Count -eq 0) {
    Write-Host 'No live service stamp is behind origin/main. No enhancement DEPLOY.'
    exit 0
}

$deployed = 0
foreach ($svc in $behind) {
    $used = 0
    if ($caps.restarts.ContainsKey($svc)) { $used = [int]$caps.restarts[$svc] }
    if ($used -ge $caps.max_restarts_per_service_per_day) {
        Write-Host "SKIP ${svc}: daily restart cap."
        continue
    }
    if ($caps.noop_commits.ContainsKey($svc) -and $caps.noop_commits[$svc] -eq $git.OriginMain) {
        Write-Host "SKIP ${svc}: already planned against this origin/main with no file changes."
        continue
    }
    Write-Host "PLAN $svc from origin/main (live stamp behind merged main)"
    $planLines = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DeployScript -Service $svc -PlanOnly 2>&1
    $planCode = $LASTEXITCODE
    $planOut = $planLines | Out-String
    Write-Host $planOut
    if ($planCode -ne 0) { throw "PLAN failed for $svc" }
    if ($planOut -match 'Files:\s+0 added,\s+0 changed,\s+0 removed') {
        $staleRow = @($staleYoutube | Where-Object { $_.service -eq $svc }) | Select-Object -First 1
        if ($staleRow -and (Test-Path -LiteralPath $HiddenStart)) {
            Write-Host "STALE ${svc}: files match origin/main but health.version lacks engagement. Hidden restart only."
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HiddenStart -Service $svc -StopFirst
            if ($LASTEXITCODE -ne 0) {
                Write-Host "WARN hidden restart failed for $svc (exit $LASTEXITCODE)"
            } else {
                $caps.restarts[$svc] = $used + 1
                $deployed++
            }
            Save-DeskCaps $caps
            continue
        }
        Write-Host "SKIP ${svc}: origin/main has no file changes vs live. Not restarting."
        $caps.noop_commits[$svc] = $git.OriginMain
        Save-DeskCaps $caps
        continue
    }
    if ($deployed -ge 1) {
        Write-Host 'One service per companion run. Remaining file-changing deploys left for the next tick.'
        break
    }
    Write-Host "DEPLOY $svc from origin/main"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DeployScript -Service $svc -Yes
    if ($LASTEXITCODE -ne 0) { throw "DEPLOY failed for $svc" }
    $caps.restarts[$svc] = $used + 1
    $deployed++
}
Save-DeskCaps $caps

exit 0
