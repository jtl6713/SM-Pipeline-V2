param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Production Start-Stop-Verify Services'
$RuntimeRoot = Join-Path $PipelineRoot 'Services\Video_Compressor'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
$BackupRoot = Join-Path $ToolsRoot ('_backups\Video_Compressor_Finalize_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Backup-File([string]$Path) {
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupRoot (Split-Path $Path -Leaf)) -Force
}
function Write-Utf8NoBom([string]$Path,[string]$Text) {
    [System.IO.File]::WriteAllText($Path,$Text,[System.Text.UTF8Encoding]::new($false))
}

Write-Host 'Validate live Video Compressor' -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri 'http://localhost:3335/health' -TimeoutSec 5
if ($health.ok -ne $true -or $health.ffmpeg -ne $true -or $health.ffprobe -ne $true) {
    throw 'Video Compressor is not healthy on localhost:3335.'
}
Write-Host 'PASS - Video Compressor local health.' -ForegroundColor Green

if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
    throw "Live verifier not found: $VerifyPs1"
}

Write-Host 'Patch exact live production verifier' -ForegroundColor Cyan
Backup-File $VerifyPs1
$verify = [System.IO.File]::ReadAllText($VerifyPs1)

if ($verify -notmatch 'http://localhost:3335/health') {
    $patterns = @(
        '(?m)^(\s*)@\{\s*Name\s*=\s*["'']YouTube Uploader local["''];\s*Url\s*=\s*["'']http://localhost:3340(?:/health)?["'']\s*\}(,?)\s*$',
        '(?m)^(\s*)@\{\s*Name\s*=\s*["'']Pipeline Runner local["''];\s*Url\s*=\s*["'']http://localhost:3350/health["'']\s*\}(,?)\s*$'
    )
    $patched = $false
    foreach ($pattern in $patterns) {
        if ($verify -match $pattern) {
            $verify = [regex]::Replace($verify,$pattern,{ param($m)
                $indent = $m.Groups[1].Value
                $m.Value.TrimEnd().TrimEnd(',') + ',' + "`r`n" + $indent + '@{ Name = "Video Compressor local"; Url = "http://localhost:3335/health" }'
            },1)
            $patched = $true
            break
        }
    }
    if (-not $patched) {
        # Fallback for the current verifier if service checks are direct function calls rather than an array.
        $runnerPattern = '(?m)^(.*Pipeline Runner local.*http://localhost:3350/health.*)$'
        if ($verify -match $runnerPattern) {
            $line = $Matches[1]
            $compressorLine = $line -replace 'Pipeline Runner local','Video Compressor local' -replace 'http://localhost:3350/health','http://localhost:3335/health'
            $verify = $verify.Replace($line,$line + "`r`n" + $compressorLine)
            $patched = $true
        }
    }
    if (-not $patched) { throw 'Could not locate a safe local-service insertion point in the live verifier.' }
}

$verify = $verify.Replace('Six local origins + six permanent named Cloudflare hostnames','Seven local origins + six permanent named Cloudflare hostnames')
$verify = $verify.Replace('Six local services and all six permanent Cloudflare routes are reachable.','Seven local services and all six permanent Cloudflare routes are reachable.')
$verify = $verify.Replace('six local origins + six permanent named Cloudflare hostnames','seven local origins + six permanent named Cloudflare hostnames')
$verify = $verify.Replace('six local services and all six permanent Cloudflare routes are reachable.','seven local services and all six permanent Cloudflare routes are reachable.')
Write-Utf8NoBom $VerifyPs1 $verify

Write-Host 'Validate exact production START and STOP integration' -ForegroundColor Cyan
$startMatches = @(Get-ChildItem -LiteralPath $ToolsRoot -Recurse -File -Filter '*.bat' | Where-Object {
    ([System.IO.File]::ReadAllText($_.FullName) -match '90-video-compressor-local\.ps1|3335') -and $_.Name -match '(?i)start'
})
$stopMatches = @(Get-ChildItem -LiteralPath $ToolsRoot -Recurse -File -Filter '*.bat' | Where-Object {
    ([System.IO.File]::ReadAllText($_.FullName) -match '90-stop-video-compressor\.ps1|3335') -and $_.Name -match '(?i)stop'
})
if ($startMatches.Count -lt 1) { throw 'No production START BAT currently manages Video Compressor :3335.' }
if ($stopMatches.Count -lt 1) { throw 'No production STOP BAT currently manages Video Compressor :3335.' }

$verifyNow = [System.IO.File]::ReadAllText($VerifyPs1)
if ($verifyNow -notmatch 'http://localhost:3335/health') { throw 'Verifier patch validation failed.' }

Write-Host ''
Write-Host 'PASS - Exact live Production Start / Stop / Verify integration is present.' -ForegroundColor Green
Write-Host "VERIFY: $VerifyPs1" -ForegroundColor Green
Write-Host ('START: ' + ($startMatches.FullName -join '; ')) -ForegroundColor Green
Write-Host ('STOP : ' + ($stopMatches.FullName -join '; ')) -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Green
Write-Host 'Public compressor route is intentionally not counted until its permanent Cloudflare hostname is live.' -ForegroundColor Yellow
