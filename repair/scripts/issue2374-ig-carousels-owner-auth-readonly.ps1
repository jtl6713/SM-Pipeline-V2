# Issue #2374: verify CURRENT NYC / Miami Instagram owner OAuth readiness for
# six exact historical AP1C HTTP 401 outputs. Read-only, no Graph POST, no
# output status changes, no credential or raw provider body logs.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$health = Invoke-RestMethod 'http://127.0.0.1:3350/health' -Method Get -TimeoutSec 20
if ($health.ok -ne $true -or $health.studio_write_source -ne 'supabase' -or $health.studio_runner_output_read_source -ne 'supabase') {
    throw 'source_authority_not_confirmed'
}
$envfile = Join-Path (Get-Location) 'Services\pipeline-runner\service\.env'
if (-not (Test-Path $envfile)) { throw 'runner_environment_missing' }
function EnvValue([string]$name) {
    $rows = @(Get-Content $envfile | Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') } | Select-Object -Last 1)
    if ($rows.Count -ne 1) { throw 'runtime_configuration_missing' }
    return ([string]$rows[0] -split '=', 2)[1].Trim().Trim('"', "'")
}
$base = (EnvValue 'SUPABASE_URL').TrimEnd('/')
$key = EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if ($base -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or -not $key) { throw 'production_identity_mismatch' }
$sh = @{ apikey=$key; Authorization=('Bearer ' + $key) }
function SourceGet([string]$path) {
    if ($path -notmatch '^/rest/v1/(platform_outputs|content_profiles|engagement_settings)\?') { throw 'source_path_not_allowed' }
    return Invoke-RestMethod ($base + $path) -Headers $sh -Method Get -TimeoutSec 40
}
$targets = @(9868,9882,9893,9895,9905,10631)
$numbers = ($targets | ForEach-Object { [string]$_ }) -join ','
$select = 'output_number,content_profile_id,platform,platform_output_type,review_status,output_status,publish_status,ig_carousel_status,do_not_publish,published_at,platform_post_url,output_caption,error_messages'
$rows = @(SourceGet ('/rest/v1/platform_outputs?select=' + $select + '&output_number=in.(' + $numbers + ')&limit=8'))
if ($rows.Count -eq 1 -and $rows[0] -is [array]) { $rows = @($rows[0]) }
if ($rows.Count -ne 6 -or @($rows | Select-Object -ExpandProperty output_number -Unique).Count -ne 6) { throw 'exact_six_cohort_unavailable' }
$profileRows = @(SourceGet '/rest/v1/content_profiles?select=id,market_name&limit=20')
if ($profileRows.Count -eq 1 -and $profileRows[0] -is [array]) { $profileRows = @($profileRows[0]) }
$market = @{}
foreach ($p in $profileRows) { $market[[string]$p.id] = [string]$p.market_name }
$outputs = @()
foreach ($o in $rows) {
    $num = [int]$o.output_number
    $city = [string]$market[[string]$o.content_profile_id]
    $expected = if ($num -eq 10631) { 'Miami' } else { 'New York City' }
    if ($city -ne $expected -or $o.platform -ne 'Instagram' -or $o.platform_output_type -ne 'Instagram Carousel') { throw 'owner_output_identity_drift' }
    $savedError = [string]$o.error_messages.IG_Carousel_Error_Message
    if ($savedError -notmatch 'HTTP 401') { throw 'historical_401_source_drift' }
    $outputs += @{
        output = $num; profile=$city;historical_401=$true
        original_hold=($o.do_not_publish -eq $true)
        currently_approved=($o.review_status -eq 'Approved' -and $o.output_status -eq 'Approved for Publishing')
        provider_post_receipt_saved=([bool]$o.published_at -or [bool]$o.platform_post_url)
    }
}
$settings = @(SourceGet '/rest/v1/engagement_settings?select=payload&limit=500')
if ($settings.Count -eq 1 -and $settings[0] -is [array]) { $settings = @($settings[0]) }
if ($settings.Count -ge 500) { throw 'settings_pagination_incomplete' }
$config = @{}
foreach ($s in $settings) {
    $p = $s.payload
    if ($null -eq $p -or [string]$p.source -ne 'pipeline' -or [string]$p.Active -ne 'True') { continue }
    $name = [string]$p.Setting_Name
    if ($name -match '^(NYC_|MIAMI_)(INSTAGRAM_BUSINESS_ACCOUNT_ID|META_GRAPH_API_ACCESS_TOKEN)$' -or $name -eq 'META_GRAPH_API_VERSION') {
        if ($config.ContainsKey($name)) { throw 'ambiguous_owner_configuration' }
        $config[$name] = [string]$p.Setting_Value
    }
}
$version = [string]$config['META_GRAPH_API_VERSION']
if ($version -notmatch '^v\d{1,2}\.\d$') { $version = 'v26.0' }
$script:providerGets = 0
function OwnerGet([string]$url, [string]$token) {
    $u = $null
    try { $u = [uri]$url } catch { throw 'provider_url_invalid' }
    if ($u.Scheme -ne 'https' -or $u.Host -ne 'graph.facebook.com' -or -not $token) { throw 'provider_get_disallowed' }
    $script:providerGets++
    if ($script:providerGets -gt 14) { throw 'provider_get_budget_exceeded' }
    try {
        $data = Invoke-RestMethod -Uri $url -Headers @{Authorization=('Bearer ' + $token);Accept='application/json'} -Method Get -TimeoutSec 35
        return @{ok=$true;status=200;data=$data}
    } catch {
        $http = 0
        try { $http = [int]$_.Exception.Response.StatusCode } catch {}
        return @{ok=$false;status=$http;data=$null}
    }
}
$ownerChecks = @()
foreach ($spec in @(
    @{city='New York City';prefix='NYC_'},
    @{city='Miami';prefix='MIAMI_'}
)) {
    $id = [string]$config[$spec.prefix + 'INSTAGRAM_BUSINESS_ACCOUNT_ID']
    $token = [string]$config[$spec.prefix + 'META_GRAPH_API_ACCESS_TOKEN']
    $r = [ordered]@{
        profile=$spec.city; account_identity_confirmed=$false;media_read_authorized=$false
        owner_identity_http=0;media_get_http=0;status='not_started'
    }
    if ($id -notmatch '^\d{6,30}$' -or -not $token) {
        $r.status='owner_config_missing'
    } else {
        $owner = OwnerGet ('https://graph.facebook.com/' + $version + '/' + $id + '?fields=id') $token
        $r.owner_identity_http = $owner.status
        if (-not $owner.ok -or [string]$owner.data.id -ne $id) {
            $r.status=if ($owner.status -eq 401) {'owner_oauth_401_reauthorization_needed'} else {'owner_id_get_inconclusive'}
        } else {
            $r.account_identity_confirmed = $true
            $listing = OwnerGet ('https://graph.facebook.com/' + $version + '/' + $id + '/media?fields=id,media_type&limit=1') $token
            $r.media_get_http = $listing.status
            $r.media_read_authorized = ($listing.ok -and $null -ne $listing.data.data)
            $r.status=if ($r.media_read_authorized) {'current_owner_media_read_ok'} elseif ($listing.status -eq 401) {'owner_media_oauth_401_reauthorization_needed'} else {'media_scope_inconclusive'}
        }
    }
    $ownerChecks += $r
}
# Fresh owner-scoped, GET-only inventory: caption and native CAROUSEL_ALBUM
# type are only possible candidates, never original-asset or receipt proof.
function NormalizeCaption([string]$text) {
    if (-not $text) { return '' }
    return [regex]::Replace($text.ToLowerInvariant(),'\\s+',' ').Trim()
}
$inventory = @()
$mediaByOwner = @{}
foreach ($spec in @(
    @{city='New York City';prefix='NYC_'},
    @{city='Miami';prefix='MIAMI_'}
)) {
    $scope = @($ownerChecks | Where-Object { $_.profile -eq $spec.city })[0]
    $mediaByOwner[$spec.city] = @()
    $summary = [ordered]@{profile=$spec.city;pages=0;objects=0;status='not_started'}
    if (-not $scope.media_read_authorized) {
        $summary.status = 'owner_media_read_not_authorized_no_negative_proof'
        $inventory += $summary
        continue
    }
    $id = [string]$config[$spec.prefix + 'INSTAGRAM_BUSINESS_ACCOUNT_ID']
    $token = [string]$config[$spec.prefix + 'META_GRAPH_API_ACCESS_TOKEN']
    $next = 'https://graph.facebook.com/' + $version + '/' + $id + '/media?fields=id,caption,permalink,timestamp,media_type,media_product_type&limit=100'
    $pages = 0
    $status = 'complete'
    while ($next -and $pages -lt 5) {
        $g = OwnerGet $next $token
        if (-not $g.ok -or $null -eq $g.data.data) { $status = 'media_history_get_unavailable_no_negative_proof';break }
        $mediaByOwner[$spec.city] += @($g.data.data)
        $pages++
        $next = [string]$g.data.paging.next
    }
    if ($next -and $status -eq 'complete') { $status = 'pagination_capped_no_negative_proof' }
    $summary.pages = $pages
    $summary.objects = @($mediaByOwner[$spec.city]).Count
    $summary.status = $status
    $inventory += $summary
}
$matches = @()
foreach ($source in $rows) {
    $number = [int]$source.output_number
    $city = [string]$market[[string]$source.content_profile_id]
    $caption = NormalizeCaption ([string]$source.output_caption)
    $needle = if ($caption.Length -ge 85) { $caption.Substring(0, [Math]::Min(120,$caption.Length)) } else { '' }
    $hits = @()
    if ($needle) {
        foreach ($post in @($mediaByOwner[$city])) {
            $remoteId = [string]$post.id
            $type = [string]$post.media_type
            $url = [string]$post.permalink
            $remoteCaption = NormalizeCaption ([string]$post.caption)
            if ($remoteId -match '^\\d{6,30}    version='issue2374_ig_carousel_owner_history_v2'
    source='production_supabase'
    read_only=$true
    output_writes=0
    provider_writes=0
    publish_calls=0
    airtable_operations=0
    checked_at=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    exact_target_count=$outputs.Count
    provider_get_calls=$script:providerGets
    targets=$outputs
    owner_scopes=$ownerChecks
    bounded_media_inventory=$inventory
    matched_output_candidates=$matches
    candidate_count=@($matches|Where-Object{$_.candidate_count -gt 0}).Count
}
Write-Output ('ISSUE2374_IG_OWNER_AUTH_AUDIT=' + ($report | ConvertTo-Json -Compress -Depth 6))
 -and $type -eq 'CAROUSEL_ALBUM' -and
                $url -match '^https://(www\\.)?instagram\\.com/p/' -and
                $remoteCaption.StartsWith($needle)) {
                $hits += @{ id=$remoteId; published_at=[string]$post.timestamp; public_permalink=$url; match='owner_native_carousel_caption_prefix_only' }
            }
        }
    }
    $seen = @{};$uniq = @()
    foreach ($hit in $hits) { if (-not $seen.ContainsKey($hit.id)) { $seen[$hit.id]=$true;$uniq+=$hit } }
    $status = if ($uniq.Count -gt 1) {'multiple_public_carousel_text_candidates_require_asset_proof'}
        elseif ($uniq.Count -eq 1) {'single_public_carousel_text_candidate_requires_asset_proof'}
        elseif (-not $needle) {'caption_too_short_no_negative_proof'}
        else {'no_native_carousel_caption_match_in_bounded_history_no_negative_proof'}
    $matches += @{output=$number;profile=$city;status=$status;candidate_count=$uniq.Count;candidates=$uniq;original_asset_proven=$false;retry_authorized=$false}
}
# A single remote Instagram item cannot prove delivery for two source outputs.
$claimed = @{}
foreach ($m in @($matches|Where-Object{$_.candidate_count -eq 1})) {
    $key=$m.profile+'|'+[string]$m.candidates[0].id
    if (-not $claimed.ContainsKey($key)) {$claimed[$key]=0}
    $claimed[$key]++
}
foreach ($m in @($matches|Where-Object{$_.candidate_count -eq 1})) {
    $key=$m.profile+'|'+[string]$m.candidates[0].id
    if ($claimed[$key] -gt 1) {$m.status='shared_remote_candidate_requires_manual_review'}
}
$report = @{
    version='issue2374_ig_carousel_oauth_v1'
    source='production_supabase'
    read_only=$true
    output_writes=0
    provider_writes=0
    publish_calls=0
    airtable_operations=0
    checked_at=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    exact_target_count=$outputs.Count
    provider_get_calls=$script:providerGets
    targets=$outputs
    owner_scopes=$ownerChecks
}
Write-Output ('ISSUE2374_IG_OWNER_AUTH_AUDIT=' + ($report | ConvertTo-Json -Compress -Depth 6))
