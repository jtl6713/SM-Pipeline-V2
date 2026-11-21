$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'runner_not_supabase_authoritative'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not (Test-Path $envfile)){throw 'runner_env_missing'}
function EnvValue($name){
$line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})|Select-Object -Last 1
if(-not $line){throw 'runner_setting_unavailable'}
return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$key=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'unsafe_source'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
$items=@(Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $headers -Method Get -TimeoutSec 30)
if($items.Count -eq 1 -and $items[0] -is [array]){$items=@($items[0])}
if($items.Count -eq 0 -or $items.Count -ge 500){throw 'settings_incomplete'}
$values=@{}
foreach($item in $items){
$p=$item.payload
if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
$name=[string]$p.Setting_Name
if($name -and $name -match '^(META_LONG_LIVED_USER_ACCESS_TOKEN|FACEBOOK_GRAPH_API_VERSION|FACEBOOK_PAGE_ID|LA_FACEBOOK_PAGE_ID|MIAMI_FACEBOOK_PAGE_ID|NYC_FACEBOOK_PAGE_ID)$'){
if($values.ContainsKey($name)){throw 'duplicate_active_setting'}
$values[$name]=[string]$p.Setting_Value
}
}
$token=[string]$values['META_LONG_LIVED_USER_ACCESS_TOKEN']
$ver=[string]$values['FACEBOOK_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
$report=@{read_only=$true;provider_operations='GET only';output_writes=0;provider_writes=0;source_rows=$items.Count;user_state='unverified';pages=@();accounts_http=0;accounts_code=0;accounts_complete=$false;permissions_http=0;permissions_code=0;scopes=@{}}
function G($path){
try {
$d=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+$path) -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 35
return @{ok=$true;status=200;body=$d;code=0}
}catch{
$status=0;$code=0
try{$status=[int]$_.Exception.Response.StatusCode}catch{}
try{$e=$_.ErrorDetails.Message|ConvertFrom-Json;$code=[int]$e.error.code}catch{}
return @{ok=$false;status=$status;code=$code;body=$null}
}
}
if($token){
$m=G '/me?fields=id'
if($m.ok -eq $true){
$report.user_state='valid_user_identity'
$permissions=G '/me/permissions'
$report.permissions_http=$permissions.status;$report.permissions_code=$permissions.code
if($permissions.ok -eq $true -and $null -ne $permissions.body.data){
foreach($required in @('pages_manage_posts','pages_show_list','pages_read_engagement')){
$granted=@($permissions.body.data|Where-Object{$_.permission -eq $required -and $_.status -eq 'granted'})
$report.scopes[$required]=($granted.Count -gt 0)
}
}
$a=G '/me/accounts?fields=id,tasks&limit=100'
$report.accounts_http=$a.status;$report.accounts_code=$a.code
if($a.ok -eq $true -and $null -ne $a.body.data){
$report.accounts_complete=(-not $a.body.paging.next)
$accounts=@($a.body.data)
foreach($pair in @(@('Chicago','FACEBOOK_PAGE_ID'),@('LA','LA_FACEBOOK_PAGE_ID'),@('Miami','MIAMI_FACEBOOK_PAGE_ID'),@('NYC','NYC_FACEBOOK_PAGE_ID'))){
$id=[string]$values[$pair[1]]
$page=@($accounts|Where-Object{[string]$_.id -eq $id})
$report.pages+=@{name=$pair[0];listed=($page.Count -eq 1);create_content=($page.Count -eq 1 -and @($page[0].tasks) -contains 'CREATE_CONTENT')}
}
}
}else{$report.user_state=if($m.code -eq 190){'expired_or_invalid'}else{'rejected'};$report.accounts_http=$m.status;$report.accounts_code=$m.code}
}else{$report.user_state='missing'}
Write-Output ('P1_META_AUDIT='+($report|ConvertTo-Json -Compress -Depth 6))
