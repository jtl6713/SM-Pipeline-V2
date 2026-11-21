$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$hth=Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if($hth.ok -ne $true -or $hth.studio_write_source -ne 'supabase' -or $hth.studio_runner_output_read_source -ne 'supabase'){throw 'read_authority_not_verified'}
$ef=Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
function E($n){$v=@(Get-Content $ef|Where-Object{$_ -match ('^\s*'+[regex]::Escape($n)+'\s*=')}|Select-Object -Last 1);if(-not $v){throw 'missing_config'};return ([string]$v -split '=',2)[1].Trim().Trim('"',"'")}
$u=(E 'SUPABASE_URL').TrimEnd('/');$key=E 'SUPABASE_SERVICE_ROLE_KEY'
if($u -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key){throw 'invalid_source'}
$sh=@{apikey=$key;Authorization=('Bearer '+$key)}
$target=@(
 @{n=4907;rid='recZuVJDrKje6npZH';city='Chicago';prefix=''},
 @{n=5355;rid='recSYdKYKVrKXMXSG';city='Los Angeles';prefix='LA_'},
 @{n=6256;rid='recBYTWXncz0iIF8M';city='Miami';prefix='MIAMI_'},
 @{n=6076;rid='recjF5YXy1gbF9saz';city='Miami';prefix='MIAMI_'},
 @{n=5915;rid='reclLhI0NaIYuRsgU';city='New York City';prefix='NYC_'}
)
$o=Invoke-RestMethod ($u+'/rest/v1/platform_outputs?output_number=in.(4907,5355,6256,6076,5915)&select=output_number,airtable_record_id,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,published_at,platform_post_url,output_caption,output_title&limit=6') -Headers $sh -Method Get -TimeoutSec 25
if(@($o).Count -ne 5){throw 'missing_exact_outputs'}
$owner=@{}
foreach($t in $target){
 $r=@($o|Where-Object{[int]$_.output_number -eq $t.n})
 if($r.Count -ne 1 -or $r[0].airtable_record_id -ne $t.rid -or $r[0].platform -ne 'Facebook' -or $r[0].platform_output_type -ne 'Facebook Reel' -or $r[0].review_status -ne 'Approved' -or $r[0].output_status -ne 'Approved for Publishing' -or $r[0].publish_status -notin @('Failed','Ready to Publish') -or $r[0].published_at -or $r[0].platform_post_url){throw 'exact_reel_identity_unverified'}
 $p=[string]$r[0].content_profile_id
 if($owner.ContainsKey($t.city) -and $owner[$t.city] -ne $p){throw 'mixed_original_city_owner'}
 $owner[$t.city]=$p
}
foreach($city in $owner.Keys){
 $p=Invoke-RestMethod ($u+'/rest/v1/content_profiles?id=eq.'+$owner[$city]+'&select=market_name&limit=2') -Headers $sh -Method Get -TimeoutSec 25
 if(@($p).Count -ne 1 -or $p[0].market_name -ne $city){throw 'original_profile_mismatch'}
}
$settings=Invoke-RestMethod ($u+'/rest/v1/engagement_settings?select=payload&limit=500') -Headers $sh -Method Get -TimeoutSec 25
$v=@{}
foreach($s in $settings){$z=$s.payload;if($null -eq $z -or [string]$z.source -ne 'pipeline' -or [string]$z.Active -ne 'True'){continue};$name=[string]$z.Setting_Name;if($name -match '^(FACEBOOK_PAGE_ID|FACEBOOK_PAGE_ACCESS_TOKEN|LA_FACEBOOK_PAGE_ID|LA_FACEBOOK_PAGE_ACCESS_TOKEN|MIAMI_FACEBOOK_PAGE_ID|MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN|NYC_FACEBOOK_PAGE_ID|NYC_FACEBOOK_PAGE_ACCESS_TOKEN|FACEBOOK_GRAPH_API_VERSION)$'){if($v.ContainsKey($name)){throw 'duplicate_page_setting'};$v[$name]=[string]$z.Setting_Value}}
$ver=[string]$v['FACEBOOK_GRAPH_API_VERSION'];if($ver -notmatch '^v\d{1,2}\.\d$'){$ver='v26.0'}
function Norm([string]$s){return ([regex]::Replace($s.ToLowerInvariant(),'[^\p{L}\p{Nd}]+',' ')).Trim()}
$results=@()
foreach($prefix in @('','LA_','MIAMI_','NYC_')){
 $id=[string]$v[($prefix+'FACEBOOK_PAGE_ID')]
 $token=[string]$v[($prefix+'FACEBOOK_PAGE_ACCESS_TOKEN')]
 if(-not $token -or $id -notmatch '^\d{6,30}$'){throw 'page_credentials_missing'}
 $gh=@{Authorization=('Bearer '+$token)}
 function GraphGet($uri){
  if(-not $uri.StartsWith('https://graph.facebook.com/')){throw 'invalid_provider_host'}
  for($i=0;$i -lt 3;$i++){try{return @{ok=$true;data=(Invoke-RestMethod $uri -Method Get -Headers $gh -TimeoutSec 40);http=200}}catch{$code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{};if($code -ge 400 -and $code -lt 500){return @{ok=$false;http=$code}};if($i -eq 2){return @{ok=$false;http=$code}};Start-Sleep -Seconds (2+$i)}}
 }
 $exact=GraphGet ('https://graph.facebook.com/'+$ver+'/'+$id+'?fields=id')
 if(-not $exact.ok -or [string]$exact.data.id -ne $id){throw 'page_account_not_owned'}
 $media=@();$next='https://graph.facebook.com/'+$ver+'/'+$id+'/video_reels?fields=id,description,updated_time&limit=100';$pages=0;$status='complete';$last_http=200
 while($next -and $pages -lt 5){
  $r=GraphGet $next;$last_http=$r.http
  if(-not $r.ok){$status='provider_edge_unavailable';break}
  if($null -eq $r.data.data){$status='missing_data';break}
  $media+=@($r.data.data);$pages++;$next=[string]$r.data.paging.next
 }
 if($next -and $status -eq 'complete'){$status='pagination_incomplete'}
 foreach($t in @($target|Where-Object{$_.prefix -eq $prefix})){
  $row=@($o|Where-Object{[int]$_.output_number -eq $t.n})[0]
  $cap=Norm ([string]$row.output_caption);$title=Norm ([string]$row.output_title)
  if($cap.Length -lt 65){throw 'short_original_caption'}
  $prefixCaption=$cap.Substring(0,[Math]::Min(75,$cap.Length))
  $candidates=@($media|Where-Object{
   $d=Norm ([string]$_.description)
   $d.Length -gt 0 -and ($d -eq $cap -or $d.Contains($prefixCaption) -or ($title.Length -ge 36 -and $d.Contains($title.Substring(0,[Math]::Min(65,$title.Length)))))
  }|ForEach-Object{@{provider_id=[string]$_.id;description_match='original_text_candidate';updated_time=[string]$_.updated_time}})
  $results+=@{output=$t.n;city=$t.city;edge_status=$status;edge_http=$last_http;rows_scanned=$media.Count;pages=$pages;public_reel_candidates=$candidates}
 }
}
Write-Output ('P1_FB_REELS_EDGE_AUDIT='+(@{read_only=$true;source='exact_page_video_reels';provider_writes=0;output_writes=0;results=$results}|ConvertTo-Json -Compress -Depth 7))
