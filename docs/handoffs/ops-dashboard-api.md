# Ops Dashboard — callable API for ChatGPT / automation

The Ops Dashboard already exposes a REST API. This doc is the integration contract for ChatGPT Custom Actions, Cursor agents, and scripts.

## What this API does and does not do

| Callable via Ops API | Not callable (use GitHub instead) |
|----------------------|-----------------------------------|
| DEPLOY / restart **local Windows services** (pipeline-runner, remotion-renderer, …) | **Cloudflare Worker** (`apps/studio-api/worker.js`) |
| VERIFY public `/health` of local services | **Cloudflare Pages** (`apps/studio-web/**`) |
| SYNC git checkout to `origin/main` (no deploy) | Studio produce resume, Airtable, Make |

Worker/Pages: append to `deploy/cloudflare-worker-production.txt` or `deploy/cloudflare-pages-production.txt`, push `main`, watch GitHub Actions.

## Base URLs

| URL | When |
|-----|------|
| `http://127.0.0.1:3361` | On Joseph's PC (default for CLI) |
| `https://ops.chicagoshining.com` | Remote (Cloudflare Access + token) |

## Authentication

Token: `DASHBOARD_TOKEN` in `D:\Content Creation\ChicagoShining Pipeline\Services\ops-dashboard\.env`

Send on every `/api/*` request (except `/health` and `/api/openapi.json`):

```http
Authorization: Bearer <DASHBOARD_TOKEN>
```

Or: `X-Ops-Token: <DASHBOARD_TOKEN>`

Environment aliases: `OPS_DASHBOARD_TOKEN`, `DASHBOARD_TOKEN`

## OpenAPI schema (ChatGPT Custom Actions)

Import this URL into a Custom GPT Action:

```text
https://ops.chicagoshining.com/api/openapi.json
```

Local copy: `services/ops-dashboard/openapi.json`

Configure Action authentication: **API Key → Bearer** with the dashboard token.

## HTTP endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | No | Liveness |
| GET | `/api/openapi.json` | No | OpenAPI document |
| GET | `/api/catalog` | Yes | Services + action definitions |
| GET | `/api/status` | Yes | Port up + public health per service |
| POST | `/api/run` | Yes | Start async job |
| GET | `/api/jobs/{id}` | Yes | Poll job log + status |
| POST | `/api/jobs/unlock` | Yes | Kill stuck job |

### POST /api/run

```json
{
  "action": "deploy-pipeline-runner",
  "confirm": true
}
```

With service:

```json
{
  "action": "deploy",
  "service": "remotion-renderer",
  "confirm": true
}
```

Response `202`:

```json
{ "ok": true, "job": { "id": "<uuid>", "status": "running", "action": "...", "log": "..." } }
```

Poll until `job.status` is `ok` or `failed`. Success log contains `PASS - controlled deployment completed and verified.`

### Action IDs

`start-all`, `stop-all`, `verify`, `desk-probe`, `desk-restart`, `close-orphans`, `start-one`, `restart-one`, `stop-one`, `sync`, `plan`, `deploy`, `deploy-pipeline-runner`, `rollback`

Confirm required: `stop-all`, `desk-restart`, `restart-one`, `stop-one`, `sync`, `deploy`, `deploy-pipeline-runner`, `rollback`

### POST /api/shell (PowerShell console)

Authenticated host PowerShell for diagnostics. Runs as the Ops Dashboard Windows user on JOE-GAMING.

```json
{ "command": "curl.exe -sS http://127.0.0.1:3333/health", "confirm": true }
```

Requires `confirm: true`. Audited to `Deployment Logs\Local Services\ops-shell-audit.log`. Blocks a short list of wipe/shutdown patterns. Prefer allowlisted `/api/run` actions when one exists.

Ops clears inherited `PORT=3361` on `/api/run` and `/api/shell` children so Remotion (and other Node listeners) bind their catalog ports. `Start-ChicagoShiningHidden.ps1` also pins each service `PORT` and waits for local `/health` before exit 0.

## CLI wrapper (recommended on Joseph's PC)

Script: `deploy/local-services/Invoke-OpsApi.ps1`

```powershell
# Status of all services
powershell -NoProfile -ExecutionPolicy Bypass `
  -File "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Invoke-OpsApi.ps1" `
  status

# Deploy pipeline-runner and wait for completion
powershell -NoProfile -ExecutionPolicy Bypass `
  -File "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Invoke-OpsApi.ps1" `
  run -Action deploy-pipeline-runner -Confirm -Wait

# Plan only (read-only)
powershell -NoProfile -ExecutionPolicy Bypass `
  -File "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\deploy\local-services\Invoke-OpsApi.ps1" `
  run -Action plan -Service pipeline-runner

# Direct mode (no dashboard HTTP — runs PowerShell action script only)
powershell -NoProfile -ExecutionPolicy Bypass `
  -File "...\Invoke-OpsApi.ps1" `
  run -Action verify -Direct
```

All commands print JSON to stdout; exit code 0 = success.

## curl examples

```bash
TOKEN="<DASHBOARD_TOKEN>"
BASE="http://127.0.0.1:3361"

curl -s "$BASE/health"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/status"

JOB=$(curl -s -X POST "$BASE/api/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"deploy-pipeline-runner","confirm":true}')
echo "$JOB"
# Poll: curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/jobs/<uuid>"
```

## ChatGPT setup checklist

1. Custom GPT → **Actions** → Import schema from `https://ops.chicagoshining.com/api/openapi.json`
2. Authentication: Bearer token = `DASHBOARD_TOKEN` (paste in GPT secret config, not in chat)
3. Or: give ChatGPT **Code Interpreter on Joseph's PC** and instruct it to run `Invoke-OpsApi.ps1`
4. After `deploy-pipeline-runner`, verify `https://pipeline.chicagoshining.com/health`
5. For Worker redeploy: use GitHub (`gh run list`), not Ops API

## Common recipes

| Goal | Command |
|------|---------|
| Ship pipeline-runner after merge | `run -Action deploy-pipeline-runner -Confirm -Wait` |
| Check what's down | `status` |
| Read-only diff vs main | `run -Action plan -Service pipeline-runner` |
| Restart without new code | `run -Action restart-one -Service pipeline-runner -Confirm -Wait` |
| Undo bad local deploy | `run -Action rollback -Service pipeline-runner -Confirm -Wait` |
