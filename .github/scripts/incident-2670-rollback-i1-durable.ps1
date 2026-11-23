$ErrorActionPreference='Stop'
$path='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
$parent=Split-Path -Parent $path
$name=Split-Path -Leaf $path
$backups=@(Get-ChildItem -LiteralPath $parent -File | Where-Object {
 $_.Name -like ($name+'.incident2670-i1-preenable-*.bak')
} | Sort-Object LastWriteTimeUtc -Descending)
if ($backups.Count -eq 0) {throw 'i1_rollback_backup_absent'}
$b=$backups[0]
if (((Get-Date).ToUniversalTime()-$b.LastWriteTimeUtc).TotalHours -gt 2) {throw 'i1_rollback_backup_stale'}
$prior=@(Get-Content -LiteralPath $b.FullName)
$current=@(Get-Content -LiteralPath $path)
$original=@{}
$new=@{}
foreach ($line in $prior) {
 if ($line -match '^\s*(I1_DURABLE_ENABLED|I1_JOB_DB_PATH)\s*=') {
  $original[$Matches[1]]=($line -split '=',2)[1]
 }
}
foreach ($line in $current) {
 if ($line -match '^\s*(I1_DURABLE_ENABLED|I1_JOB_DB_PATH)\s*=') {
  $new[$Matches[1]]=($line -split '=',2)[1]
 }
}
if ($new['I1_DURABLE_ENABLED'].Trim() -ne 'true') {throw 'i1_rollback_current_state_changed'}
# Preserve any unrelated configuration edits. Diff after excluding these two keys
# must match the backed up original exactly.
function Remove-I1-Settings([string[]]$lines) {
 return @($lines | Where-Object {$_ -notmatch '^\s*(I1_DURABLE_ENABLED|I1_JOB_DB_PATH)\s*='})
}
$a=Remove-I1-Settings $prior
$c=Remove-I1-Settings $current
if ($a.Count -ne $c.Count) {throw 'i1_rollback_unrelated_env_edit'}
for($i=0;$i -lt $a.Count;$i++) {
 if ($a[$i] -cne $c[$i]) {throw 'i1_rollback_unrelated_env_edit'}
}
Copy-Item -LiteralPath $b.FullName -Destination $path -Force -ErrorAction Stop
Write-Output 'incident2670_i1_durable_env=ROLLED_BACK'
