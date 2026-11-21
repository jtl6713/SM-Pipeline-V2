$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$h=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($h.ok -ne $true -or $h.studio_write_source -ne 'supabase' -or $h.studio_runner_output_read_source -ne 'supabase'){throw 'source_not_supabase'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_env_missing'}
function E($name){
 $line=@(Get-Content $envfile|Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1)
 if(-not $line){throw 'required_config_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(E 'SUPABASE_URL').TrimEnd('/')
$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'invalid_supabase_config'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
$o=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=eq.9890&select=airtable_record_id,output_number,content_profile_id,platform,platform_output_type,publish_status,output_status,review_status,ig_carousel_status,error_messages,platform_post_url,published_at&limit=2') -Headers $headers -Method Get -TimeoutSec 25
if(@($o).Count -ne 1){throw 'original_output_unverified'}
$row=$o[0]
$parent='18134572765783117'
if($row.airtable_record_id -ne 'rec7uB7WQhZLyk28T' -or $row.platform -ne 'Instagram' -or $row.platform_output_type -ne 'Instagram Carousel' -or $row.review_status -ne 'Approved' -or $row.output_status -ne 'Approved for Publishing' -or $row.publish_status -ne 'Ready to Publish' -or $row.ig_carousel_status -ne 'Parent Processing' -or [string]$row.error_messages.'IG_Carousel_Parent_Container_ID' -ne $parent -or [string]$row.error_messages.'IG_Carousel_Last_Completed_Stage' -ne 'AP3C' -or $row.platform_post_url -or $row.published_at){throw 'exact_parent_state_changed'}
$profile=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$row.content_profile_id+'&select=market_name&limit=2') -Headers $headers -Method Get -TimeoutSec 25
if(@($profile).Count -ne 1 -or $profile[0].market_name -ne 'New York City'){throw 'wrong_owner'}
$events=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events?airtable_record_id=eq.recP12340AP3C9890A&select=event_key,output_record_id&limit=2') -Headers $headers -Method Get -TimeoutSec 25
if(@($events).Count -ne 1 -or $events[0].event_key -ne 'P1-2340:9890:single-parent-create-guard-v1' -or $events[0].output_record_id -ne 'rec7uB7WQhZLyk28T'){throw 'durable_parent_fence_missing'}
$settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $headers -Method Get -TimeoutSec 25
$values=@{}
foreach($item in $settings){
 $v=$item.payload
 if($null -eq $v -or [string]$v.source -ne 'pipeline' -or [string]$v.Active -ne 'True'){continue}
 $name=[string]$v.Setting_Name
 if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){
  if($values.ContainsKey($name)){throw 'duplicate_active_setting'}
  $values[$name]=[string]$v.Setting_Value
 }
}
$token=[string]$values['NYC_META_GRAPH_API_ACCESS_TOKEN']
$account=[string]$values['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$ver=[string]$values['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'meta_auth_missing'}
function G($id,$fields){
 try{
  $x=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 30
  return @{ok=$true;http=200;exact=([string]$x.id -eq $id);status=[string]$x.status_code}
 }catch{
  $code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{}
  return @{ok=$false;http=$code;exact=$false;status='unverified'}
 }
}
$owner=G $account 'id'
if(-not $owner.ok -or -not $owner.exact){throw 'provider_owner_not_verified'}
$parentResult=G $parent 'id,status_code'
$report=@{read_only=$true;owner_verified=$true;output_number=9890;existing_parent_id=$parent;parent=$parentResult;output_writes=0;provider_writes=0}
Write-Output ('P1_IG_PARENT_GET='+($report|ConvertTo-Json -Compress -Depth 6))
