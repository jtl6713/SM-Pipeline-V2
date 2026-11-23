$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# GET-only verification for exact Miami Instagram business account used by
# owner-approved output #10631. Do NOT emit token/id/payload/caption.
$h=Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if (-not $h.ok -or $h.recovery_read_only -or -not $h.workload_governor_enabled -or
    $h.studio_write_source -ne 'supabase' -or -not $h.supabase_pipeline_writes -or
    $h.airtable_activity.any_activity) {throw 'miami_ig_runner_health_failed'}
$path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if (-not (Test-Path -LiteralPath $path)) {throw 'miami_ig_runner_env_missing'}
function Env-Setting([string]$key) {
  $matches=@(Get-Content -LiteralPath $path | Where-Object {$_ -match ('^\s*'+[regex]::Escape($key)+'\s*=')})
  if ($matches.Count -ne 1) {throw 'miami_ig_supabase_settings_not_unique'}
  return ([string]$matches[0] -split '=',2)[1].Trim().Trim('"').Trim("'")
}
$url=(Env-Setting 'SUPABASE_URL').TrimEnd('/')
$sbkey=Env-Setting 'SUPABASE_SERVICE_ROLE_KEY'
if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $sbkey) {
  throw 'miami_ig_supabase_credentials_invalid'
}
$headers=@{apikey=$sbkey;Authorization=('Bearer '+$sbkey)}
$rows=@(Invoke-RestMethod -Uri "$url/rest/v1/engagement_settings?select=payload&limit=500" -Headers $headers -Method Get -TimeoutSec 30)
if ($rows.Count -eq 1 -and $rows[0] -is [array]) {$rows=@($rows[0])}
if ($rows.Count -lt 1 -or $rows.Count -ge 500) {throw 'miami_ig_settings_incomplete'}
$needed=@('MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','MIAMI_META_GRAPH_API_ACCESS_TOKEN','META_GRAPH_API_VERSION')
$values=@{}
foreach($row in $rows) {
  $p=$row.payload
  if ($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True') {continue}
  $name=[string]$p.Setting_Name
  if ($name -in $needed) {
    if ($values.ContainsKey($name)) {throw 'miami_ig_duplicate_active_settings'}
    $values[$name]=[string]$p.Setting_Value
  }
}
foreach ($name in $needed) {if (-not $values.ContainsKey($name) -or -not $values[$name]) {throw 'miami_ig_settings_missing'}}
$businessId=[string]$values['MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$token=[string]$values['MIAMI_META_GRAPH_API_ACCESS_TOKEN']
$version=[string]$values['META_GRAPH_API_VERSION']
if ($businessId -notmatch '^[0-9]{7,30}$' -or $token.Length -lt 15 -or $version -notmatch '^v[0-9]{1,2}\.[0-9]$') {
  throw 'miami_ig_settings_shape_invalid'
}
function Safe-GET([string]$graphPath) {
  try {
    $payload=Invoke-RestMethod -Uri ('https://graph.facebook.com/'+$version+'/'+$graphPath) -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 35
    return @{ok=$true;http=200;payload=$payload}
  } catch {
    $code=0
    try{$code=[int]$_.Exception.Response.StatusCode}catch{}
    return @{ok=$false;http=$code;payload=$null}
  }
}
$identity=Safe-GET ($businessId+'?fields=id,username,account_type')
if (-not $identity.ok -or [string]$identity.payload.id -ne $businessId) {
  Write-Output ('incident2670_miami_ig_identity=DENIED_HTTP_'+$identity.http)
  throw 'miami_ig_identity_not_verified'
}
Write-Output 'incident2670_miami_ig_identity=PASS'
$limit=Safe-GET ($businessId+'/content_publishing_limit?fields=quota_usage,config')
if (-not $limit.ok) {
  Write-Output ('incident2670_miami_ig_publish_quota_get=DENIED_HTTP_'+$limit.http)
  throw 'miami_ig_publish_endpoint_not_verified'
}
Write-Output 'incident2670_miami_ig_publish_quota_get=PASS'
Write-Output 'incident2670_miami_ig_credentials=READ_ONLY_VERIFIED'
Write-Output 'incident2670_meta_provider_writes=0'
Write-Output 'incident2670_supabase_output_writes=0'
