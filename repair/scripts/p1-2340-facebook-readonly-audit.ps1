# P1 #2340 — exact profile-scoped Meta Page credential diagnostic.
# All provider requests GET only. No raw tokens, Page names, or upstream bodies in logs.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3350/health' -TimeoutSec 20
if ($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or
    $health.studio_runner_output_read_source -ne 'supabase' -or
    $health.supabase_pipeline_writes -ne $true) { throw 'runner_not_supabase_authoritative' }
$envfile = Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if (-not (Test-Path $envfile)) { throw 'runner_env_missing' }
function EnvValue([string]$key) {
  $line = @(Get-Content $envfile | Where-Object { $_ -match ('^\s*'+[regex]::Escape($key)+'\s*=') }) | Select-Object -Last 1
  if (-not $line) { throw 'required_runner_setting_missing' }
  return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$dburl=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$dbkey=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if ($dburl -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $dbkey) { throw 'unsafe_supabase_source' }
$headers=@{apikey=$dbkey;Authorization=('Bearer '+$dbkey)}
# Fetch settings into process memory. Values never appear in logs/artifacts.
$settingsUrl=$dburl.TrimEnd('/')+'/rest/v1/engagement_settings?select=payload&limit=500'
$source=@(Invoke-RestMethod -Uri $settingsUrl -Headers $headers -Method Get -TimeoutSec 30)
# Some Windows PowerShell editions wrap a JSON response array as one nested
# object. Normalize before enforcing count, without ever logging secret rows.
if ($source.Count -eq 1 -and $source[0] -is [array]) { $source=@($source[0]) }
if ($source.Count -lt 1 -or $source.Count -ge 500) {
  throw ('settings_inventory_unavailable_or_truncated_count_'+$source.Count)
}
$settings=@{}
foreach($record in $source) {
  $p=$record.payload
  if ($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True') { continue }
  $name=[string]$p.Setting_Name
  if (-not $name) { continue }
  if ($settings.ContainsKey($name)) { throw 'duplicate_active_settings_name' }
  $settings[$name]=[string]$p.Setting_Value
}
function GraphGet([string]$path,[string]$token,[string]$version) {
  if ($version -notmatch '^v\d{1,2}\.\d$' -or
      $path -notmatch '^/[A-Za-z0-9_/?=,&-]+$') { throw 'invalid_graph_destination' }
  $uri='https://graph.facebook.com/'+$version+$path
  try {
    $body=Invoke-RestMethod -Uri $uri -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 35
    if ($null -ne $body.error) { return @{ok=$false;http=200;code=[int]$body.error.code;subcode=[int]$body.error.error_subcode} }
    return @{ok=$true;http=200;data=$body}
  } catch {
    $http=0
    try { $http=[int]$_.Exception.Response.StatusCode } catch {}
    $code=0; $subcode=0
    try {
      $details=$_.ErrorDetails.Message | ConvertFrom-Json
      $code=[int]$details.error.code
      $subcode=[int]$details.error.error_subcode
    } catch {}
    return @{ok=$false;http=$http;code=$code;subcode=$subcode}
  }
}
$profiles=@(
  @{label='Chicago';prefix='';failed_output=4907},
  @{label='LA';prefix='LA_';failed_output=5355},
  @{label='Miami';prefix='MIAMI_';failed_output=6256},
  @{label='NYC';prefix='NYC_';failed_output=0}
)
$reports=@()
foreach($profile in $profiles) {
  $prefix=$profile.prefix
  $pageId=[string]$settings[($prefix+'FACEBOOK_PAGE_ID')]
  $token=[string]$settings[($prefix+'FACEBOOK_PAGE_ACCESS_TOKEN')]
  $version=[string]$settings[($prefix+'FACEBOOK_GRAPH_API_VERSION')]
  if (-not $version) { $version=[string]$settings['FACEBOOK_GRAPH_API_VERSION'] }
  if (-not $version) { $version='v26.0' }
  $report=@{profile=$profile.label;failed_output=$profile.failed_output;checked_at=(Get-Date).ToUniversalTime().ToString('o');
    token_present=([bool]$token);page_id_present=([bool]$pageId);
    page_identity_verified=$false;token_state='unverified';read_feed_verified=$false;
    page_create_content_task=$null;pages_manage_posts_permission=$null;
    provider_http=0;provider_code=0;provider_subcode=0;
    no_provider_writes=$true;no_output_writes=$true;duplicate_absence_proven=$false}
  if (-not $token -or $pageId -notmatch '^\d{6,35}$') { $report.token_state='missing_or_invalid_configuration';$reports+= $report;continue }
  $me=GraphGet '/me?fields=id,name' $token $version
  $report.provider_http=$me.http; $report.provider_code=$me.code; $report.provider_subcode=$me.subcode
  if ($me.ok -ne $true) {
    $report.token_state=if($me.code -eq 190){'expired_or_invalid'}elseif($me.code -eq 200){'permission_denied'}else{'provider_rejected'}
    $reports+=$report;continue
  }
  if ([string]$me.data.id -ne $pageId) {
    $report.token_state='different_page_owner';$reports+=$report;continue
  }
  $report.page_identity_verified=$true
  $report.token_state='valid_page_identity'
  # Read permissions cannot prove publish permission; an unsupported edge stays unknown.
  $tasks=GraphGet ('/'+$pageId+'?fields=id,tasks') $token $version
  if ($tasks.ok -eq $true -and $null -ne $tasks.data.tasks) {
    $report.page_create_content_task=(@($tasks.data.tasks) -contains 'CREATE_CONTENT')
  }
  $perms=GraphGet '/me/permissions' $token $version
  if ($perms.ok -eq $true -and $null -ne $perms.data.data) {
    $granted=@($perms.data.data | Where-Object { $_.permission -eq 'pages_manage_posts' -and $_.status -eq 'granted' })
    $report.pages_manage_posts_permission=($granted.Count -gt 0)
  }
  $feed=GraphGet ('/'+$pageId+'/feed?fields=id&limit=1') $token $version
  $report.read_feed_verified=($feed.ok -eq $true -and $null -ne $feed.data.data)
  $reports+=$report
}
# Existing LA #5885 has an exact stored remote video ID. Inspect it without
# using a token from another Page; permalink alone is not ownership proof.
$reel=@{output_id=5885;read_only=$true;verified_public=$false;page_identity_verified=$false;exact_id_verified=$false;http=0;code=0}
$la=@($reports | Where-Object {$_.profile -eq 'LA'}) | Select-Object -First 1
if ($la.page_identity_verified -eq $true) {
  $token=[string]$settings['LA_FACEBOOK_PAGE_ACCESS_TOKEN']
  $ver=[string]$settings['FACEBOOK_GRAPH_API_VERSION']; if (-not $ver) {$ver='v26.0'}
  $v=GraphGet '/1841282600545084?fields=id,permalink_url,is_published' $token $ver
  $reel.http=$v.http;$reel.code=$v.code
  $reel.page_identity_verified=$true
  $reel.exact_id_verified=($v.ok -eq $true -and [string]$v.data.id -eq '1841282600545084')
  $reel.verified_public=($reel.exact_id_verified -and $v.data.is_published -eq $true -and
    [string]$v.data.permalink_url -match '^https://(?:www\.)?facebook\.com/')
}
$result=@{task='P1-2340-meta-page-token-diagnostic';read_only=$true;provider_operations='GET only';
  report_time=(Get-Date).ToUniversalTime().ToString('o');supabase_setting_rows=$source.Count;profiles=$reports;
  existing_facebook_5885=$reel; output_writes=0;provider_writes=0;
  finding='GET access is not a proof of publish permission or duplicate absence'}
Write-Output ('P1_META_AUDIT='+($result | ConvertTo-Json -Depth 8 -Compress))
