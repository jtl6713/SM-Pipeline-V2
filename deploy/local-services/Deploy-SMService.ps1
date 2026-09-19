param(
    [ValidateSet('frame-extractor','remotion-renderer','watermark','voiceover-normalizer','youtube-uploader','youtube-uploader-la','youtube-uploader-nyc','youtube-uploader-miami','pipeline-runner','timing-engine','ops-dashboard')]
    [string]$Service,

    [string]$Commit = '',

    [switch]$PlanOnly,

    [switch]$RollbackLatest,

    [switch]$Yes,

    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',

    [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$FrameworkVersion = '1.0.2-keep-dirty-checkout'

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Join-Path $PipelineRoot 'Source Control\SM-Pipeline-V2'
}

$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$BackupBase = Join-Path $PipelineRoot 'Deployment Backups\Local Services'
$LogBase = Join-Path $PipelineRoot 'Deployment Logs\Local Services'
$HelperBase = Join-Path $ToolsRoot '_deployment_helpers'

$ServiceMap = @{
    'frame-extractor' = @{
        DisplayName = 'Frame Extractor'
        RepoPath = 'services\frame-extractor'
        RuntimePath = 'Services\Frame_Extractor'
        Port = 3334
        PublicUrl = 'https://frames.chicagoshining.com'
        WindowTitle = '1 LOC Frame Extractor :3334'
        StartKind = 'batch'
        StartFile = 'start-frame-extractor.bat'
        DependencyKind = 'python'
        RuntimeDirs = @('.venv','venv','__pycache__','work','public\frames')
    }
    'remotion-renderer' = @{
        DisplayName = 'Remotion Renderer'
        RepoPath = 'services\remotion-renderer'
        RuntimePath = 'Services\Remotion_Renderer'
        Port = 3333
        PublicUrl = 'https://render.chicagoshining.com'
        WindowTitle = '2 LOC Remotion Renderer :3333'
        StartKind = 'node'
        StartFile = 'render-server.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','.cache','out','render-assets','render-props','renders','output','outputs','tmp','temp','logs')
    }
    'watermark' = @{
        DisplayName = 'Watermark'
        RepoPath = 'services\watermark'
        RuntimePath = 'Services\Watermark'
        Port = 3011
        PublicUrl = 'https://watermark.chicagoshining.com'
        WindowTitle = '3 LOC Watermark :3011'
        StartKind = 'node'
        StartFile = 'server.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','tmp','temp','logs')
    }
    'voiceover-normalizer' = @{
        DisplayName = 'Voiceover Normalizer'
        RepoPath = 'services\voiceover-normalizer'
        RuntimePath = 'Services\voiceover-normalizer\service'
        Port = 3012
        PublicUrl = 'https://voiceover.chicagoshining.com'
        WindowTitle = '4 LOC Voiceover Normalizer :3012'
        StartKind = 'batch'
        StartFile = 'start-voiceover-normalizer.bat'
        DependencyKind = 'none'
        RuntimeDirs = @('tmp','temp','logs','output','outputs')
    }
    'youtube-uploader' = @{
        DisplayName = 'YouTube Uploader'
        RepoPath = 'services\youtube-uploader'
        RuntimePath = 'Services\youtube-uploader\service'
        Port = 3340
        PublicUrl = 'https://youtube-upload.chicagoshining.com'
        WindowTitle = '5 LOC YouTube Uploader :3340'
        StartKind = 'node'
        StartFile = 'youtube-upload-service.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','data','tmp','temp','logs','uploads','downloads')
    }
    'youtube-uploader-la' = @{
        DisplayName = 'YouTube Uploader LA'
        RepoPath = 'services\youtube-uploader'
        RuntimePath = 'Services\youtube-uploader-la\service'
        Port = 3341
        PublicUrl = 'https://youtube-upload-la.chicagoshining.com'
        WindowTitle = '5a LOC YouTube Uploader LA :3341'
        StartKind = 'node'
        StartFile = 'youtube-upload-service.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','data','tmp','temp','logs','uploads','downloads')
    }
    'youtube-uploader-nyc' = @{
        DisplayName = 'YouTube Uploader NYC'
        RepoPath = 'services\youtube-uploader'
        RuntimePath = 'Services\youtube-uploader-nyc\service'
        Port = 3342
        PublicUrl = 'https://youtube-upload-nyc.chicagoshining.com'
        WindowTitle = '5b LOC YouTube Uploader NYC :3342'
        StartKind = 'node'
        StartFile = 'youtube-upload-service.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','data','tmp','temp','logs','uploads','downloads')
    }
    'youtube-uploader-miami' = @{
        DisplayName = 'YouTube Uploader Miami'
        RepoPath = 'services\youtube-uploader'
        RuntimePath = 'Services\youtube-uploader-miami\service'
        Port = 3343
        PublicUrl = 'https://youtube-upload-miami.chicagoshining.com'
        WindowTitle = '5c LOC YouTube Uploader Miami :3343'
        StartKind = 'node'
        StartFile = 'youtube-upload-service.js'
        DependencyKind = 'node'
        RuntimeDirs = @('node_modules','data','tmp','temp','logs','uploads','downloads')
    }
    'pipeline-runner' = @{
        DisplayName = 'Pipeline Runner'
        RepoPath = 'services\pipeline-runner'
        RuntimePath = 'Services\pipeline-runner\service'
        Port = 3350
        PublicUrl = 'https://pipeline.chicagoshining.com'
        WindowTitle = '6 LOC Pipeline Runner :3350'
        StartKind = 'batch'
        StartFile = 'start-pipeline-runner.bat'
        DependencyKind = 'python'
        RuntimeDirs = @('.venv','venv','__pycache__','logs','tmp','temp')
    }
    'timing-engine' = @{
        DisplayName = 'Timing Engine'
        RepoPath = 'services\timing-engine'
        RuntimePath = 'Services\timing-engine\service'
        Port = 3336
        PublicUrl = 'https://timing.chicagoshining.com'
        WindowTitle = '8 LOC Timing Engine :3336'
        StartKind = 'batch'
        StartFile = 'start-timing-engine.bat'
        DependencyKind = 'python'
        PublicHealthRequired = $false
        RuntimeDirs = @('.venv','venv','__pycache__','work','logs','tmp','temp')
    }
    'ops-dashboard' = @{
        DisplayName = 'Ops Dashboard'
        RepoPath = 'services\ops-dashboard'
        RuntimePath = 'Services\ops-dashboard'
        Port = 3361
        PublicUrl = 'https://ops.chicagoshining.com'
        WindowTitle = '10 LOC Ops Dashboard :3361'
        StartKind = 'node'
        StartFile = 'server.js'
        DependencyKind = 'none'
        PublicHealthRequired = $false
        RuntimeDirs = @('logs','tmp','temp')
    }
}

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(Mandatory=$true)][string[]]$NativeArgs,
        [string]$WorkingDirectory = '',
        [switch]$AllowFailure
    )

    $display = $FilePath + ' ' + (($NativeArgs | ForEach-Object {
        if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' ')
    Write-Host "  $display" -ForegroundColor DarkGray

    $oldPreference = $ErrorActionPreference
    $code = 999
    try {
        $ErrorActionPreference = 'Continue'
        if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
            Push-Location $WorkingDirectory
        }
        try {
            & $FilePath @NativeArgs 2>&1 | ForEach-Object { Write-Host "$_" }
            $code = $LASTEXITCODE
        }
        finally {
            if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
                Pop-Location
            }
        }
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    if ($code -ne 0 -and -not $AllowFailure) {
        throw "$display failed with exit code $code"
    }
    return $code
}

