$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$path=Join-Path $PSScriptRoot 'Deploy-SMService.ps1'
$ast=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) { throw 'deploy PowerShell syntax invalid' }
$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-RunnerDeploymentDrainCounts'},$true)
if (!$fn) { throw 'drain helper missing' }
. ([scriptblock]::Create($fn.Extent.Text))
function New-Snapshot {
    [pscustomobject]@{ok=$true;enabled=$true;smv1_maintenance_active=$true;active_jobs=0;
        active_resource_slots=[pscustomobject]@{worker_heavy=0;smv1_drain=0;photo_group=0;transfer=0;ratio=0}}
}
function Assert-Rejected($s) {
    $rejected=$false
    try { $null=Get-RunnerDeploymentDrainCounts $s $false } catch { $rejected=$true }
    if (!$rejected) { throw 'invalid snapshot admitted' }
}
$s=New-Snapshot
$c=Get-RunnerDeploymentDrainCounts $s $false
if ($c.Count -ne 6 -or @($c.Values|Where-Object {$_ -ne 0}).Count -ne 0) { throw 'idle snapshot not accepted' }
foreach ($scope in @('worker_heavy','smv1_drain','photo_group','transfer','ratio')) {
    $s=New-Snapshot
    $s.active_resource_slots.$scope=1
    $c=Get-RunnerDeploymentDrainCounts $s $false
    if ($c[$scope] -ne 1 -or @($c.Values|Where-Object {$_ -ne 0}).Count -ne 1) { throw 'active resource lost' }
    foreach ($value in @($null,-1,'0',$false,0.5)) {
        $s.active_resource_slots.$scope=$value
        Assert-Rejected $s
    }
}
$s=New-Snapshot
$s.active_jobs=2
$c=Get-RunnerDeploymentDrainCounts $s $false
if ($c.active_jobs -ne 2) { throw 'active producer lost' }
$s.active_jobs=$null
Assert-Rejected $s
$s=New-Snapshot
$s.smv1_maintenance_active=$false
Assert-Rejected $s
$null=Get-RunnerDeploymentDrainCounts $s $true
$s=New-Snapshot
$s.enabled=$false
Assert-Rejected $s
$s=New-Snapshot
$s.active_resource_slots.PSObject.Properties.Remove('transfer')
Assert-Rejected $s
$source=Get-Content -Raw $path
foreach ($required in @('Elapsed.TotalSeconds -lt 480','runner_drain_counts=','legacy runner busy; defer bootstrap','Exit-Smv1DeploymentMaintenance','@($counts.Values|Where-Object {$_ -ne 0}).Count -eq 0')) {
    if (!$source.Contains($required)) { throw 'drain contract missing' }
}
Write-Output 'runner_deployment_drain_contract=PASS'
