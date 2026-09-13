<#
.SYNOPSIS
  Quality Agent hourly keep-alive: stock START/VERIFY when /health is down.

.DESCRIPTION
  Logs to Deployment Logs\Local Services\hourly-companion-YYYYMMDD.log.
  Does not STOP ALL. Calls the stock START bat only when a required public
  /health probe is down, then VERIFY. Companion -RestartDown is the
  per-service safety net. PLAN+DEPLOY one service only when Desk mode is
  infra+ and the Git checkout is clean. Never git reset --hard.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$LogDir = 'D:\Content Creation\ChicagoShining Pipeline\Deployment Logs\Local Services',
    [string]$DeskMode = 'infra'
)

$ErrorActionPreference = 'Continue'
$Companion = Join-Path $RepoRoot 'deploy\local-services\Invoke-DeskCompanion.ps1'
$PlaybookDir = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$StartBat = Join-Path $PlaybookDir 'start-chicagoshining-local-services.bat'
$VerifyBat = Join-Path $PlaybookDir 'verify-chicagoshining-local-services.bat'

$HealthTargets = @(
    'https://pipeline.chicagoshining.com/health'
    'https://render.chicagoshining.com/health'
    'https://frames.chicagoshining.com/health'
    'https://compress.chicagoshining.com/health'
    'https://watermark.chicagoshining.com/health'
    'https://voiceover.chicagoshining.com/health'
    'https://youtube-upload.chicagoshining.com/health'
    'https://youtube-upload-nyc.chicagoshining.com/health'
)

function Test-PublicHealth([string]$Url) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 8
        return ([int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 300)
    } catch {
        return $false
    }
}

function Invoke-StockBat([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Host "WARN missing stock bat: $Path"
        return 1
    }
    # <nul skips pause if the stock bat still has one.
    cmd.exe /c "call `"$Path`" < nul"
    return $LASTEXITCODE
}

function Get-HourlyGitState {
    Push-Location $RepoRoot
    try {
        $dirty = [bool](git status --porcelain)
        cmd.exe /c "git fetch origin main >nul 2>&1" | Out-Null
        $local = (git rev-parse HEAD).Trim()
        $remote = (git rev-parse origin/main).Trim()
        return @{
            Dirty = $dirty
            Behind = ($local -ne $remote)
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$log = Join-Path $LogDir ('hourly-companion-' + (Get-Date -Format 'yyyyMMdd') + '.log')

Start-Transcript -Path $log -Append | Out-Null
$exitCode = 0
try {
    Write-Host ("Quality Agent hourly {0} mode={1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $DeskMode)
    if (-not (Test-Path -LiteralPath $Companion)) {
        throw "Missing companion: $Companion"
    }

    $down = @()
    foreach ($url in $HealthTargets) {
        $ok = Test-PublicHealth $url
        $state = if ($ok) { 'ok' } else { 'DOWN' }
        Write-Host ("  {0,-42} {1}" -f $url, $state)
        if (-not $ok) { $down += $url }
    }

    if ($down.Count -gt 0) {
        Write-Host 'Public /health down. Calling stock START then VERIFY (no STOP ALL).'
        $startCode = Invoke-StockBat $StartBat
        if ($startCode -ne 0) {
            Write-Host "WARN stock START exit=$startCode"
        }
        $verifyCode = Invoke-StockBat $VerifyBat
        if ($verifyCode -ne 0) {
            Write-Host "WARN stock VERIFY exit=$verifyCode"
        }
    } else {
        Write-Host 'All required public /health probes passed. Not calling stock START.'
    }

    $git = Get-HourlyGitState
    Write-Host ("Git dirty=$($git.Dirty) behind=$($git.Behind)")

    $companionArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $Companion,
        '-RestartDown',
        '-DeskMode', $DeskMode
    )
    $mode = "$DeskMode".ToLowerInvariant()
    $infraPlus = @('infra', 'patch', 'automerge') -contains $mode
    if ($git.Dirty) {
        Write-Host 'Dirty checkout: log and skip SYNC/DEPLOY. START/VERIFY still allowed.'
    } elseif (-not $infraPlus) {
        Write-Host 'Desk mode below infra: skip DEPLOY.'
    } else {
        if ($git.Behind) {
            Write-Host 'Checkout clean and behind origin/main. Fast-forward pull (not SYNC-Git-Main.bat; that file pauses).'
            Push-Location $RepoRoot
            try {
                git checkout main
                git pull --ff-only origin main
                if ($LASTEXITCODE -ne 0) {
                    Write-Host 'WARN git pull --ff-only failed. Skipping DEPLOY this hour.'
                    $infraPlus = $false
                }
            } finally {
                Pop-Location
            }
        }
        if ($infraPlus) {
            $companionArgs += '-DeployDown'
        }
    }

    & powershell.exe @companionArgs
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
} catch {
    Write-Host ("Hourly companion failed: " + $_.Exception.Message)
    $exitCode = 1
} finally {
    Write-Host ("Quality Agent hourly exit={0}" -f $exitCode)
    Stop-Transcript | Out-Null
}
exit $exitCode
