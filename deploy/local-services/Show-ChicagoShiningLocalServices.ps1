$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'STATUS ChicagoShining Local Services'

$rows = @(
    @{ Name = 'Frame Extractor'; Port = 3334 }
    @{ Name = 'Remotion Render'; Port = 3333 }
    @{ Name = 'Watermark'; Port = 3011 }
    @{ Name = 'Voiceover Normalizer'; Port = 3012 }
    @{ Name = 'YouTube Uploader Chicago'; Port = 3340 }
    @{ Name = 'YouTube Uploader LA'; Port = 3341 }
    @{ Name = 'YouTube Uploader NYC'; Port = 3342 }
    @{ Name = 'YouTube Uploader Miami'; Port = 3343 }
    @{ Name = 'Pipeline Runner'; Port = 3350 }
    @{ Name = 'Video Compressor'; Port = 3335 }
    @{ Name = 'Timing Engine'; Port = 3336 }
    @{ Name = 'Task Organizer'; Port = 3360 }
    @{ Name = 'Ops Dashboard'; Port = 3361 }
)

Write-Host ''
Write-Host 'ChicagoShining local listeners' -ForegroundColor Cyan
foreach ($row in $rows) {
    $pids = @(Get-NetTCPConnection -LocalPort $row.Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pids.Count -gt 0) {
        Write-Host ("[UP]   {0,-28} :{1}  PID {2}" -f $row.Name, $row.Port, ($pids -join ', ')) -ForegroundColor Green
    } else {
        Write-Host ("[DOWN] {0,-28} :{1}" -f $row.Name, $row.Port) -ForegroundColor Yellow
    }
}
