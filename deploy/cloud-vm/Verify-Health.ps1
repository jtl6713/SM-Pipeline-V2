$ErrorActionPreference = "Stop"
$endpoints = [ordered]@{
  watermark = "http://127.0.0.1:3011/health"
  voiceover = "http://127.0.0.1:3012/health"
  remotion = "http://127.0.0.1:3333/health"
  frames = "http://127.0.0.1:3334/health"
  compressor = "http://127.0.0.1:3335/health"
  timing = "http://127.0.0.1:3336/health"
  youtube = "http://127.0.0.1:3340/health"
  pipeline = "http://127.0.0.1:3350/health"
}
$failed = $false
foreach ($name in $endpoints.Keys) {
  try {
    $payload = Invoke-RestMethod -Uri $endpoints[$name] -TimeoutSec 10
    if (-not $payload.ok) { throw "ok is not true" }
    Write-Host "OK  $name"
  } catch {
    Write-Host "FAIL $name $($endpoints[$name])"
    $failed = $true
  }
}
if ($failed) { exit 1 }