function Select-Service {
    Write-Host ''
    Write-Host 'Select local service:' -ForegroundColor Cyan
    Write-Host '  1  Frame Extractor'
    Write-Host '  2  Remotion Renderer'
    Write-Host '  3  Watermark'
    Write-Host '  4  Voiceover Normalizer'
    Write-Host '  5  YouTube Uploader (Chicago)'
    Write-Host '  5l YouTube Uploader LA'
    Write-Host '  5n YouTube Uploader NYC'
    Write-Host '  5m YouTube Uploader Miami'
    Write-Host '  6  Pipeline Runner'
    Write-Host '  7  Timing Engine'
    Write-Host '  10 Ops Dashboard'
    Write-Host ''
    $choice = Read-Host 'Enter 1-7, 5l, 5n, 5m, or 10'
    switch ($choice) {
        '1' { return 'frame-extractor' }
        '2' { return 'remotion-renderer' }
        '3' { return 'watermark' }
        '4' { return 'voiceover-normalizer' }
        '5' { return 'youtube-uploader' }
        '5l' { return 'youtube-uploader-la' }
        '5n' { return 'youtube-uploader-nyc' }
        '5m' { return 'youtube-uploader-miami' }
        '6' { return 'pipeline-runner' }
        '7' { return 'timing-engine' }
        '10' { return 'ops-dashboard' }
        default { throw "Invalid service selection: $choice" }
    }
}

