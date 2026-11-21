$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$health=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase' -or $health.supabase_pipeline_writes -ne $true){throw 'supabase_authority_required'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($name){$x=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')}|Select-Object -Last 1);if(-not $x){throw 'held'};return ([string]$x -split '=',2)[1].Trim().Trim('"',"'")}
$url=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY';$runner=E 'PIPELINE_RUNNER_SHARED_SECRET'
if($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key -or -not $runner){throw 'held'}
$h=@{apikey=$key;Authorization=('Bearer '+$key)}
$targets=@(
@{n=3224;rid='recqzdGz6ghwgIzlK';market='Chicago';prefix=''},
@{n=1868;rid='recyS0BqWsDYjYQTU';market='Los Angeles';prefix='LA_'},
@{n=2561;rid='recSRDqJFziknzWTz';market='Los Angeles';prefix='LA_'},
@{n=3101;rid='recIg09qRus4Jc6IS';market='Los Angeles';prefix='LA_'},
@{n=4069;rid='recfJXSp7zkf5dyoI';market='Los Angeles';prefix='LA_'},
@{n=2859;rid='recsS0EQuhCTgDe2e';market='Miami';prefix='MIAMI_'},
@{n=3029;rid='recy92FHMlUO1I0oF';market='Miami';prefix='MIAMI_'},
@{n=4940;rid='recyvWA9XWufpP1PI';market='Miami';prefix='MIAMI_'}
)
$nums='(3224,1868,2561,3101,4069,2859,3029,4940)'
$rows=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?output_number=in.'+$nums+'&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,publish_method,auto_publish_enabled,do_not_publish,published_at,scheduled_post_date,platform_post_url,publish_asset_url,publish_next_retry_at,updated_at,error_messages&limit=9') -Headers $h -Method Get -TimeoutSec 25
if(@($rows).Count -ne 8){throw 'held'}
$profiles=Invoke-RestMethod ($url+'/rest/v1/content_profiles?select=id,market_name&limit=10') -Headers $h -Method Get -TimeoutSec 25
$settings=Invoke-RestMethod ($url+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($s in $settings){$p=$s.payload;if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue};$n=[string]$p.Setting_Name;if($n -match '^(LA_|MIAMI_)?(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN)$' -or $n -eq 'META_GRAPH_API_VERSION'){if($v.ContainsKey($n)){throw 'held'};$v[$n]=[string]$p.Setting_Value}}
$ver=[string]$v['META_GRAPH_API_VERSION'];if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
foreach($prefix in @('','LA_','MIAMI_')){
$id=[string]$v[($prefix+'INSTAGRAM_BUSINESS_ACCOUNT_ID')]
$token=[string]$v[($prefix+'META_GRAPH_API_ACCESS_TOKEN')]
if($id -notmatch '^\d{6,30}$' -or -not $token){throw 'held'}
$res=Invoke-RestMethod ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id') -Headers @{Authorization=('Bearer '+$token)} -Method Get -TimeoutSec 35
if([string]$res.id -ne $id){throw 'held'}
}
$report=@();$stages=0
foreach($t in $targets){
$state='blocked_preflight';$called=0;$container='';
try{
$matches=@($rows|Where-Object{[int]$_.output_number -eq $t.n})
if($matches.Count -ne 1){throw 'held'}
$o=$matches[0];$b=$o.error_messages
$p=@($profiles|Where-Object{[string]$_.id -eq [string]$o.content_profile_id})
if($p.Count -ne 1 -or $p[0].market_name -ne $t.market){throw 'held'}
if($o.airtable_record_id -ne $t.rid -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Story' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_method -ne 'Automated' -or $o.auto_publish_enabled -ne $true -or $o.do_not_publish -ne $false -or $o.publish_status -notin @('Ready to Schedule','Ready to Publish') -or $o.published_at -or $o.platform_post_url){throw 'held'}
if(-not $o.scheduled_post_date -or [DateTimeOffset]::Parse([string]$o.scheduled_post_date) -gt [DateTimeOffset]::UtcNow){throw 'held'}
if($o.publish_next_retry_at -and [DateTimeOffset]::Parse([string]$o.publish_next_retry_at) -gt [DateTimeOffset]::UtcNow){throw 'held'}
if([string]$b.'IG_Story_Status' -ne 'Ready' -or [string]$b.'IG_Story_Container_ID' -or [string]$b.'IG_Story_Post_ID' -or [string]$b.'Platform_Post_ID' -or [string]$b.'IG_Story_Published_At' -or [string]$b.'IG_Story_Attempt_Count' -or [string]$b.'Publish_Locked_At' -or [string]$b.'Publish_Locked_By' -or [string]$b.'Replace_Transaction_ID'){throw 'held'}
$asset=[string]$b.'IG_Story_Asset_URL';if(-not $asset){$asset=[string]$o.publish_asset_url}
if($asset -notmatch '^https://media\.chicagoshining\.com/[^?]+\.mp4$'){throw 'held'}
$check=Invoke-WebRequest $asset -Method Head -UseBasicParsing -TimeoutSec 25
if($check.StatusCode -ne 200 -or [string]$check.Headers.'Content-Type' -notmatch '(video/|application/octet-stream)'){throw 'held'}
$eventKey='P1-2340:'+($t.n)+':one-native-story-create-v1'
$eventId='recP12340IGS'+($t.n)+'A'
$event=@(@{airtable_record_id=$eventId;event_key=$eventKey;outcome='story_create_one_time_reserved';output_record_id=$t.rid;output_number=$t.n;fields=@{Event_Key=$eventKey;Output_ID=$t.n;Outcome='story_create_one_time_reserved';Verified_At=[DateTime]::UtcNow.ToString('o')}})|ConvertTo-Json -Compress -Depth 8
$saved=Invoke-RestMethod ($url+'/rest/v1/quality_agent_recovery_events') -Method Post -Headers ($h+@{Prefer='return=representation'}) -ContentType 'application/json' -Body $event -TimeoutSec 25
if(@($saved).Count -ne 1 -or $saved[0].event_key -ne $eventKey){throw 'held'}
$state='fenced_not_dispatched'
$bag=@{};if($b){foreach($prop in $b.PSObject.Properties){$bag[$prop.Name]=$prop.Value}}
$bag['Publish_Locked_At']=[DateTime]::UtcNow.ToString('o');$bag['Publish_Locked_By']='P1_2340_STORY_BATCH'
$patch=@{publish_status='Ready to Publish';publish_retry_eligible=$false;error_messages=$bag}|ConvertTo-Json -Compress -Depth 80
$filter='output_number=eq.'+$t.n+'&airtable_record_id=eq.'+$t.rid+'&publish_status=eq.'+[uri]::EscapeDataString([string]$o.publish_status)+'&updated_at=eq.'+[uri]::EscapeDataString([string]$o.updated_at)
$changed=Invoke-RestMethod ($url+'/rest/v1/platform_outputs?'+$filter) -Method Patch -Headers ($h+@{Prefer='return=representation'}) -ContentType 'application/json' -Body $patch -TimeoutSec 30
if(@($changed).Count -ne 1){throw 'held'}
$stageBody=@{output_record_id=$t.rid;extra=@{dry_run=$false}}|ConvertTo-Json -Compress
$state='provider_create_ambiguous_no_replay';$called=1;$stages++
$stage=Invoke-RestMethod 'http://127.0.0.1:3350/stages/ap1_igs' -Method Post -Headers @{'X-Pipeline-Secret'=$runner} -ContentType 'application/json' -Body $stageBody -TimeoutSec 110
$container=[string]$stage.details.run.container_id
$state=if($stage.status -eq 'ok' -and $container -match '^\d+$'){'created_container_pending_poll'}else{'stage_not_confirmed_do_not_replay'};if($state -eq 'created_container_pending_poll'){Start-Sleep -Seconds 5}

}catch{}
$report+=@{output=$t.n;state=$state;stage_calls=$called;container_id=$container}
}
Write-Output ('P1_IG_STORY_BATCH_CREATE='+(@{targets=8;created=@($report|Where-Object{$_.state -eq 'created_container_pending_poll'}).Count;stage_calls=$stages;one_time_fences_required=$true;public_media_publish_calls=0;results=$report}|ConvertTo-Json -Compress -Depth 6))
