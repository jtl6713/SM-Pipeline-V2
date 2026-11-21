$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$x=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($x.ok -ne $true -or $x.studio_write_source -ne 'supabase' -or $x.studio_runner_output_read_source -ne 'supabase' -or $x.supabase_pipeline_writes -ne $true){throw 'invalid_source_authority'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($n){$z=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1);if(-not $z){throw 'missing_config'};return ([string]$z -split '=',2)[1].Trim().Trim('"',"'")}
$u=(E 'SUPABASE_URL').TrimEnd('/')
$k=E 'SUPABASE_SERVICE_ROLE_KEY'
$secret=E 'PIPELINE_RUNNER_SHARED_SECRET'
if($u -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $k -or -not $secret){throw 'missing_authority'}
$h=@{apikey=$k;Authorization=('Bearer '+$k)}
$rows=Invoke-RestMethod ($u+'/rest/v1/platform_outputs?output_number=eq.9855&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,ig_carousel_status,do_not_publish,auto_publish_enabled,scheduled_post_date,output_caption,output_hashtags,published_at,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25
if(@($rows).Count -ne 1){throw 'not_one_original_output'}
$o=$rows[0];$b=$o.error_messages;$parent='18134569969783117';$rid='reccfGD1hDBiG6tIV'
if($o.airtable_record_id -ne $rid -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.ig_carousel_status -ne 'Parent Ready' -or $o.do_not_publish -ne $false -or $o.auto_publish_enabled -ne $true -or $o.published_at -or $o.platform_post_url -or [string]$b.'IG_Carousel_Parent_Container_ID' -ne $parent -or [string]$b.'IG_Carousel_Parent_Status' -ne 'FINISHED' -or [string]$b.'IG_Carousel_Last_Completed_Stage' -ne 'AP3P' -or [string]$b.'IG_Carousel_Published_Media_ID' -or [string]$b.'Platform_Post_ID' -or [string]$b.'IG_Carousel_Publish_Attempt_Count' -or [string]$b.'Publish_Locked_At' -or [string]$b.'Publish_Locked_By'){throw 'state_or_id_not_eligible'}
if(-not $o.scheduled_post_date -or [DateTimeOffset]::Parse([string]$o.scheduled_post_date) -gt [DateTimeOffset]::UtcNow){throw 'schedule_hold'}
$p=Invoke-RestMethod ($u+'/rest/v1/content_profiles?id=eq.'+$o.content_profile_id+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
if(@($p).Count -ne 1 -or $p[0].market_name -ne 'New York City'){throw 'profile_owner_unverified'}
$s=Invoke-RestMethod ($u+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($t in $s){$z=$t.payload;if($null -eq $z -or [string]$z.source -ne 'pipeline' -or [string]$z.Active -ne 'True'){continue};$n=[string]$z.Setting_Name;if(@('NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $n){if($v.ContainsKey($n)){throw 'duplicate_setting'};$v[$n]=[string]$z.Setting_Value}}
$token=[string]$v['NYC_META_GRAPH_API_ACCESS_TOKEN'];$acct=[string]$v['NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID'];$ver=[string]$v['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $acct -notmatch '^\d{6,30}$'){throw 'meta_auth_unverified'}
$gh=@{Authorization=('Bearer '+$token)}
function G($uri){if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'graph_host_error'};return Invoke-RestMethod $uri -Headers $gh -Method Get -TimeoutSec 40}
$accountResult=G ('https://graph.facebook.com/'+$ver+'/'+$acct+'?fields=id')
$parentResult=G ('https://graph.facebook.com/'+$ver+'/'+$parent+'?fields=id,status_code')
if([string]$accountResult.id -ne $acct -or [string]$parentResult.id -ne $parent -or [string]$parentResult.status_code -ne 'FINISHED'){throw 'graph_owner_or_parent_not_finished'}
$caption=([string]$o.output_caption).Trim();$tags=([string]$o.output_hashtags).Trim()
$full=if($tags){$caption+[Environment]::NewLine+[Environment]::NewLine+$tags}else{$caption}
function N([string]$str){return ([regex]::Replace($str,'\s+',' ').Trim()).ToLowerInvariant()}
$full=N $full
if($full.Length -lt 60){throw 'caption_not_unique_enough'}
$prefix=$full.Substring(0,[Math]::Min(95,$full.Length))
$media=@();$next='https://graph.facebook.com/'+$ver+'/'+$acct+'/media?fields=id,caption,permalink,timestamp,media_type&limit=100';$pages=0
while($next -and $pages -lt 5){$page=G $next;if($null -eq $page.data){throw 'media_history_incomplete'};$media+=@($page.data);$pages++;$next=[string]$page.paging.next}
if($next){throw 'media_history_pagination_incomplete'}
$dupes=@($media|Where-Object{[string]$_.media_type -eq 'CAROUSEL_ALBUM' -and $_.caption -and ((N ([string]$_.caption)) -eq $full -or (N ([string]$_.caption)).StartsWith($prefix))})
if($dupes.Count){throw 'duplicate_public_carousel_candidate_stop'}
$eid='recP12340AP4C9855A';$ek='P1-2340:9855:single-media-publish-guard-v1'
$ev=@(@{airtable_record_id=$eid;event_key=$ek;outcome='public_media_publish_dispatch_fenced';output_record_id=$rid;output_number=9855;fields=@{Event_Key=$ek;Output_ID=9855;Output_Record_ID=$rid;Platform='Instagram';Output_Type='Instagram Carousel';Outcome='public_media_publish_dispatch_fenced';Actor='P1 #2340 bounded approved publication';Verified_At=[DateTime]::UtcNow.ToString('o');Details_JSON='{"owner_verified":true,"parent_id":"18134569969783117","public_duplicates":0,"max_public_publish_calls":1}'}})|ConvertTo-Json -Compress -Depth 8
$f=Invoke-RestMethod ($u+'/rest/v1/quality_agent_recovery_events') -Method Post -Headers ($h+@{Prefer='return=representation'}) -ContentType 'application/json' -Body $ev -TimeoutSec 25
if(@($f).Count -ne 1 -or [string]$f[0].event_key -ne $ek){throw 'durable_unique_fence_not_confirmed'}
$r=@{output=9855;preflight='verified_no_recent_duplicate';fence_created=$true;media_scanned=$media.Count;public_publish_stage_calls=0;finalize_stage_calls=0;stage_status='not_called';persisted_media_id='';final_url=''}
$body=@{output_record_id=$rid;idempotency_key=$ek;extra=@{dry_run=$false}}|ConvertTo-Json -Compress
try{$r.public_publish_stage_calls=1;$a=Invoke-RestMethod 'http://127.0.0.1:3350/stages/ap4c' -Method Post -Headers @{'X-Pipeline-Secret'=$secret} -ContentType 'application/json' -Body $body -TimeoutSec 120;$r.stage_status=[string]$a.status;$r.stage_media_id=[string]$a.details.run.media_id}catch{$r.stage_status='uncertain_no_replay_without_provider_reconciliation'}
try{$a=Invoke-RestMethod ($u+'/rest/v1/platform_outputs?output_number=eq.9855&select=airtable_record_id,ig_carousel_status,publish_status,platform_post_url,error_messages&limit=2') -Headers $h -Method Get -TimeoutSec 25;if(@($a).Count -eq 1 -and $a[0].airtable_record_id -eq $rid){$r.persisted_media_id=[string]$a[0].error_messages.'IG_Carousel_Published_Media_ID';$r.persisted_ig_stage=[string]$a[0].ig_carousel_status;$r.final_url=[string]$a[0].platform_post_url}}catch{$r.readback='unavailable'}
if($r.persisted_media_id -and $r.persisted_ig_stage -eq 'Publishing' -and -not $r.final_url){try{$r.finalize_stage_calls=1;$fin=Invoke-RestMethod 'http://127.0.0.1:3350/stages/ap5c' -Method Post -Headers @{'X-Pipeline-Secret'=$secret} -ContentType 'application/json' -Body $body -TimeoutSec 120;$r.finalize_stage_status=[string]$fin.status;$r.finalize_published=[string]$fin.details.run.published}catch{$r.finalize_stage_status='uncertain_read_only_finalize'}}
Write-Output ('P1_IG_AP4C_CANARY='+($r|ConvertTo-Json -Compress -Depth 6))
