$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$x=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($x.ok -ne $true -or $x.studio_write_source -ne 'supabase' -or $x.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($n){$z=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1);if(-not $z){throw 'missing_config'};return ([string]$z -split '=',2)[1].Trim().Trim('"',"'")}
$u=(E 'SUPABASE_URL').TrimEnd('/');$k=E 'SUPABASE_SERVICE_ROLE_KEY'
if($u -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $k){throw 'bad_supabase_config'}
$h=@{apikey=$k;Authorization=('Bearer '+$k)}
$ids=@(3317,5324,5588,6261)
$expect=@{'3317'='recjBb0XCZ6LZS7Ud';'5324'='rec4i4XFrcRrnZpZ9';'5588'='recfY50nIzC5Kq4TZ';'6261'='recPQcRRrbGYTsqVW'}
$o=Invoke-RestMethod ($u+'/rest/v1/platform_outputs?output_number=in.(3317,5324,5588,6261)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,do_not_publish,test_run_id,output_caption,output_hashtags,published_at,platform_post_url,error_messages&limit=5') -Headers $h -Method Get -TimeoutSec 25
if(@($o).Count -ne 4){throw 'four_output_identity_missing'}
$owner=[string]$o[0].content_profile_id
foreach($r in $o){
 $n=[string]$r.output_number
 if($ids -notcontains [int]$r.output_number -or $r.airtable_record_id -ne $expect[$n] -or [string]$r.content_profile_id -ne $owner -or $r.platform -ne 'Instagram' -or $r.platform_output_type -ne 'Instagram Reel' -or $r.review_status -ne 'Approved' -or $r.output_status -ne 'Approved for Publishing' -or $r.publish_status -notin @('Publishing','Ready to Publish') -or $r.do_not_publish -ne $false -or $r.test_run_id -or $r.published_at -or $r.platform_post_url){throw ('record_not_reconciliation_candidate_'+$n)}
}
$p=Invoke-RestMethod ($u+'/rest/v1/content_profiles?id=eq.'+$owner+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
if(@($p).Count -ne 1 -or $p[0].market_name -ne 'Miami'){throw 'wrong_market_owner'}
$s=Invoke-RestMethod ($u+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($t in $s){$z=$t.payload;if($null -eq $z -or [string]$z.source -ne 'pipeline' -or [string]$z.Active -ne 'True'){continue};$n=[string]$z.Setting_Name;if(@('MIAMI_META_GRAPH_API_ACCESS_TOKEN','MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $n){if($v.ContainsKey($n)){throw 'duplicate_config'};$v[$n]=[string]$z.Setting_Value}}
$token=[string]$v['MIAMI_META_GRAPH_API_ACCESS_TOKEN'];$account=[string]$v['MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID'];$ver=[string]$v['META_GRAPH_API_VERSION']
if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
if(-not $token -or $account -notmatch '^\d{6,30}$'){throw 'missing_miami_graph_auth'}
$gh=@{Authorization=('Bearer '+$token)}
function G($uri){if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'graph_host_invalid'};return Invoke-RestMethod $uri -Headers $gh -Method Get -TimeoutSec 40}
$acct=G ('https://graph.facebook.com/'+$ver+'/'+$account+'?fields=id')
if([string]$acct.id -ne $account){throw 'provider_account_mismatch'}
$media=@();$next='https://graph.facebook.com/'+$ver+'/'+$account+'/media?fields=id,caption,permalink,timestamp,media_type,media_product_type&limit=100';$pages=0
while($next -and $pages -lt 5){$page=G $next;if($null -eq $page.data){throw 'media_history_incomplete'};$media+=@($page.data);$pages++;$next=[string]$page.paging.next}
if($next){throw 'history_over_scan_cap_inconclusive'}
function N([string]$v){return ([regex]::Replace($v,'\s+',' ').Trim()).ToLowerInvariant()}
$out=@()
foreach($r in $o){
 $c=([string]$r.output_caption).Trim();$tags=([string]$r.output_hashtags).Trim();$full=if($tags){$c+[Environment]::NewLine+[Environment]::NewLine+$tags}else{$c};$full=N $full
 if($full.Length -lt 60){throw 'caption_short_ambiguous'}
 $prefix=$full.Substring(0,[Math]::Min(95,$full.Length))
 $matches=@($media|Where-Object{$_.caption -and ((N ([string]$_.caption)) -eq $full -or (N ([string]$_.caption)).StartsWith($prefix))}|ForEach-Object{@{id=[string]$_.id;permalink=[string]$_.permalink;timestamp=[string]$_.timestamp;media_type=[string]$_.media_type;media_product_type=[string]$_.media_product_type}})
 $out+=@{output=[int]$r.output_number;original_publish_status=[string]$r.publish_status;public_candidates=$matches}
}
Write-Output ('P1_MIAMI_IG_REEL_PUBLIC_AUDIT='+(@{read_only=$true;account_verified=$true;complete_media_scan=$true;scanned=$media.Count;pages=$pages;results=$out;provider_writes=0;output_writes=0}|ConvertTo-Json -Compress -Depth 7))
