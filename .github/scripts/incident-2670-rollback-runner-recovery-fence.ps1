$ErrorActionPreference = 'Stop'
$path = 'D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
$parent = Split-Path -Parent $path
$name = Split-Path -Leaf $path
$backups = @(Get-ChildItem -LiteralPath $parent -File |
  Where-Object { $_.Name -like ($name + '.incident2670-prepublisher-*.bak') } |
  Sort-Object LastWriteTimeUtc -Descending)
if ($backups.Count -lt 1) { throw 'incident2670_backup_missing' }
$backup = $backups[0]
if (((Get-Date).ToUniversalTime() - $backup.LastWriteTimeUtc).TotalHours -gt 3) {
  throw 'incident2670_backup_too_old'
}
$before = @(Get-Content -LiteralPath $backup.FullName)
$after = @(Get-Content -LiteralPath $path)
if ($before.Count -ne $after.Count) { throw 'env_modified_after_stage' }
$mutable = @(
  'PIPELINE_RUNNER_RECOVERY_READ_ONLY',
  'PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY',
  'PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET'
)
for ($i = 0; $i -lt $before.Count; $i++) {
  $same = $before[$i] -ceq $after[$i]
  if ($same) { continue }
  $allowed = $false
  foreach ($key in $mutable) {
    if ($before[$i] -match ('^\s*' + [regex]::Escape($key) + '\s*=') -and
        $after[$i] -match ('^\s*' + [regex]::Escape($key) + '\s*=')) {
      $allowed = $true
      break
    }
  }
  if (-not $allowed) { throw 'unrelated_env_change_prevents_rollback' }
}
if (-not (@($before | Where-Object { $_ -match '^\s*PIPELINE_RUNNER_RECOVERY_READ_ONLY\s*=\s*(1|true|yes)' }).Count -eq 1)) {
  throw 'backup_not_a_recovery_fenced_configuration'
}
Copy-Item -LiteralPath $backup.FullName -Destination $path -Force -ErrorAction Stop
Write-Output 'incident2670_emergency_publishing_fence=ROLLED_BACK_ON'
