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
        'restart-one',
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
    'youtube-uploader-la',
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
    'youtube-uploader-la' = 3341
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

function Write-ChildLogDelta([string]$ChildLog, [ref]$LastLength) {
    if (-not (Test-Path -LiteralPath $ChildLog -PathType Leaf)) { return }
    try {
        $stream = [System.IO.File]::Open(
            $ChildLog,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        try {
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
        } finally {
            if ($reader) { $reader.Dispose() }
            $stream.Dispose()
        }
        if ($text.Length -gt $LastLength.Value) {
            Write-Host $text.Substring($LastLength.Value)
            $LastLength.Value = $text.Length
        }
    } catch {
        # Transcript may be mid-write; next poll will retry.
    }
}

function Invoke-Ps1([string]$Path, [string[]]$NativeArgs) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing script: $Path"
    }
    # Child scripts use Write-Host. Nested runs always get their own temp log so we never
    # nest Start-Transcript on the dashboard transcript file (that can hang the outer job).
    $childLog = Join-Path $env:TEMP ('ops-dash-child-' + [guid]::NewGuid().ToString('N') + '.log')
    # Named switches/parameters must stay unquoted. Quoting '-Service' makes PowerShell
    # bind the literal string "-Service" as the $Service value (ValidateSet fails).
    $argLine = ''
    if ($NativeArgs -and $NativeArgs.Count -gt 0) {
        $argLine = @(
            foreach ($arg in $NativeArgs) {
                $text = [string]$arg
                if ($text -match '^-') {
                    $text
                } else {
                    "'" + ($text -replace "'", "''") + "'"
                }
            }
        ) -join ' '
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
    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        $cmd
    ) -PassThru -WindowStyle Hidden
    $lastLen = 0
    while ($null -eq $proc.HasExited -or -not $proc.HasExited) {
        Write-ChildLogDelta -ChildLog $childLog -LastLength ([ref]$lastLen)
        Start-Sleep -Milliseconds 400
    }
    $proc.WaitForExit() | Out-Null
    Write-ChildLogDelta -ChildLog $childLog -LastLength ([ref]$lastLen)
    $exitCode = if ($null -ne $proc.ExitCode) { [int]$proc.ExitCode } else { 1 }
    Remove-Item -LiteralPath $childLog -Force -ErrorAction SilentlyContinue
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

# TranscriptPath is kept for dashboard compatibility but intentionally unused.
# Outer Start-Transcript/Stop-Transcript can hang after nested deploy/start scripts
# finish, which leaves Ops jobs stuck on "running" even when the service is healthy.

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
    'restart-one' {
        Assert-Service $Startable
        if ($Service -eq 'ops-dashboard') {
            throw 'Refusing to restart the Ops Dashboard from itself. Use DEPLOY ops-dashboard or restart the Node process on :3361.'
        }
        $code = Invoke-Ps1 $Hidden @('-Service', $Service, '-StopFirst')
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
}

exit $code
