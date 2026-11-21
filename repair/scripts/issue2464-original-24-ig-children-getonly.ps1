# Issue #2464: original 24 Instagram carousel child containers.
# GET-only, exact source/owner fenced, no publishing or Supabase mutations.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_not_confirmed'}
$envfile=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if(-not(Test-Path $envfile)){throw 'runner_environment_missing'}
function EnvValue([string]$name){
 $rows=@(Get-Content $envfile | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1)
 if($rows.Count -ne 1){throw 'runtime_config_missing'}
 return ([string]$rows[0] -split '=',2)[1].Trim().Trim('"',"'")
}
$base=(EnvValue 'SUPABASE_URL').TrimEnd('/')
$key=EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if($base -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key){throw 'production_identity_mismatch'}
$headers=@{apikey=$key;Authorization=('Bearer '+$key)}
function SourceGet([string]$path){
 if($path -notmatch '^/rest/v1/(platform_outputs|carousel_slides|content_profiles|engagement_settings)\?'){throw 'unapproved_source_path'}
 return Invoke-RestMethod ($base+$path) -Headers $headers -Method Get -TimeoutSec 40
}
$expected=@{
 8128=@{record='recHQwaHW6hO38tct';profile='Miami';count=4;prefix='MIAMI_'}
 8138=@{record='recl1JDd3hoyCOQLM';profile='New York City';count=4;prefix='NYC_'}
 8357=@{record='recSiZREAQuoicqm7';profile='Miami';count=8;prefix='MIAMI_'}
 8417=@{record='recHS9wbhrIEiwNsM';profile='New York City';count=8;prefix='NYC_'}
}
$numbers='8128,8138,8357,8417'
$select='output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,ig_carousel_status,do_not_publish,auto_publish_enabled,publish_retry_eligible,published_at,platform_post_url,error_messages'
$outputs=@(SourceGet ('/rest/v1/platform_outputs?select='+$select+'&output_number=in.('+$numbers+')&limit=6'))
if($outputs.Count -ne 4 -or @($outputs|Select-Object -ExpandProperty output_number -Unique).Count -ne 4){throw 'four_original_outputs_not_found'}
$profiles=@(SourceGet '/rest/v1/content_profiles?select=id,market_name&limit=25')
$markets=@{};foreach($p in $profiles){$markets[[string]$p.id]=[string]$p.market_name}
$allSlides=@();$source=@();$sourceIds=@{}
foreach($o in $outputs){
 $num=[int]$o.output_number;$spec=$expected[$num]
 if($null -eq $spec -or $o.airtable_record_id -ne $spec.record -or [string]$markets[[string]$o.content_profile_id] -ne $spec.profile -or
 $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or
 $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.ig_carousel_status -ne 'Retry Pending' -or
 $o.do_not_publish -ne $true -or $o.auto_publish_enabled -ne $false -or $o.publish_retry_eligible -ne $false -or $o.published_at -or $o.platform_post_url){
  throw 'held_original_output_identity_drift'
 }
 if([string]$o.error_messages.IG_Carousel_Error_Message -notmatch 'QA-IG-AP3C-AMBIGUOUS-PARENT.*HTTP 500'){throw 'original_parent_ambiguity_changed'}
 $links=@($o.error_messages.'Carousel Slides')
 if($links.Count -ne $spec.count -or @($links|Select-Object -Unique).Count -ne $spec.count){throw 'original_slide_links_changed'}
 foreach($link in $links){
  if([string]$link -notmatch '^rec[A-Za-z0-9]{14}$' -or $sourceIds.ContainsKey([string]$link)){throw 'duplicate_or_invalid_original_slide_id'}
  $sourceIds[[string]$link]=$num
 }
 $source+=@{output=$num;profile=$spec.profile;linked_original_slides=$links.Count;held=$true}
}
$join=@($sourceIds.Keys|Sort-Object) -join ','
$slides=@(SourceGet ('/rest/v1/carousel_slides?select=airtable_record_id,current_order,deleted_from_carousel,ig_child_container_id,fields&airtable_record_id=in.('+$join+')&limit=30'))
if($slides.Count -ne 24 -or @($slides|Select-Object -ExpandProperty airtable_record_id -Unique).Count -ne 24){throw 'missing_or_duplicate_original_slides'}
$children=@();$seen=@{}
foreach($s in $slides){
 $originalId=[string]$s.airtable_record_id;$num=[int]$sourceIds[$originalId]
 if(-not $sourceIds.ContainsKey($originalId)){throw 'unrecognized_slide'}
 $spec=$expected[$num]
 $order=[int]$s.current_order
 $child=[string]$s.ig_child_container_id
 $url=[string]$s.fields.'Asset_4x5_Public_URL'
 if($s.deleted_from_carousel -eq $true -or $order -lt 1 -or $order -gt $spec.count -or
 [string]$s.fields.'PO_Output_ID'[0] -ne [string]$num -or [string]$s.fields.'Review Status' -ne 'Final Approved' -or
 [string]$s.fields.'Asset_4x5_Public_Status' -ne 'Ready' -or $url -notmatch '^https://media\.chicagoshining\.com/' -or
 $child -notmatch '^\d{15,22}$' -or $seen.ContainsKey($child)){throw 'original_slide_or_child_identity_drift'}
 $seen[$child]=$true
 $children+=@{output=$num;profile=$spec.profile;slide=$originalId;order=$order;container_id=$child;saved_status=[string]$s.fields.'IG_Child_Container_Status'}
}
foreach($num in @(8128,8138,8357,8417)){
 $ordered=@($children|Where-Object{$_.output -eq $num}|Sort-Object order)
 if($ordered.Count -ne $expected[$num].count){throw 'original_gallery_size_changed'}
 for($i=0;$i -lt $ordered.Count;$i++){if($ordered[$i].order -ne ($i+1)){throw 'original_gallery_order_changed'}}
}
if($children.Count -ne 24){throw 'original_24_count_mismatch'}
$settings=@(SourceGet '/rest/v1/engagement_settings?select=payload&limit=500')
if($settings.Count -ge 500){throw 'settings_pagination_incomplete'}
$config=@{}
foreach($item in $settings){
 $p=$item.payload
 if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue}
 $name=[string]$p.Setting_Name
 if($name -match '^(NYC_|MIAMI_)(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN)$' -or $name -eq 'META_GRAPH_API_VERSION'){
  if($config.ContainsKey($name)){throw 'ambiguous_owner_settings'}
  $config[$name]=[string]$p.Setting_Value
 }
}
$version=[string]$config['META_GRAPH_API_VERSION']
if($version -notmatch '^v\d{1,2}\.\d$'){$version='v26.0'}
$script:providerGets=0
function GraphRead([string]$id,[string]$token,[string]$fields){
 if($id -notmatch '^\d{6,30}$' -or -not $token -or @('id','id,status_code') -notcontains $fields){throw 'unsafe_provider_get_scope'}
 $script:providerGets++
 if($script:providerGets -gt 26){throw 'bounded_get_budget_exceeded'}
 $uri='https://graph.facebook.com/'+$version+'/'+$id+'?fields='+$fields
 try{
  $r=Invoke-RestMethod -Uri $uri -Headers @{Authorization=('Bearer '+$token);Accept='application/json'} -Method Get -TimeoutSec 35
  return @{ok=$true;http=200;id=[string]$r.id;status=[string]$r.status_code}
 }catch{
  $http=0;try{$http=[int]$_.Exception.Response.StatusCode}catch{}
  return @{ok=$false;http=$http;id='';status=''}
 }
}
$owners=@();$ownerOk=@{}
foreach($name in @('Miami','New York City')){
 $prefix=if($name -eq 'Miami'){'MIAMI_'}else{'NYC_'}
 $token=[string]$config[$prefix+'META_GRAPH_API_ACCESS_TOKEN']
 $id=[string]$config[$prefix+'INSTAGRAM_BUSINESS_ACCOUNT_ID']
 $r=GraphRead $id $token 'id'
 $ok=($r.ok -and $r.id -eq $id)
 $owners+=@{profile=$name;identity_get_http=$r.http;confirmed=$ok}
 $ownerOk[$name]=$ok
}
$results=@()
foreach($child in @($children|Sort-Object output,order)){
 $prefix=$expected[$child.output].prefix
 $token=[string]$config[$prefix+'META_GRAPH_API_ACCESS_TOKEN']
 if($ownerOk[$child.profile]){
  $response=GraphRead $child.container_id $token 'id,status_code'
  $match=($response.ok -and $response.id -eq $child.container_id)
  $outcome=if($match){'exact_id_provider_read'}elseif($response.http -eq 400 -or $response.http -eq 404){'not_accessible_or_expired_no_negative_proof'}else{'provider_inconclusive'}
 }else{
  $response=@{http=0;status=''};$match=$false;$outcome='owner_not_verified'
 }
 $results+=@{output=$child.output;profile=$child.profile;slide_order=$child.order;original_slide_id=$child.slide;original_child_id=$child.container_id;source_saved_status=$child.saved_status;provider_http=$response.http;provider_exact_id=$match;provider_status=$response.status;disposition=$outcome;parent_creation_resolved=$false;retry_authorized=$false}
}
$report=@{
 version='issue2464_original_24_child_getonly_v1';checked_at=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
 read_only=$true;source='production_supabase';provider_writes=0;output_writes=0;publish_calls=0;airtable_operations=0
 expected_children=24;actual_original_children=$children.Count;provider_get_calls=$script:providerGets
 owner_scopes=$owners;source_gallery_checks=$source;children=$results
 parent_receipt_reconciled=$false;any_rearm_authorized=$false
}
Write-Output ('ISSUE2464_ORIGINAL_CHILD_GET_AUDIT='+($report|ConvertTo-Json -Compress -Depth 7))
