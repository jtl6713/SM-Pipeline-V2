param(
    [string]$PipelineRoot = 'D:\Content Creation\ChicagoShining Pipeline'
)

$ErrorActionPreference = 'Stop'
$ToolsRoot = Join-Path $PipelineRoot 'Source Control\Production-Start-Stop-Verify-Services'
$VerifyPs1 = Join-Path $ToolsRoot 'verify-chicagoshining-local-services.ps1'
$BackupRoot = Join-Path $ToolsRoot ('_backups\Video_Compressor_PublicVerify_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$PublicUrl = 'https://compress.chicagoshining.com/health'

function Read-All([string]$Path) { [System.IO.File]::ReadAllText($Path) }
function Write-Utf8NoBom([string]$Path,[string]$Text) {
    [System.IO.File]::WriteAllText($Path,$Text,[System.Text.UTF8Encoding]::new($false))
}

Write-Host 'Validate permanent public Video Compressor route' -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri $PublicUrl -TimeoutSec 10
if ($health.ok -ne $true -or $health.ffmpeg -ne $true -or $health.ffprobe -ne $true -or [int]$health.port -ne 3335) {
    throw 'Public Video Compressor health payload is not valid.'
}
Write-Host 'PASS - public Video Compressor health.' -ForegroundColor Green

if (-not (Test-Path -LiteralPath $VerifyPs1 -PathType Leaf)) {
    throw "Live verifier not found: $VerifyPs1"
}

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
Copy-Item -LiteralPath $VerifyPs1 -Destination (Join-Path $BackupRoot (Split-Path $VerifyPs1 -Leaf)) -Force

$verify = Read-All $VerifyPs1
if ($verify -notmatch [regex]::Escape($PublicUrl)) {
    $pipelinePattern = '(?m)^(.*Pipeline Runner public.*https://pipeline\.chicagoshining\.com/health.*)$'
    if ($verify -match $pipelinePattern) {
        $line = $Matches[1]
        $compressorLine = $line -replace 'Pipeline Runner public','Video Compressor public' -replace 'https://pipeline\.chicagoshining\.com/health','https://compress.chicagoshining.com/health'
        $verify = $verify.Replace($line,$compressorLine + "`r`n" + $line)
    }
    else {
        throw 'Could not locate the Pipeline Runner public health line in the live verifier.'
    }
}

$verify = $verify.Replace('Seven local origins + six permanent named Cloudflare hostnames','Seven local origins + seven permanent named Cloudflare hostnames')
$verify = $verify.Replace('SUCCESS: Seven local services and all six permanent Cloudflare routes are reachable.','SUCCESS: Seven local services and all seven permanent Cloudflare routes are reachable.')
$verify = $verify.Replace('seven local origins + six permanent named Cloudflare hostnames','seven local origins + seven permanent named Cloudflare hostnames')
$verify = $verify.Replace('seven local services and all six permanent Cloudflare routes are reachable.','seven local services and all seven permanent Cloudflare routes are reachable.')

Write-Utf8NoBom $VerifyPs1 $verify

$verifyNow = Read-All $VerifyPs1
if ($verifyNow -notmatch [regex]::Escape($PublicUrl)) { throw 'Public verifier patch validation failed.' }
if ($verifyNow -notmatch 'Seven local origins \+ seven permanent named Cloudflare hostnames') { throw 'Verifier header count validation failed.' }

Write-Host ''
Write-Host 'PASS - Production verifier now requires 7 local + 7 permanent Cloudflare routes.' -ForegroundColor Green
Write-Host "VERIFY: $VerifyPs1" -ForegroundColor Green
Write-Host "Backup: $BackupRoot" -ForegroundColor Green
