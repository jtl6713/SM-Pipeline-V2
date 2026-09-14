<#
.SYNOPSIS
  Allowlisted operator actions for the Ops Dashboard. Do not add free-form commands.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
        'start-all',
        'stop-all',
        'verify',
        'desk-probe',
        'desk-restart',
        'close-orphans',
        'start-one',
        'stop-one',
        'sync',
        'plan',
        'deploy',
        'deploy-pipeline-runner',
        'rollback'
    )]
    [string]$Action,

    [string]$Service = '',

    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',

    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2',

    [string]$TranscriptPath = ''
)

$ErrorActionPreference = 'Stop'

$Deployable = @(
    'frame-extractor',
    'remotion-renderer',
    'watermark',
    'voiceover-normalizer',
    'youtube-uploader',
    'youtube-uploader-nyc',
    'youtube-uploader-miami',
    'pipeline-runner',
    'timing-engine',
    'ops-dashboard'
)

$Startable = $Deployable + @('video-compressor', 'task-organizer')

$Ports = @{
    'frame-extractor' = 3334
    'remotion-renderer' = 3333
    'watermark' = 3011
    'voiceover-normalizer' = 3012
    'youtube-uploader' = 3340
    'youtube-uploader-nyc' = 3342
    'youtube-uploader-miami' = 3343
    'pipeline-runner' = 3350
    'video-compressor' = 3335
    'timing-engine' = 3336
    'task-organizer' = 3360
    'ops-dashboard' = 3361
}

function Assert-Service([string[]]$Allowed) {
    if ([string]::IsNullOrWhiteSpace($Service)) {
        throw "Action $Action requires -Service."
    }
    if ($Allowed -notcontains $Service) {
        throw "Service '$Service' is not allowed for $Action."
    }
}

function Invoke-Ps1([string]$Path, [string[]]$NativeArgs) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing script: $Path"
    }
    # Child scripts use Write-Host. A redirected powershell.exe hides that unless we transcript.
    $childLog = $TranscriptPath
    if ([string]::IsNullOrWhiteSpace($childLog)) {
        $childLog = Join-Path $env:TEMP ('ops-dash-child-' + [guid]::NewGuid().ToString('N') + '.log')
    }
    if ($script:OuterTranscriptActive) {
        Stop-Transcript | Out-Null
        $script:OuterTranscriptActive = $false
    }
    $argLine = ''
    if ($NativeArgs -and $NativeArgs.Count -gt 0) {
        $argLine = (($NativeArgs | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ' ')
    }
    $pathLit = $Path.Replace("'", "''")
    $logLit = $childLog.Replace("'", "''")
    $cmd = @"
`$ErrorActionPreference = 'Continue'
Start-Transcript -Path '$logLit' -Append -Force | Out-Null
`$code = 0
try {
    & '$pathLit' $argLine
    if (`$null -ne `$LASTEXITCODE) { `$code = [int]`$LASTEXITCODE }
} catch {
    Write-Host `$_.Exception.Message
    `$code = 1
} finally {
    Stop-Transcript | Out-Null
}
exit `$code
"@
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd
    $exitCode = [int]$LASTEXITCODE
    if ([string]::IsNullOrWhiteSpace($TranscriptPath) -and (Test-Path -LiteralPath $childLog)) {
        [Console]::Out.Write((Get-Content -LiteralPath $childLog -Raw))
    }
    if (-not [string]::IsNullOrWhiteSpace($TranscriptPath)) {
        Start-Transcript -Path $TranscriptPath -Append -Force | Out-Null
        $script:OuterTranscriptActive = $true
    }
    return $exitCode
}

$Hidden = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'
$HiddenAll = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHiddenAll.ps1'
$Deployer = Join-Path $RepoRoot 'deploy\local-services\Deploy-SMService.ps1'
$Companion = Join-Path $RepoRoot 'deploy\local-services\Invoke-DeskCompanion.ps1'
$Orphans = Join-Path $RepoRoot 'deploy\local-services\Close-OrphanChicagoShiningConsoles.ps1'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$StopHelper = Join-Path $ToolsRoot '_startup_helpers\99-stop-chicagoshining-local-services.ps1'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
$PortGuard = Join-Path $ToolsRoot '_startup_helpers\00-port-guard.ps1'

$script:OuterTranscriptActive = $false
if (-not [string]::IsNullOrWhiteSpace($TranscriptPath)) {
    $dir = Split-Path -Parent $TranscriptPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    Start-Transcript -Path $TranscriptPath -Force | Out-Null
    $script:OuterTranscriptActive = $true
}

$code = 0
try {
switch ($Action) {
    'start-all' {
        $code = Invoke-Ps1 $HiddenAll @()
    }
    'stop-all' {
        $code = Invoke-Ps1 $StopHelper @()
    }
    'verify' {
        $code = Invoke-Ps1 $VerifyPs1 @()
    }
    'desk-probe' {
        $code = Invoke-Ps1 $Companion @()
    }
    'desk-restart' {
        $code = Invoke-Ps1 $Companion @('-RestartDown')
    }
    'close-orphans' {
        $code = Invoke-Ps1 $Orphans @()
    }
    'start-one' {
        Assert-Service $Startable
        $code = Invoke-Ps1 $Hidden @('-Service', $Service)
    }
    'stop-one' {
        Assert-Service $Startable
        if ($Service -eq 'ops-dashboard') {
            throw 'Refusing to stop the Ops Dashboard from itself. Close the Node process on :3361 from the machine if you need that.'
        }
        if (-not (Test-Path -LiteralPath $PortGuard -PathType Leaf)) {
            throw "Missing port guard: $PortGuard"
        }
        . $PortGuard
        Stop-ListenerOnPort -Port ([int]$Ports[$Service]) -ServiceName $Service
        $code = 0
    }
    'sync' {
        if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
            throw "Git checkout not found: $RepoRoot"
        }
        Push-Location $RepoRoot
        try {
            Write-Host '--- git checkout main ---'
            & git.exe checkout main
            if ($LASTEXITCODE -ne 0) { throw 'git checkout main failed.' }
            Write-Host '--- git pull --ff-only origin main ---'
            & git.exe pull --ff-only origin main
            if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only failed. Resolve a dirty or diverged checkout locally. Never reset --hard from this dashboard.' }
            Write-Host '--- git status ---'
            & git.exe status
            Write-Host '--- current commit ---'
            & git.exe rev-parse --short HEAD
            & git.exe log -1 --format=%s
            Write-Host 'PASS - checkout is current with origin/main. This did not deploy or restart live services.'
            $code = 0
        } finally {
            Pop-Location
        }
    }
    'plan' {
        Assert-Service $Deployable
        $code = Invoke-Ps1 $Deployer @('-Service', $Service, '-PlanOnly', '-Yes')
    }
    'deploy' {
        Assert-Service $Deployable
        $code = Invoke-Ps1 $Deployer @('-Service', $Service, '-Yes')
    }
    'deploy-pipeline-runner' {
        $code = Invoke-Ps1 $Deployer @('-Service', 'pipeline-runner', '-Yes')
    }
    'rollback' {
        Assert-Service $Deployable
        $code = Invoke-Ps1 $Deployer @('-Service', $Service, '-RollbackLatest', '-Yes')
    }
}
} catch {
    Write-Host $_.Exception.Message
    $code = 1
} finally {
    if ($script:OuterTranscriptActive) {
        Stop-Transcript | Out-Null
        $script:OuterTranscriptActive = $false
    }
}

exit $code
