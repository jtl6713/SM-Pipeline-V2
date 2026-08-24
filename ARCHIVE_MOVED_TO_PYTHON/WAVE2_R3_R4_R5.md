# Wave 2 — R3 / R4 / R5 render chain (Python)

Make scenarios replaced by `services/pipeline-runner/` stages `r3`, `r4`, `r5`.

| Stage | Make ID | Python endpoint | Make name |
|-------|---------|-----------------|-----------|
| R3 | 5557966 | `POST /stages/r3` | Deterministic Selected Asset Render Prep v3.1 |
| R4 | 5556716 | `POST /stages/r4` | Start Remotion Render v2.6.2 |
| R5 | 5565333 | `POST /stages/r5` | Render Poller + Final Upload v2.3 |

## Cutover vars (opt-in per stage)

```
STAGE_BACKEND_R3=python
STAGE_BACKEND_R4=python
STAGE_BACKEND_R5=python
```

Until set, Worker continuation cron keeps pulsing Make on-demand for R3/R4/R5.

## Dry-run

```powershell
$secret = (Get-Content "D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env" |
  Where-Object { $_ -match '^PIPELINE_RUNNER_SHARED_SECRET=' }) -replace '^PIPELINE_RUNNER_SHARED_SECRET=', ''

Invoke-RestMethod -Uri "https://pipeline.chicagoshining.com/stages/r3" -Method POST `
  -Headers @{ "Content-Type"="application/json"; "X-Pipeline-Secret"=$secret } `
  -Body '{"extra":{"dry_run":true}}'
```

Repeat for `/stages/r4` and `/stages/r5`.

## Deactivate Make (after Item 7-style proof)

Only after bounded `Test_Run_ID` proof on a `Do_Not_Publish` output:

1. Flip Worker vars one stage at a time (R3 → R4 → R5) or all three together.
2. Deactivate Make scenarios 5557966, 5556716, 5565333.
3. Confirm continuation cron logs `backend: python` for render pulses.
