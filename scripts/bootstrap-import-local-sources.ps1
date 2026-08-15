param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline',
    [string]$RepoRoot = 'D:\Content Creation\ChicagoShining Pipeline\SM-Pipeline-V2-Source',
    [switch]$SkipCommit,
    [switch]$Push
)

$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

function Write-Step($Text) { Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-Pass($Text) { Write-Host "PASS: $Text" -ForegroundColor Green }
function Write-Warn($Text) { Write-Host "WARNING: $Text" -ForegroundColor Yellow }

$RepoUrl = 'https://github.com/jtl6713/SM-Pipeline-V2.git'

Write-Step 'Preflight'
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or is not in PATH. Install Git for Windows, then rerun.'
}
if (-not (Test-Path -LiteralPath $PipelineRoot)) {
    throw "Pipeline root not found: $PipelineRoot"
}
Write-Pass "Pipeline root: $PipelineRoot"

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    Write-Step 'Clone repository'
    git clone $RepoUrl $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed.' }
} else {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
        throw "RepoRoot exists but is not a Git repository: $RepoRoot"
    }
    Write-Step 'Refresh repository'
    Push-Location $RepoRoot
    try {
        git checkout main
        if ($LASTEXITCODE -ne 0) { throw 'git checkout main failed.' }
        git pull --ff-only origin main
        if ($LASTEXITCODE -ne 0) { throw 'git pull failed.' }
    } finally { Pop-Location }
}

$Sources = @(
    @{ Source = (Join-Path $PipelineRoot 'Remotion_Renderer'); Destination = 'services\remotion-renderer'; Required = $true },
    @{ Source = (Join-Path $PipelineRoot 'Production Start-Stop-Verify Services'); Destination = 'scripts\production-services'; Required = $true },
    @{ Source = (Join-Path $PipelineRoot 'chicagoshining-local-frame-extractor'); Destination = 'services\frame-extractor'; Required = $false },
    @{ Source = (Join-Path $PipelineRoot 'Services\voiceover-normalizer\service'); Destination = 'services\voiceover-normalizer'; Required = $false },
    @{ Source = (Join-Path $PipelineRoot 'Services\youtube-uploader\service'); Destination = 'services\youtube-uploader'; Required = $false }
)

$ExcludeDirs = @(
    '.git','node_modules','.wrangler','.cache','coverage','dist','build','out','renders','render-assets',
    'tmp','temp','logs','backup','backups','archive','archives'
)
$ExcludeFiles = @(
    '.env','.env.*','*.log','*.zip','*.7z','*.rar','*.bak','*.backup','*.mp4','*.mov','*.avi','*.mkv',
    '*.wav','*.mp3','*.heic','*.heif','*.jpg','*.jpeg','*.png','*.webp','*.gif','*.pem','*.key','*.pfx','*.p12'
)

Write-Step 'Copy active local sources'
foreach ($item in $Sources) {
    if (-not (Test-Path -LiteralPath $item.Source)) {
        if ($item.Required) { throw "Required source folder not found: $($item.Source)" }
        Write-Warn "Optional source folder not found; skipped: $($item.Source)"
        continue
    }

    $dest = Join-Path $RepoRoot $item.Destination
    New-Item -ItemType Directory -Force -Path $dest | Out-Null

    $args = @($item.Source, $dest, '/MIR', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/NJH', '/NJS')
    foreach ($d in $ExcludeDirs) { $args += @('/XD', $d) }
    foreach ($f in $ExcludeFiles) { $args += @('/XF', $f) }

    & robocopy.exe @args | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) { throw "Robocopy failed with code $rc for $($item.Source)" }
    Write-Pass "$($item.Source) -> $($item.Destination)"
}

Write-Step 'Secret safety scan'
$patterns = @(
    '(?i)AIRTABLE_PAT\s*=\s*[^\s<]+',
    '(?i)CLOUDFLARE_API_TOKEN\s*=\s*[^\s<]+',
    '(?i)ELEVENLABS_API_KEY\s*=\s*[^\s<]+',
    '(?i)CLIENT_SECRET\s*=\s*[^\s<]+',
    '(?i)REFRESH_TOKEN\s*=\s*[^\s<]+',
    '(?i)-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
)

$scanFiles = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch '\\.git\\' -and
        $_.Length -lt 5MB -and
        $_.Extension -notin @('.png','.jpg','.jpeg','.gif','.webp','.zip','.7z','.rar','.mp4','.mov','.mp3','.wav')
    }

$hits = @()
foreach ($file in $scanFiles) {
    try {
        $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
        foreach ($pattern in $patterns) {
            if ($text -match $pattern) {
                $hits += $file.FullName
                break
            }
        }
    } catch {}
}
$hits = $hits | Sort-Object -Unique
if ($hits.Count -gt 0) {
    Write-Host 'Potential secret material detected. Nothing will be committed:' -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw 'Remove/redact the listed files, then rerun.'
}
Write-Pass 'No obvious secret assignments/private keys detected.'

Write-Step 'Git status'
Push-Location $RepoRoot
try {
    git status --short

    if ($SkipCommit) {
        Write-Warn 'SkipCommit specified. Files copied but not committed.'
        exit 0
    }

    git add -- 'services/remotion-renderer' 'services/frame-extractor' 'services/voiceover-normalizer' 'services/youtube-uploader' 'scripts/production-services'
    if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }

    $staged = git diff --cached --name-only
    if (-not $staged) {
        Write-Pass 'No new local-source changes to commit.'
        exit 0
    }

    Write-Host "`nStaged files:" -ForegroundColor Cyan
    $staged | ForEach-Object { Write-Host "  $_" }

    git commit -m 'Import active local production services baseline'
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
    Write-Pass 'Committed local production services baseline.'

    if ($Push) {
        git push origin main
        if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
        Write-Pass 'Pushed baseline to GitHub main.'
    } else {
        Write-Warn 'Commit created locally but not pushed. Rerun with -Push or use git push origin main after review.'
    }
} finally {
    Pop-Location
}
