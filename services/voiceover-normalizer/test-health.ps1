$ErrorActionPreference = "Stop"
Invoke-RestMethod -Method Get -Uri "http://localhost:3012/health" | ConvertTo-Json -Depth 5
