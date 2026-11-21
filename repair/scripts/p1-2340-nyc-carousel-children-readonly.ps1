$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'source_not_supabase'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_missing'}
function EnvValue($name){
 $line=@(Get-Content $envfile|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
 if(-not $line){throw 'supabase_env_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$key=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'unsafe_supabase_source'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$ids=@('18133932856783117','18133932877783117','18133932916783117','18133932955783117')
$o=@(Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.9899&select=airtable_record_id,output_number,content_profile_id,platform,platform_output_type,publish_status,ig_carousel_status,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 20)
if($o.Count -ne 1 -or $o[0].airtable_record_id -ne 'recjtnU9qXp8BcGvn' -or $o[0].platform -ne 'Instagram' -or $o[0].ig_carousel_status -ne 'Children Processing'){throw 'output_state_drift'}
$p=@(Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$o[0].content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 20)
if($p.Count -ne 1 -or $p[0].market_name -ne 'New York City'){throw 'profile_ownership_drift'}
$joined=$ids -join ','
$slides=@(Invoke-RestMethod ($url+'/rest/v1/carousel_slides?ig_child_container_id=in.('+$joined+')&select=ig_child_container_id,current_order,fields,deleted_from_carousel&limit=10') -Headers $h -Method Get -TimeoutSec 20)
if($slides.Count -ne 4){throw 'incomplete_child_receipts'}
foreach($s in $slides){
 if($ids -notcontains [string]$s.ig_child_container_id -or [string]$s.fields.'PO_Output_ID'[0] -ne '9899' -or [string]$s.fields.'Review Status' -ne 'Final Approved' -or $s.deleted_from_carousel -eq $true){throw 'child_identity_or_approval_drift'}
}
$settings=@(Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 20)
$v=@{}
foreach($item in $settings){
 $row=$item.payload
 if($null -eq $row -or [string]$row.source -ne 'pipeline' -or [string]$row.Active -ne 'True'){continue}
 $name=[string]$row.Setting_Name
 if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){
  if($v.ContainsKey($name)){throw 'duplicated_setting'}
  $v[$name]=[string]$row.Setting_Value
 }
}
$token=[string]$v['NYC_META_GRAPH_API_ACCESS_TOKEN']
$account=[string]$v['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$ver=[string]$v['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'owned_meta_identity_unavailable'}
function G($id,$fields){
 try{
 $r=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Method Get -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -TimeoutSec 25
 return @{ok=$true;http=200;id=[string]$r.id;status=[string]$r.status_code}
 }catch{
 $code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{}
 return @{ok=$false;http=$code;id='';status=''}
 }
}
$owner=G $account 'id'
if(-not $owner.ok -or $owner.id -ne $account){throw 'meta_owned_account_get_unverified'}
$report=@{read_only=$true;provider_operations='GET only';output_writes=0;provider_writes=0;output_number=9899;owner_verified=$true;original_children=4;children=@()}
foreach($id in $ids){
 $response=G $id 'id,status_code'
 $report.children+=@{container_id=$id;get_ok=$response.ok;http=$response.http;exact_id=($response.id -eq $id);status=$response.status}
}
Write-Output ('P1_IG_CHILD_AUDIT='+($report|ConvertTo-Json -Compress -Depth 6))
