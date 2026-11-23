$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=(Get-Location).Path
$paths=@('Services\pipeline-runner\service\.env','Services\pipeline-runner\.env','Source Control\SM-Pipeline-V2\services\pipeline-runner\.env')
for($i=0;$i -lt $paths.Count;$i++){
  $candidate=Join-Path $root $paths[$i]
  Write-Output ('bethesda_config_candidate_{0}_exists={1}' -f ($i+1),[bool](Test-Path -LiteralPath $candidate))
}
foreach($n in @('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PIPELINE_RUNNER_SHARED_SECRET')){
  Write-Output ('bethesda_process_key_{0}={1}' -f $n,[bool][Environment]::GetEnvironmentVariable($n,'Process'))
}
Write-Output 'bethesda_config_probe=PASS_READ_ONLY'
