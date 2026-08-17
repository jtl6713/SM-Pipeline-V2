param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [string]$BaseUrl = "http://localhost:3012",
  [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $InputFile)) { throw "Input file not found: $InputFile" }
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $dir = Split-Path -Parent (Resolve-Path $InputFile)
  $base = [IO.Path]::GetFileNameWithoutExtension($InputFile)
  $OutputFile = Join-Path $dir ($base + "_normalized.mp3")
}

$headers = @{
  "X-Filename" = [IO.Path]::GetFileName($InputFile)
  "X-Target-LUFS" = "-16"
  "X-True-Peak-dBTP" = "-1.5"
  "X-Target-LRA" = "7"
  "X-Output-Bitrate-Kbps" = "128"
}

$result = Invoke-RestMethod `
  -Method Post `
  -Uri ($BaseUrl.TrimEnd('/') + "/normalize-audio") `
  -Headers $headers `
  -ContentType "audio/mpeg" `
  -InFile $InputFile

$result | ConvertTo-Json -Depth 8
Invoke-WebRequest -Uri $result.download_url -OutFile $OutputFile
Write-Host "Saved normalized audio to: $OutputFile"
