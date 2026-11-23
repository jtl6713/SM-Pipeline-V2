# Incident #2670: three real QA PostgREST page GETs via existing Windows env.
# Only count and elapsed milliseconds leave Ops. No data/secret is printed.
$ErrorActionPreference='Stop'
$file='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
if(-not (Test-Path -LiteralPath $file)){throw 'indexed_qa_env_unavailable'}
$lines=@(Get-Content -LiteralPath $file)
function Setting([string]$name) {
  $found=@($lines | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')})
  if($found.Count -ne 1){throw 'indexed_qa_authority_ambiguous'}
  return ([string](($found[0] -split '=',2)[1])).Trim().Trim('"').Trim([char]39)
}
$base=(Setting 'SUPABASE_URL').TrimEnd('/')
$secret=Setting 'SUPABASE_SERVICE_ROLE_KEY'
if($base -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co' -or $secret.Length -lt 32) {
  throw 'indexed_qa_wrong_project_or_key'
}
$select=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SELECT_B64__'))
if($select.Length -lt 100 -or $select.Length -gt 6000){throw 'indexed_qa_select_invalid'}
$header=@{'apikey'=$secret;'Authorization'="Bearer $secret";'Accept'='application/json'}
$ids=New-Object 'System.Collections.Generic.HashSet[string]'
foreach($offset in @(0,100,200)) {
  $uri=$base+'/rest/v1/platform_outputs?test_run_id=is.null&home_failure_candidate=eq.true&select='+[Uri]::EscapeDataString($select)+'&order=output_number.asc.nullslast,airtable_record_id.asc&limit=100&offset='+$offset
  $watch=[Diagnostics.Stopwatch]::StartNew()
  $response=Invoke-RestMethod -Method Get -Uri $uri -Headers $header -TimeoutSec 16
  $watch.Stop()
  $rows=@($response|Where-Object {$_ -ne $null})
  $count=$rows.Count
  $expected=if($offset -eq 200){47}else{100}
  if($count -ne $expected){throw 'indexed_qa_page_count_mismatch'}
  foreach($row in $rows) {
    $id=[string]$row.airtable_record_id
    if($id -notmatch '^rec[A-Za-z0-9]{14}$' -or -not $ids.Add($id)) {
      throw 'indexed_qa_page_duplicate_or_invalid'
    }
  }
  Write-Output ('incident2670_indexed_qa_page_offset_'+$offset+'_count_'+$count+'_elapsed_ms_'+[int]$watch.ElapsedMilliseconds)
}
if($ids.Count -ne 247){throw 'indexed_qa_census_count_unverified'}
Write-Output 'incident2670_indexed_qa_three_pages=PASS_247_DISTINCT_NO_WRITES'