function Test-IsSecretFile([System.IO.FileInfo]$File) {
    $name = $File.Name.ToLowerInvariant()
    $ext = $File.Extension.ToLowerInvariant()

    if ($name -eq '.env' -or ($name.StartsWith('.env.') -and $name -ne '.env.example')) { return $true }
    if ($name -match '^(client[_-]?secret|credentials|oauth[_-]?credentials|oauth[_-]?token|token|refresh[_-]?token).*\.json$') { return $true }
    if ($ext -in @('.pem','.key','.pfx','.p12','.crt','.cer')) { return $true }
    return $false
}

function Test-IsSourceControlOnly([System.IO.FileInfo]$File) {
    $name = $File.Name.ToLowerInvariant()
    if ($name -eq '.gitignore' -or $name -eq '.env.example') { return $true }
    if ($name -eq 'readme.md') { return $true }
    return $false
}

function Test-IsRuntimePath {
    param(
        [string]$RelativePath,
        [string[]]$RuntimeDirs
    )

    $normalized = $RelativePath.Replace('/','\').TrimStart('\')
    foreach ($runtimeDir in $RuntimeDirs) {
        $candidate = $runtimeDir.Replace('/','\').Trim('\')
        if ($normalized.Equals($candidate,[System.StringComparison]::OrdinalIgnoreCase)) { return $true }
        if ($normalized.StartsWith($candidate + '\',[System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Get-SafeLiveFiles {
    param(
        [string]$Root,
        [string[]]$RuntimeDirs
    )

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction Stop)) {
        $relative = $file.FullName.Substring($Root.Length).TrimStart('\')
        if (Test-IsRuntimePath -RelativePath $relative -RuntimeDirs $RuntimeDirs) { continue }
        if (Test-IsSecretFile $file) { continue }
        if ($file.Name -eq '.smv2-deployment.json') { continue }
        $result.Add([PSCustomObject]@{
            File = $file
            Relative = $relative
        })
    }
    return $result.ToArray()
}

function Get-DeployableSourceFiles {
    param(
        [string]$Root,
        [string[]]$RuntimeDirs
    )

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction Stop)) {
        $relative = $file.FullName.Substring($Root.Length).TrimStart('\')
        if (Test-IsRuntimePath -RelativePath $relative -RuntimeDirs $RuntimeDirs) { continue }
        if (Test-IsSecretFile $file) {
            throw "Secret-bearing file unexpectedly exists in Git deployment source: $relative"
        }
        if (Test-IsSourceControlOnly $file) { continue }
        $result.Add([PSCustomObject]@{
            File = $file
            Relative = $relative
        })
    }
    return $result.ToArray()
}

function Get-FileHashOrEmpty([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-HttpHealth {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 8,
        [switch]$ReturnBoolean
    )

    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds
        $ok = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
    }
    catch {
        $ok = $false
    }

    if ($ReturnBoolean) { return $ok }
    if (-not $ok) { throw "Health check failed: $Url" }
}

function Wait-ServiceHealth {
    param(
        [hashtable]$Config,
        [int]$Seconds = 90
    )

    $localUrl = "http://localhost:$($Config.Port)/health"
    $publicUrl = $Config.PublicUrl.TrimEnd('/') + '/health'

    $deadline = (Get-Date).AddSeconds($Seconds)
    $localOk = $false
    do {
        if (Test-HttpHealth -Url $localUrl -TimeoutSeconds 4 -ReturnBoolean) {
            $localOk = $true
            break
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    if (-not $localOk) {
        throw "Local service did not become healthy within $Seconds seconds: $localUrl"
    }

    $requirePublic = $true
    if ($Config.ContainsKey('PublicHealthRequired') -and -not [bool]$Config.PublicHealthRequired) {
        $requirePublic = $false
    }

    $publicDeadline = (Get-Date).AddSeconds(45)
    $publicOk = $false
    do {
        if (Test-HttpHealth -Url $publicUrl -TimeoutSeconds 6 -ReturnBoolean) {
            $publicOk = $true
            break
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $publicDeadline)

    if (-not $publicOk) {
        if ($requirePublic) {
            throw "Permanent public service route did not become healthy: $publicUrl"
        }
        Write-Host "WARN public health not required yet: $publicUrl" -ForegroundColor Yellow
    }

    Write-Host "PASS local health:  $localUrl" -ForegroundColor Green
    if ($publicOk) {
        Write-Host "PASS public health: $publicUrl" -ForegroundColor Green
    }
}

function Stop-LocalService {
    param([hashtable]$Config)

    $port = [int]$Config.Port
    Write-Host "Stopping $($Config.DisplayName) on port $port..." -ForegroundColor Yellow

    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $listenerPid = [int]$listener.OwningProcess
        if (-not $listenerPid) { continue }

        $killPid = $listenerPid
        try {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction Stop
            $parentPid = [int]$proc.ParentProcessId
            if ($parentPid -gt 0) {
                $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentPid" -ErrorAction SilentlyContinue
                if ($parent) {
                    $parentName = ([string]$parent.Name).ToLowerInvariant()
                    $parentCmd = [string]$parent.CommandLine
                    if (($parentName -in @('powershell.exe','pwsh.exe','cmd.exe')) -and
                        (
                            $parentCmd.IndexOf('_startup_helpers',[System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
                            $parentCmd.IndexOf([string]$Config.StartFile,[System.StringComparison]::OrdinalIgnoreCase) -ge 0
                        )) {
                        $killPid = $parentPid
                    }
                }
            }
        }
        catch {}

        if (Get-Process -Id $killPid -ErrorAction SilentlyContinue) {
            try {
                $p = Start-Process -FilePath 'taskkill.exe' `
                    -ArgumentList @('/PID',"$killPid",'/T','/F') `
                    -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
            }
            catch {}
        }
    }

    $deadline = (Get-Date).AddSeconds(20)
    do {
        $remaining = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) { return }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "Port $port is still listening after stop attempt."
}

function Start-LocalService {
    param(
        [string]$ServiceName,
        [hashtable]$Config,
        [string]$RuntimeRoot
    )

    $hidden = Join-Path $RepoRoot 'deploy\local-services\Start-ChicagoShiningHidden.ps1'
    if (-not (Test-Path -LiteralPath $hidden)) {
        throw "Missing hidden launcher: $hidden"
    }
    Write-Host "Starting $($Config.DisplayName) hidden (no extra console window)." -ForegroundColor Yellow
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hidden -Service $ServiceName
    if ($LASTEXITCODE -ne 0) {
        throw "Hidden start failed for $($Config.DisplayName), exit code $LASTEXITCODE."
    }
}

function Install-Dependencies {
    param(
        [hashtable]$Config,
        [string]$RuntimeRoot,
        [switch]$ForceInstall
    )

    if ($Config.DependencyKind -eq 'none') { return }

    if ($Config.DependencyKind -eq 'python') {
        $requirements = Join-Path $RuntimeRoot 'requirements.txt'
        if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) { return }

        $python = Join-Path $RuntimeRoot '.venv\Scripts\python.exe'
        if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
            Write-Host 'Creating Python virtual environment...' -ForegroundColor Yellow
            Invoke-Native -FilePath 'python.exe' -NativeArgs @('-m','venv','.venv') -WorkingDirectory $RuntimeRoot | Out-Null
            $ForceInstall = $true
        }

        if ($ForceInstall) {
            Write-Host 'Installing Python requirements...' -ForegroundColor Yellow
            Invoke-Native -FilePath $python -NativeArgs @(
                '-m','pip','install','--disable-pip-version-check','-r','requirements.txt'
            ) -WorkingDirectory $RuntimeRoot | Out-Null
        }
        return
    }

    if ($Config.DependencyKind -eq 'node') {
        $packageJson = Join-Path $RuntimeRoot 'package.json'
        if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) { return }

        $package = Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json
        $dependencyCount = 0
        if ($package.dependencies) { $dependencyCount += @($package.dependencies.PSObject.Properties).Count }
        if ($package.devDependencies) { $dependencyCount += @($package.devDependencies.PSObject.Properties).Count }

        if ($dependencyCount -eq 0) { return }

        $nodeModules = Join-Path $RuntimeRoot 'node_modules'
        if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
            $ForceInstall = $true
        }

        if ($ForceInstall) {
            Write-Host 'Installing Node dependencies from approved package metadata...' -ForegroundColor Yellow
            if (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'package-lock.json') -PathType Leaf) {
                Invoke-Native -FilePath 'npm.cmd' -NativeArgs @('ci','--no-audit','--no-fund') -WorkingDirectory $RuntimeRoot | Out-Null
            }
            else {
                Invoke-Native -FilePath 'npm.cmd' -NativeArgs @('install','--no-audit','--no-fund') -WorkingDirectory $RuntimeRoot | Out-Null
            }
        }
        return
    }

    throw "Unknown DependencyKind: $($Config.DependencyKind)"
}

function New-SourceBackup {
    param(
        [string]$RuntimeRoot,
        [hashtable]$Config,
        [string]$BackupRoot
    )

    $filesRoot = Join-Path $BackupRoot 'files'
    New-Item -ItemType Directory -Force -Path $filesRoot | Out-Null

    $backed = New-Object System.Collections.Generic.List[string]
    foreach ($item in @(Get-SafeLiveFiles -Root $RuntimeRoot -RuntimeDirs $Config.RuntimeDirs)) {
        $dst = Join-Path $filesRoot $item.Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $item.File.FullName -Destination $dst -Force
        $backed.Add($item.Relative)
    }

    $deploymentManifest = Join-Path $RuntimeRoot '.smv2-deployment.json'
    if (Test-Path -LiteralPath $deploymentManifest -PathType Leaf) {
        Copy-Item -LiteralPath $deploymentManifest -Destination (Join-Path $BackupRoot 'prior-deployment.json') -Force
    }

    return $backed.ToArray()
}

function Restore-SourceBackup {
    param(
        [string]$RuntimeRoot,
        [hashtable]$Config,
        [string]$BackupRoot
    )

    Write-Host 'Restoring pre-deployment source backup...' -ForegroundColor Yellow

    foreach ($item in @(Get-SafeLiveFiles -Root $RuntimeRoot -RuntimeDirs $Config.RuntimeDirs)) {
        Remove-Item -LiteralPath $item.File.FullName -Force -ErrorAction SilentlyContinue
    }

    $filesRoot = Join-Path $BackupRoot 'files'
    if (Test-Path -LiteralPath $filesRoot -PathType Container) {
        foreach ($file in @(Get-ChildItem -LiteralPath $filesRoot -Recurse -File -Force)) {
            $relative = $file.FullName.Substring($filesRoot.Length).TrimStart('\')
            $dst = Join-Path $RuntimeRoot $relative
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
            Copy-Item -LiteralPath $file.FullName -Destination $dst -Force
        }
    }

    $liveManifest = Join-Path $RuntimeRoot '.smv2-deployment.json'
    $priorManifest = Join-Path $BackupRoot 'prior-deployment.json'
    if (Test-Path -LiteralPath $priorManifest -PathType Leaf) {
        Copy-Item -LiteralPath $priorManifest -Destination $liveManifest -Force
    }
    else {
        Remove-Item -LiteralPath $liveManifest -Force -ErrorAction SilentlyContinue
    }
}

function Write-DeploymentHistory {
    param([hashtable]$Record)

    New-Item -ItemType Directory -Force -Path $LogBase | Out-Null
    $history = Join-Path $LogBase 'deployment-history.jsonl'
    $line = ($Record | ConvertTo-Json -Depth 10 -Compress)
    Add-Content -LiteralPath $history -Value $line -Encoding UTF8
}

function Get-LatestBackup([string]$ServiceName) {
    $serviceBackupRoot = Join-Path $BackupBase $ServiceName
    if (-not (Test-Path -LiteralPath $serviceBackupRoot -PathType Container)) { return $null }

    $dirs = @(Get-ChildItem -LiteralPath $serviceBackupRoot -Directory | Sort-Object Name -Descending)
    foreach ($dir in $dirs) {
        if (Test-Path -LiteralPath (Join-Path $dir.FullName 'backup-manifest.json') -PathType Leaf) {
            return $dir.FullName
        }
    }
    return $null
}

if ([string]::IsNullOrWhiteSpace($Service)) {
    $Service = Select-Service
}

$Config = $ServiceMap[$Service]
if (-not $Config) { throw "Unknown service: $Service" }

$RuntimeRoot = Join-Path $PipelineRoot ([string]$Config.RuntimePath)
$RepoServicePath = [string]$Config.RepoPath
$SourceManifestPath = Join-Path $RuntimeRoot '.smv2-deployment.json'

Write-Host ''
Write-Host 'SM Pipeline V2 - Controlled Local Service Deployment' -ForegroundColor Cyan
Write-Host "Framework:    $FrameworkVersion" -ForegroundColor DarkGray
Write-Host "Service:      $($Config.DisplayName)"
Write-Host "Runtime:      $RuntimeRoot"
Write-Host "Git checkout: $RepoRoot"
Write-Host ''

$FirstInstall = -not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)
if ($FirstInstall) {
    Write-Host "First install: creating live runtime folder $RuntimeRoot" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git') -PathType Container)) {
    throw "Git checkout not found: $RepoRoot"
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'git.exe was not found in PATH.'
}

if ($RollbackLatest) {
    Write-Step 'ROLLBACK - locate latest deployment backup'
    $latest = Get-LatestBackup -ServiceName $Service
    if (-not $latest) { throw "No deployment backup exists for $Service." }

    $backupManifestPath = Join-Path $latest 'backup-manifest.json'
    $backupManifest = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json

    Write-Host "Backup: $latest"
    Write-Host "Created: $($backupManifest.created_at_utc)"
    Write-Host "Before commit: $($backupManifest.prior_deployed_commit)"

    if (-not $Yes) {
        $answer = Read-Host 'Type ROLLBACK to restore this backup'
        if ($answer -ne 'ROLLBACK') { throw 'Rollback cancelled.' }
    }

    Stop-LocalService -Config $Config
    Restore-SourceBackup -RuntimeRoot $RuntimeRoot -Config $Config -BackupRoot $latest
    Install-Dependencies -Config $Config -RuntimeRoot $RuntimeRoot -ForceInstall
    Start-LocalService -ServiceName $Service -Config $Config -RuntimeRoot $RuntimeRoot
    Wait-ServiceHealth -Config $Config -Seconds 90

    $record = @{
        action = 'manual_rollback'
        service = $Service
        completed_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        backup = $latest
        result = 'PASS'
    }
    Write-DeploymentHistory -Record $record

    Write-Host ''
    Write-Host 'PASS - rollback completed and verified.' -ForegroundColor Green
    exit 0
}

Write-Step '1/8  Validate and synchronize Git source authority'

Push-Location $RepoRoot
try {
    $origin = (& git remote get-url origin 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '(?i)github\.com[/:]jtl6713/SM-Pipeline-V2(?:\.git)?$') {
        throw "Unexpected Git origin: $origin"
    }

    $dirty = @(& git status --porcelain)
    if ($dirty.Count -gt 0) {
        Write-Host 'Checkout has local files that are not on GitHub. Leaving them in place.' -ForegroundColor Yellow
        Write-Host ($dirty -join "`n") -ForegroundColor DarkYellow
        Write-Host 'Deploy still uses an isolated worktree of origin/main, not those files.' -ForegroundColor Yellow
    }

    Invoke-Native -FilePath 'git.exe' -NativeArgs @('fetch','origin') -WorkingDirectory $RepoRoot | Out-Null

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        $ResolvedCommit = (& git rev-parse 'origin/main' | Out-String).Trim()
    }
    else {
        $ResolvedCommit = (& git rev-parse "$Commit^{commit}" 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ResolvedCommit)) {
            throw "Commit/ref could not be resolved: $Commit"
        }

        $ancestorCode = Invoke-Native -FilePath 'git.exe' `
            -NativeArgs @('merge-base','--is-ancestor',$ResolvedCommit,'origin/main') `
            -WorkingDirectory $RepoRoot -AllowFailure

        if ($ancestorCode -ne 0) {
            throw "Refusing to deploy $ResolvedCommit because it is not an ancestor of approved origin/main."
        }
    }
}
finally {
    Pop-Location
}

