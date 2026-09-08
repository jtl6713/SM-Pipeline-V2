<#
.SYNOPSIS
  Close leftover Chicago Shining service consoles that are not listening.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$pattern = '\d LOC |ChicagoShining'
$closed = 0
Get-Process powershell, pwsh -ErrorAction SilentlyContinue | ForEach-Object {
    $title = ''
    try { $title = $_.MainWindowTitle } catch { return }
    if ([string]::IsNullOrWhiteSpace($title) -or $title -notmatch $pattern) { return }
    $ownsListen = $false
    try {
        $pids = @($_.Id)
        Get-CimInstance Win32_Process -Filter ("ParentProcessId=$($_.Id)") -ErrorAction SilentlyContinue | ForEach-Object { $pids += $_.ProcessId }
        foreach ($procId in $pids) {
            $conn = Get-NetTCPConnection -OwningProcess $procId -State Listen -ErrorAction SilentlyContinue
            if ($conn) { $ownsListen = $true; break }
        }
    } catch {}
    if ($ownsListen) {
        Write-Host ("KEEP pid={0} title={1}" -f $_.Id, $title)
        return
    }
    Write-Host ("CLOSE orphan pid={0} title={1}" -f $_.Id, $title)
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $closed++
}
Write-Host "Closed $closed orphan Chicago Shining console(s)."
