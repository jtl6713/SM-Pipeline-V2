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
if($name -and $name -match '^(META_LONG_LIVED_USER_ACCESS_TOKEN|FACEBOOK_GRAPH_API_VERSION|FACEBOOK_PAGE_ID|LA_FACEBOOK_PAGE_ID|MIAMI_FACEBOOK_PAGE_ID|NYC_FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN|LA_FACEBOOK_PAGE_ACCESS_TOKEN|MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN|NYC_FACEBOOK_PAGE_ACCESS_TOKEN)$'){
if($values.ContainsKey($name)){throw 'duplicate_active_setting'}
$values[$name]=[string]$p.Setting_Value
}
}
$token=[string]$values['META_LONG_LIVED_USER_ACCESS_TOKEN']
$ver=[string]$values['FACEBOOK_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
$report=@{read_only=$true;provider_operations='GET only';output_writes=0;provider_writes=0;source_rows=$items.Count;user_state='unverified';pages=@();accounts_http=0;accounts_code=0;accounts_complete=$false;permissions_http=0;permissions_code=0;scopes=@{}}
function G($path,$accessToken){
if(-not $accessToken){$accessToken=$token}
try {
$d=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+$path) -Method Get -Headers @{Authorization=('Bearer '+$accessToken);Accept='application/json'} -TimeoutSec 35
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

# GET-only positive matches. No negative Reel delivery proof.
$report.history_status='not_authorized';$report.history_probes=@()
if($report.user_state -eq 'valid_user_identity' -and $report.accounts_complete -eq $true -and $report.scopes['pages_read_engagement'] -eq $true){
 $targets=@(
  @{n=4907;market='Chicago';page='FACEBOOK_PAGE_ID'},
  @{n=5355;market='Los Angeles';page='LA_FACEBOOK_PAGE_ID'},
  @{n=6256;market='Miami';page='MIAMI_FACEBOOK_PAGE_ID'},
  @{n=6076;market='Miami';page='MIAMI_FACEBOOK_PAGE_ID'},
  @{n=5915;market='New York City';page='NYC_FACEBOOK_PAGE_ID'}
 )
 $nums='(4907,5355,6256,6076,5915)'
 $outputs=@(Invoke-RestMethod ($url+'/rest/v1/platform_outputs?select=output_number,platform,content_profile_id,output_title,output_caption&output_number=in.'+$nums+'&limit=10') -Headers $headers -Method Get -TimeoutSec 30)
 $profiles=@(Invoke-RestMethod ($url+'/rest/v1/content_profiles?select=id,market_name&limit=10') -Headers $headers -Method Get -TimeoutSec 30)
 if($outputs.Count -eq 1 -and $outputs[0] -is [array]){$outputs=@($outputs[0])}
 if($profiles.Count -eq 1 -and $profiles[0] -is [array]){$profiles=@($profiles[0])}
 if($outputs.Count -ne 5 -or $profiles.Count -ne 4){throw 'facebook_history_source_incomplete'}
 function Norm([string]$s){return ([regex]::Replace($s.ToLowerInvariant(),'[^\p{L}\p{Nd}]+',' ')).Trim()}
 $report.history_status='positive_matches_only_no_negative_proof'
 foreach($t in $targets){
  $o=@($outputs|Where-Object{[int]$_.output_number -eq [int]$t.n})
  if($o.Count -ne 1 -or [string]$o[0].platform -ne 'Facebook'){throw 'history_target_identity_mismatch'}
  $p=@($profiles|Where-Object{[string]$_.id -eq [string]$o[0].content_profile_id})
  if($p.Count -ne 1 -or [string]$p[0].market_name -ne [string]$t.market){throw 'history_target_owner_mismatch'}
  $pageId=[string]$values[[string]$t.page]
  if($pageId.Length -lt 6 -or $pageId.Length -gt 30 -or $pageId -match '[^0-9]'){throw 'history_page_id_unavailable'}
  $pageToken=[string]$values[([string]$t.page).Replace('_ID','_ACCESS_TOKEN')]
  if(-not $pageToken){throw 'history_page_token_unavailable'}
  $identity=G ('/'+$pageId+'?fields=id') $pageToken
  if($identity.ok -ne $true -or [string]$identity.body.id -ne $pageId){throw 'history_page_token_identity_mismatch'}
  $needles=@()
  foreach($value in @([string]$o[0].output_title,[string]$o[0].output_caption)){
   $v=Norm $value;if($v.Length -ge 35){$needles+= $v.Substring(0,[Math]::Min(75,$v.Length))}
  }
  foreach($edge in @('feed','published_posts')){
   $fields='id,message,created_time'
   $probe=@{output_number=[int]$t.n;market=$t.market;edge=$edge;pages_scanned=0;rows_scanned=0;complete=$false;http_status=0;error_code=0;candidates=@()}
   $after=''
   for($pg=0;$pg -lt 2;$pg++){
    $path='/'+$pageId+'/'+$edge+'?fields='+$fields+'&limit=100'
    if($after){$path+='&after='+[uri]::EscapeDataString($after)}
    $r=G $path $pageToken
    $probe.http_status=$r.status;$probe.error_code=$r.code
    if($r.ok -ne $true -or $null -eq $r.body.data){break}
    $probe.pages_scanned++
    foreach($entry in @($r.body.data)){
     $probe.rows_scanned++
     $hay=Norm ([string]$entry.title+' '+[string]$entry.description+' '+[string]$entry.message)
     foreach($needle in $needles){
      if($hay.Contains($needle)){
       $probe.candidates+=@{provider_id=[string]$entry.id;created_time=[string]$entry.created_time;match_kind='text_candidate_unverified'}
       break
      }
     }
    }
    if(-not $r.body.paging.next){$probe.complete=$true;break}
    $after=[string]$r.body.paging.cursors.after
    if(-not $after){break}
   }
   $report.history_probes+=$probe
  }
 }
}

Write-Output ('P1_META_AUDIT='+($report|ConvertTo-Json -Compress -Depth 6))