$ShortCommit = $ResolvedCommit.Substring(0,12)
Write-Host "Approved commit: $ResolvedCommit" -ForegroundColor Green

$TempWorktree = Join-Path $env:TEMP ("SMV2_Deploy_" + $Service + "_" + $ShortCommit + "_" + [guid]::NewGuid().ToString('N').Substring(0,8))
$SourceRoot = Join-Path $TempWorktree $RepoServicePath

try {
    Write-Step '2/8  Materialize exact approved commit in isolated Git worktree'
    Invoke-Native -FilePath 'git.exe' `
        -NativeArgs @('worktree','add','--detach',$TempWorktree,$ResolvedCommit) `
        -WorkingDirectory $RepoRoot | Out-Null

    if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
        throw "Service source path does not exist at commit $ResolvedCommit`: $RepoServicePath"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot ([string]$Config.StartFile)) -PathType Leaf)) {
        throw "Required service startup file is missing at approved commit: $($Config.StartFile)"
    }

    $SourceFiles = @(Get-DeployableSourceFiles -Root $SourceRoot -RuntimeDirs $Config.RuntimeDirs)
    if ($SourceFiles.Count -eq 0) { throw 'No deployable source files found.' }

    $PriorManifest = $null
    $PriorManaged = @()
    $PriorCommit = ''
    if (Test-Path -LiteralPath $SourceManifestPath -PathType Leaf) {
        try {
            $PriorManifest = Get-Content -LiteralPath $SourceManifestPath -Raw | ConvertFrom-Json
            $PriorManaged = @($PriorManifest.managed_files)
            $PriorCommit = [string]$PriorManifest.deployed_commit
        }
        catch {
            throw "Existing deployment manifest is invalid: $SourceManifestPath"
        }
    }

    $NewManaged = @($SourceFiles | ForEach-Object { $_.Relative } | Sort-Object -Unique)

    $Changed = New-Object System.Collections.Generic.List[string]
    $Added = New-Object System.Collections.Generic.List[string]
    foreach ($sourceItem in $SourceFiles) {
        $live = Join-Path $RuntimeRoot $sourceItem.Relative
        if (-not (Test-Path -LiteralPath $live -PathType Leaf)) {
            $Added.Add($sourceItem.Relative)
            continue
        }
        $sourceHash = (Get-FileHash -LiteralPath $sourceItem.File.FullName -Algorithm SHA256).Hash
        $liveHash = (Get-FileHash -LiteralPath $live -Algorithm SHA256).Hash
        if ($sourceHash -ne $liveHash) { $Changed.Add($sourceItem.Relative) }
    }

    $Removed = @($PriorManaged | Where-Object { $NewManaged -notcontains $_ } | Sort-Object -Unique)

    Write-Step '3/8  Deployment plan'
    Write-Host "Service:       $($Config.DisplayName)"
    Write-Host "Target commit: $ResolvedCommit"
    Write-Host "Previously recorded commit: $(if ($PriorCommit) {$PriorCommit} else {'<none - first managed deploy>'})"
    Write-Host "Files: $($Added.Count) added, $($Changed.Count) changed, $($Removed.Count) removed"
    if ($Added.Count -gt 0) {
        Write-Host 'Added:' -ForegroundColor DarkGray
        $Added | ForEach-Object { Write-Host "  + $_" -ForegroundColor DarkGray }
    }
    if ($Changed.Count -gt 0) {
        Write-Host 'Changed:' -ForegroundColor DarkGray
        $Changed | ForEach-Object { Write-Host "  ~ $_" -ForegroundColor DarkGray }
    }
    if ($Removed.Count -gt 0) {
        Write-Host 'Removed:' -ForegroundColor DarkGray
        $Removed | ForEach-Object { Write-Host "  - $_" -ForegroundColor DarkGray }
    }

    $localBefore = Test-HttpHealth -Url ("http://localhost:$($Config.Port)/health") -ReturnBoolean
    $publicBefore = Test-HttpHealth -Url ($Config.PublicUrl.TrimEnd('/') + '/health') -ReturnBoolean
    $requirePublicBaseline = $true
    if ($Config.ContainsKey('PublicHealthRequired') -and -not [bool]$Config.PublicHealthRequired) {
        $requirePublicBaseline = $false
    }
    if ($FirstInstall -or -not $PriorCommit) {
        Write-Host 'First managed deploy: skipping baseline health (service is not live yet).' -ForegroundColor Yellow
    }
    elseif (-not $localBefore -or ($requirePublicBaseline -and -not $publicBefore)) {
        throw 'Baseline local/public health is not green. Refusing to modify a service that is already unhealthy.'
    }
    else {
        Write-Host 'PASS baseline local/public health.' -ForegroundColor Green
        if (-not $requirePublicBaseline -and -not $publicBefore) {
            Write-Host 'WARN baseline public health skipped for this service.' -ForegroundColor Yellow
        }
    }

    if ($PlanOnly) {
        Write-Host ''
        Write-Host 'PLAN ONLY - no production files or processes were changed.' -ForegroundColor Green
        exit 0
    }

    if (-not $Yes) {
        Write-Host ''
        $answer = Read-Host 'Type DEPLOY to continue'
        if ($answer -ne 'DEPLOY') { throw 'Deployment cancelled.' }
    }

    $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupRoot = Join-Path (Join-Path $BackupBase $Service) ($Timestamp + '-' + $ShortCommit)
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

    Write-Step '4/8  Back up current live source and deployment state'
    $BackedFiles = @(New-SourceBackup -RuntimeRoot $RuntimeRoot -Config $Config -BackupRoot $BackupRoot)

    $preDependencyHashes = @{
        'package.json' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'package.json')
        'package-lock.json' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'package-lock.json')
        'requirements.txt' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'requirements.txt')
    }

    $backupManifest = @{
        service = $Service
        display_name = $Config.DisplayName
        created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        target_commit = $ResolvedCommit
        prior_deployed_commit = $PriorCommit
        backed_up_files = $BackedFiles
    }
    $backupManifest | ConvertTo-Json -Depth 10 |
        Set-Content -LiteralPath (Join-Path $BackupRoot 'backup-manifest.json') -Encoding UTF8

    $Stopped = $false
    $Modified = $false

    try {
        Write-Step '5/8  Stop only the selected service'
        Stop-LocalService -Config $Config
        $Stopped = $true

        Write-Step '6/8  Apply approved source; preserve secrets/runtime state'
        foreach ($oldFile in $Removed) {
            $path = Join-Path $RuntimeRoot $oldFile
            if (Test-Path -LiteralPath $path -PathType Leaf) {
                Remove-Item -LiteralPath $path -Force
            }
        }

        foreach ($sourceItem in $SourceFiles) {
            $dst = Join-Path $RuntimeRoot $sourceItem.Relative
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
            Copy-Item -LiteralPath $sourceItem.File.FullName -Destination $dst -Force
        }
        $Modified = $true

        $postDependencyHashes = @{
            'package.json' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'package.json')
            'package-lock.json' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'package-lock.json')
            'requirements.txt' = Get-FileHashOrEmpty (Join-Path $RuntimeRoot 'requirements.txt')
        }

        $dependenciesChanged = (
            $preDependencyHashes['package.json'] -ne $postDependencyHashes['package.json'] -or
            $preDependencyHashes['package-lock.json'] -ne $postDependencyHashes['package-lock.json'] -or
            $preDependencyHashes['requirements.txt'] -ne $postDependencyHashes['requirements.txt']
        )

        Install-Dependencies -Config $Config -RuntimeRoot $RuntimeRoot -ForceInstall:$dependenciesChanged

        Write-Step '7/8  Restart only selected service and verify local/public health'
        Start-LocalService -ServiceName $Service -Config $Config -RuntimeRoot $RuntimeRoot
        $Stopped = $false
        Wait-ServiceHealth -Config $Config -Seconds 90

        Write-Step '8/8  Record exact deployed Git commit'
        $deploymentRecord = @{
            schema_version = 1
            service = $Service
            display_name = $Config.DisplayName
            deployed_commit = $ResolvedCommit
            deployed_commit_short = $ShortCommit
            deployed_at_utc = (Get-Date).ToUniversalTime().ToString('o')
            repo_path = $RepoServicePath
            runtime_path = $RuntimeRoot
            backup_path = $BackupRoot
            managed_files = $NewManaged
            local_health = "http://localhost:$($Config.Port)/health"
            public_health = $Config.PublicUrl.TrimEnd('/') + '/health'
        }
        $deploymentRecord | ConvertTo-Json -Depth 10 |
            Set-Content -LiteralPath $SourceManifestPath -Encoding UTF8

        Write-DeploymentHistory -Record @{
            action = 'deploy'
            service = $Service
            completed_at_utc = (Get-Date).ToUniversalTime().ToString('o')
            commit = $ResolvedCommit
            prior_commit = $PriorCommit
            backup = $BackupRoot
            result = 'PASS'
        }

        Write-Host ''
        Write-Host 'PASS - controlled deployment completed and verified.' -ForegroundColor Green
        Write-Host "Service: $($Config.DisplayName)" -ForegroundColor Green
        Write-Host "Commit:  $ResolvedCommit" -ForegroundColor Green
        Write-Host "Backup:  $BackupRoot" -ForegroundColor DarkGray
        Write-Host ''
    }
    catch {
        $deploymentFailure = $_
        Write-Host ''
        Write-Host "DEPLOYMENT FAILED: $($deploymentFailure.Exception.Message)" -ForegroundColor Red

        if ($Modified -or $Stopped) {
            Write-Host 'Automatic rollback starting...' -ForegroundColor Yellow
            try {
                Stop-LocalService -Config $Config
            } catch {}

            try {
                Restore-SourceBackup -RuntimeRoot $RuntimeRoot -Config $Config -BackupRoot $BackupRoot
                Install-Dependencies -Config $Config -RuntimeRoot $RuntimeRoot -ForceInstall
                Start-LocalService -ServiceName $Service -Config $Config -RuntimeRoot $RuntimeRoot
                Wait-ServiceHealth -Config $Config -Seconds 90

                Write-DeploymentHistory -Record @{
                    action = 'automatic_rollback'
                    service = $Service
                    completed_at_utc = (Get-Date).ToUniversalTime().ToString('o')
                    failed_target_commit = $ResolvedCommit
                    backup = $BackupRoot
                    result = 'PASS'
                }

                Write-Host 'PASS - previous source restored and service health re-verified.' -ForegroundColor Green
            }
            catch {
                Write-Host "ROLLBACK ERROR: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "Manual backup location: $BackupRoot" -ForegroundColor Yellow
            }
        }

        throw $deploymentFailure
    }
}
finally {
    if (Test-Path -LiteralPath $TempWorktree) {
        try {
            Invoke-Native -FilePath 'git.exe' `
                -NativeArgs @('worktree','remove','--force',$TempWorktree) `
                -WorkingDirectory $RepoRoot -AllowFailure | Out-Null
        }
        catch {}
    }
}
