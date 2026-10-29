$ErrorActionPreference='Stop'
# Exact production Chicago 8447 only. Reads credentials from the already
# provisioned Runner environment; never writes or prints secret values.
$path=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $path)){throw 'runner_environment_missing'}
$lines=@(Get-Content -LiteralPath $path)
function Protected-Key([string]$key) {
  $matches=@($lines|Where-Object {$_ -match ('^\s*'+[regex]::Escape($key)+'\s*=')})
  if($matches.Count -ne 1){throw 'protected_key_missing'}
  return ($matches[0] -split '=',2)[1].Trim().Trim('"').Trim([char]39)
}
$secret=Protected-Key 'RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET'
$clientId=Protected-Key 'CF_ACCESS_CLIENT_ID'
$clientSecret=Protected-Key 'CF_ACCESS_CLIENT_SECRET'
if($secret.Length -lt 24 -or $clientId.Length -lt 8 -or $clientSecret.Length -lt 16){
  throw 'protected_credentials_invalid'
}
Add-Type -AssemblyName System.Net.Http
$http=[System.Net.Http.HttpClient]::new()
$http.Timeout=[TimeSpan]::FromSeconds(155)
try {
  $request=[System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    'https://studio.chicagoshining.com/api/internal/rendering-review/factory-handoff')
  $request.Content=[System.Net.Http.StringContent]::new(
    '{"output_id":"rec0uVrVeiUM6shp9","confirm":"PROMOTE-ACCEPTED-REVIEW-TO-FACTORY"}',
    [System.Text.Encoding]::UTF8,'application/json')
  [void]$request.Headers.TryAddWithoutValidation('X-Rendering-Review-Job-Secret',$secret)
  [void]$request.Headers.TryAddWithoutValidation('CF-Access-Client-Id',$clientId)
  [void]$request.Headers.TryAddWithoutValidation('CF-Access-Client-Secret',$clientSecret)
  $reply=$http.SendAsync($request).GetAwaiter().GetResult()
  $body=$reply.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $result=$null
  try{$result=$body|ConvertFrom-Json -ErrorAction Stop}catch{}
  $verified=([int]$reply.StatusCode -eq 200 -and
    $result.ok -eq $true -and $result.ready_for_factory -eq $true -and
    [string]$result.artifact_id -eq '1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up' -and
    [string]$result.preserved_v1_file_id -eq '1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4' -and
    $result.factory_mirror_synced -eq $true -and
    $result.publication_approved -eq $false -and
    $result.scheduled -eq $false -and $result.published -eq $false)
  Write-Output ('factory_handoff_verified='+$verified+' http='+[int]$reply.StatusCode)
  if(-not $verified){throw 'factory_handoff_unverified_inspect_before_retry'}
} finally { $http.Dispose() }
