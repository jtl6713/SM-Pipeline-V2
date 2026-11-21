$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$z=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($z.ok -ne $true -or $z.studio_write_source -ne 'supabase' -or $z.studio_runner_output_read_source -ne 'supabase'){throw 'supabase_authority_unverified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($n){$v=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1);if(-not $v){throw 'missing_config'};return ([string]$v -split '=',2)[1].Trim().Trim('"',"'")}
$u=(E 'SUPABASE_URL').TrimEnd('/');$k=E 'SUPABASE_SERVICE_ROLE_KEY'
if($u -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $k){throw 'invalid_config'}
$h=@{apikey=$k;Authorization=('Bearer '+$k)}
$targets=@(
 @{n=2671;rid='recHt6lvRITEvEPl9';city='New York City';scope='NYC'},
 @{n=9364;rid='rectxwzckhEpaL8x7';city='Los Angeles';scope='LA'},
 @{n=9370;rid='recU4yME6bLypn37A';city='Los Angeles';scope='LA'}
)
$records=Invoke-RestMethod ($u+'/rest/v1/platform_outputs?output_number=in.(2671,9364,9370)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,do_not_publish,published_at,platform_post_url,output_caption,output_hashtags&limit=4') -Headers $h -Method Get -TimeoutSec 25
if(@($records).Count -ne 3){throw 'record_identity_count_mismatch'}
$owners=@{}
foreach($t in $targets){
 $r=@($records|Where-Object{[int]$_.output_number -eq $t.n})
 if($r.Count -ne 1){throw 'record_nonunique'}
 $o=$r[0]
 if($o.airtable_record_id -ne $t.rid -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Reel' -or $o.review_status -ne 'Approved' -or $o.output_status -ne 'Approved for Publishing' -or $o.publish_status -ne 'Ready to Publish' -or $o.do_not_publish -ne $false -or $o.published_at -or $o.platform_post_url){throw 'record_not_pending'}
 if($owners.ContainsKey($t.scope) -and $owners[$t.scope] -ne [string]$o.content_profile_id){throw 'mixed_profile_for_scope'}
 $owners[$t.scope]=[string]$o.content_profile_id
}
foreach($scope in $owners.Keys){
 $city=if($scope -eq 'LA'){'Los Angeles'}else{'New York City'}
 $p=Invoke-RestMethod ($u+'/rest/v1/content_profiles?id=eq.'+$owners[$scope]+'&select=market_name&limit=2') -Headers $h -Method Get -TimeoutSec 25
 if(@($p).Count -ne 1 -or $p[0].market_name -ne $city){throw 'profile_market_mismatch'}
}
$settings=Invoke-RestMethod ($u+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $h -Method Get -TimeoutSec 25
$v=@{}
foreach($s in $settings){$p=$s.payload;if($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True'){continue};$name=[string]$p.Setting_Name;if(@('LA_META_GRAPH_API_ACCESS_TOKEN','LA_INSTAGRAM_BUSINESS_ACCOUNT_ID','NYC_META_GRAPH_API_ACCESS_TOKEN','NYC_INSTAGRAM_BUSINESS_ACCOUNT_ID','META_GRAPH_API_VERSION') -contains $name){if($v.ContainsKey($name)){throw 'duplicate_setting'};$v[$name]=[string]$p.Setting_Value}}
$ver=[string]$v['META_GRAPH_API_VERSION'];if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
function N([string]$txt){return ([regex]::Replace($txt,'\s+',' ').Trim()).ToLowerInvariant()}
$findings=@()
foreach($scope in @('LA','NYC')){
 $token=[string]$v[($scope+'_META_GRAPH_API_ACCESS_TOKEN')]
 $id=[string]$v[($scope+'_INSTAGRAM_BUSINESS_ACCOUNT_ID')]
 if(-not $token -or $id -notmatch '^\d{6,30}$'){throw 'scope_auth_missing'}
 $gh=@{Authorization=('Bearer '+$token)}
 function G($uri){if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'invalid_graph_url'};for($attempt=0;$attempt -lt 3;$attempt++){try{return Invoke-RestMethod $uri -Headers $gh -Method Get -TimeoutSec 45}catch{if($attempt -ge 2){throw 'meta_read_failed'};Start-Sleep -Seconds (2+$attempt)}}}
 $acct=G ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id')
 if([string]$acct.id -ne $id){throw 'graph_account_not_exact'}
 $media=@();$next='https://graph.facebook.com/'+$ver+'/'+$id+'/media?fields=id,caption,permalink,timestamp,media_type,media_product_type&limit=100';$pages=0
 while($next -and $pages -lt 5){$result=G $next;if($null -eq $result.data){throw 'media_listing_incomplete'};$media+=@($result.data);$pages++;$next=[string]$result.paging.next}
 if($next){throw 'media_listing_exceeds_500_inconclusive'}
 foreach($t in @($targets|Where-Object{$_.scope -eq $scope})){
  $o=@($records|Where-Object{[int]$_.output_number -eq $t.n})[0]
  $caption=([string]$o.output_caption).Trim();$hashtags=([string]$o.output_hashtags).Trim()
  $full=if($hashtags){$caption+[Environment]::NewLine+[Environment]::NewLine+$hashtags}else{$caption};$full=N $full
  if($full.Length -lt 60){throw 'caption_not_unique'}
  $prefix=$full.Substring(0,[Math]::Min(95,$full.Length))
  $hits=@($media|Where-Object{$_.caption -and ((N ([string]$_.caption)) -eq $full -or (N ([string]$_.caption)).StartsWith($prefix))}|ForEach-Object{@{media_id=[string]$_.id;permalink=[string]$_.permalink;timestamp=[string]$_.timestamp;media_type=[string]$_.media_type;product_type=[string]$_.media_product_type}})
  $findings+=@{output=$t.n;scope=$scope;media_scanned=$media.Count;pages=$pages;public_candidates=$hits}
 }
}
Write-Output ('P1_IG_LEGACY_REELS_AUDIT='+(@{read_only=$true;owner_verified=$true;complete_media_scan=$true;provider_writes=0;output_writes=0;results=$findings}|ConvertTo-Json -Compress -Depth 7))
