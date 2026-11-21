$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'not_supabase_authoritative'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_config_missing'}
function E($name){
 $line=@(Get-Content $envfile | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1)
 if(-not $line){throw 'required_config_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"',"'")
}
$url=(E 'SUPABASE_URL').TrimEnd('/')
$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'source_config_invalid'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$targets=@(
 @{number=9890;rid='rec7uB7WQhZLyk28T';ids=@('18134415559783117','18134415577783117','18134415640783117','18134415715783117','18134415775783117','18134415793783117','18134415835783117','18134415883783117')},
 @{number=10065;rid='recX2sdcURmfzfqzf';ids=@('18134520607783117','18134520628783117','18134520661783117','18134520697783117')}
)
$parentId='18134569969783117'
$rows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=in.(9855,9890,10065)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,ig_carousel_status,ig_carousel_children_ready_count,error_messages,platform_post_url,published_at&limit=4') -Headers $h -Method Get -TimeoutSec 25
if(@($rows).Count -ne 3){throw 'exact_output_count_changed'}
$parent=@($rows | Where-Object {[int]$_.output_number -eq 9855})
if($parent.Count -ne 1 -or $parent[0].airtable_record_id -ne 'reccfGD1hDBiG6tIV' -or $parent[0].ig_carousel_status -notin @('Parent Processing','Parent Ready') -or [string]$parent[0].error_messages.'IG_Carousel_Parent_Container_ID' -ne $parentId -or $parent[0].platform_post_url -or $parent[0].published_at){throw 'parent_state_or_identity_changed'}
$allIds=New-Object System.Collections.Generic.List[string]
foreach($t in $targets){
 $o=@($rows | Where-Object {[int]$_.output_number -eq $t.number})
 if($o.Count -ne 1 -or $o[0].airtable_record_id -ne $t.rid -or $o[0].platform -ne 'Instagram' -or $o[0].platform_output_type -ne 'Instagram Carousel' -or $o[0].review_status -ne 'Approved' -or $o[0].ig_carousel_status -ne 'Children Ready' -or $o[0].ig_carousel_children_ready_count -ne $t.ids.Count -or $o[0].platform_post_url -or $o[0].published_at){throw 'child_owner_or_stage_changed'}
 foreach($id in $t.ids){$allIds.Add($id)}
}
$ownerId=[string]$parent[0].content_profile_id
foreach($o in $rows){if([string]$o.content_profile_id -ne $ownerId){throw 'mixed_profile_owner'}}
$p=Invoke-RestMethod ($url+'/rest/v1/content_profiles?id=eq.'+$ownerId+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
if(@($p).Count -ne 1 -or $p[0].market_name -ne 'New York City'){throw 'not_nyc_owner'}
$slides=Invoke-RestMethod ($url+'/rest/v1/carousel_slides?ig_child_container_id=in.('+($allIds -join ',')+')&select=ig_child_container_id,current_order,fields,deleted_from_carousel&limit=20') -Headers $h -Method Get -TimeoutSec 25
if(@($slides).Count -ne 12){throw ('original_slide_count_'+@($slides).Count)}
foreach($t in $targets){
 $order=1
 foreach($id in $t.ids){
  $s=@($slides | Where-Object {$_.ig_child_container_id -eq $id})
  if($s.Count -ne 1 -or [string]$s[0].fields.'PO_Output_ID'[0] -ne [string]$t.number -or [int]$s[0].current_order -ne $order -or $s[0].deleted_from_carousel -eq $true -or [string]$s[0].fields.'Review Status' -ne 'Final Approved'){throw 'original_slide_identity_or_order_changed'}
  $order++
 }
}
$settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($item in $settings){
 $row=$item.payload
 if($null -eq $row -or [string]$row.source -ne 'pipeline' -or [string]$row.Active -ne 'True'){continue}
 $name=[string]$row.Setting_Name
 if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){
  if($v.ContainsKey($name)){throw 'duplicate_active_setting'}
  $v[$name]=[string]$row.Setting_Value
 }
}
$token=[string]$v['NYC_META_GRAPH_API_ACCESS_TOKEN']
$account=[string]$v['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID']
$ver=[string]$v['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'meta_owner_credentials_missing'}
function G($id,$fields){
 try{
  $r=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields='+$fields) -Method Get -Headers @{Authorization=('Bearer '+$token)} -TimeoutSec 30
  return @{ok=$true;http=200;exact=([string]$r.id -eq $id);status=[string]$r.status_code}
 }catch{
  $code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{}
  return @{ok=$false;http=$code;exact=$false;status='unverified'}
 }
}
$acct=G $account 'id'
if(-not $acct.ok -or -not $acct.exact){throw 'meta_owning_account_not_verified'}
$report=@{read_only=$true;owner_verified=$true;provider_writes=0;output_writes=0;results=@()}
$parentResult=G $parentId 'id,status_code'
$report.results+=@{output=9855;kind='existing_parent';container_id=$parentId;result=$parentResult}
foreach($t in $targets){
 $results=@()
 foreach($id in $t.ids){
  $results+=@{container_id=$id;result=(G $id 'id,status_code')}
 }
 $report.results+=@{output=$t.number;kind='original_children';children=$results}
}
Write-Output ('P1_IG_BATCH_AUDIT='+($report|ConvertTo-Json -Compress -Depth 9))
