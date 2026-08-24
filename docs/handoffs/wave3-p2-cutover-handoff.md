# Wave 3 → P2 cutover handoff (new agent start here)

**Date:** 2026-08-23  
**Branch / PR:** `cursor/studio-continuation-controller` → [PR #11](https://github.com/jtl6713/SM-Pipeline-V2/pull/11)  
**Joseph’s ask:** Cut over **P2** the same way R3–R5 and RR1 were cut over. P2 Python port is **implemented but not live**.

---

## What is already done (do not redo)

### Python pipeline-runner — live stages

| Stage | Make ID | Worker var | Production |
| --- | --- | --- | --- |
| SMV1 | 5894885 | `STAGE_BACKEND_SMV1=python` | ✅ |
| R2 | 5569495 | `STAGE_BACKEND_R2=python` | ✅ |
| R3 | 5557966 | `STAGE_BACKEND_R3=python` | ✅ (Make deactivated) |
| R4 | 5556716 | `STAGE_BACKEND_R4=python` | ✅ (Make deactivated) |
| R5 | 5565333 | `STAGE_BACKEND_R5=python` | ✅ (Make deactivated) |
| RR1 | 5576363 | `STAGE_BACKEND_RR1=python` | ✅ (Make deactivated) |
| **P2** | **5530955** | **`STAGE_BACKEND_P2=python`** | ✅ routed (Make deactivated; live paid proof pending OpenAI billing) |
| P3 | 5531703 | (none yet) | Make webhook |
| Publish | various | (none yet) | Make |

### RR1 (Wave 3) — complete

- Code: `services/pipeline-runner/rr1/` + `integrations/gmail.py` + `stages/rr1.py`
- Worker: `item4PulseRR1Python`, cadence skips Make when `STAGE_BACKEND_RR1=python`
- Configure workflow sets `STAGE_BACKEND_RR1=python` ([example run 32674369322](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32674369322))
- Make `5576363` **deactivated**
- Gmail OAuth: runtime token has `gmail.send`; **Gmail API enabled** on GCP project `198619707196`
- Verify: `python scripts/verify-gmail-scope.py` → `gmail_send_scope_ok`
- Dry-run RR1 works via public endpoint (see below)

### P2 (Wave 3) — code complete, not cut over

Full port of Make `5530955` in `services/pipeline-runner/p2/`:

| Module | Role |
| --- | --- |
| `processor.py` | Main orchestration — 3 routes |
| `elevenlabs_client.py` | TTS (`eleven_multilingual_v2`) |
| `normalizer_client.py` | POST to voiceover normalizer `-16 LUFS` |
| `thumbnail_client.py` | OpenAI `gpt-image-1.5` + branding suffix |
| `stale_clears.py` | Port of `item4StaleMediaRunClears` in worker |
| `formulas.py` | Airtable recheck formulas from Make blueprint |
| `constants.py` | Drive folder IDs, P3 webhook URL, voice IDs |

**Routes (match Make v2.3):**

1. **Voiceover + thumbnail** — `Content_Status=Ready for Voiceover`, script ready, normalizer URL from Pipeline Settings
2. **Voiceover-only** — same, `Thumbnail_Status=Not Needed`
3. **Silent thumbnail** — `Include_Voiceover=No`, `Thumbnail_Status=Ready`, no `Thumbnail_URL`

Success path updates Content Item → `Thumbnail Ready`, uploads to Drive, chains **P3 webhook** (`P3_WEBHOOK_URL` / Make hook `66wq22...`).

Worker already routes when flipped:

- `item4PulseP2Python` in `apps/studio-api/worker.js`
- `pulseStudioP2Handoff` calls Python when `STAGE_BACKEND_P2=python`, else Make webhook `6c8csqn...`

Registry: `p2` in `_IMPLEMENTED_STAGES` (7 stages in `/health`).

Tests: `tests/test_p2_formulas.py` (included in suite — 31+ passed at cutover time).

---

## Key paths and runtime

| What | Path |
| --- | --- |
| Repo | `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2` |
| Runtime service | `D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service` |
| Runtime `.env` | `...\Services\pipeline-runner\service\.env` (secrets — **never commit**) |
| Start pipeline-runner | `Production Start-Stop-Verify Services\_startup_helpers\06-pipeline-runner-local.ps1` (port **3350**) |
| Public health | https://pipeline.chicagoshining.com/health |
| Worker | `apps/studio-api/worker.js` → deploy via `Deploy Studio API Worker Production` workflow |

**Sync code to runtime** (Deploy-SMService refuses non-`main` commits):

```powershell
robocopy "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\services\pipeline-runner" `
  "D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service" `
  /MIR /XD .venv .pytest_cache __pycache__ /XF .env
```

Then restart tab 6 / `06-pipeline-runner-local.ps1`.

---

## P2 cutover checklist (next agent task)

Mirror R3–R5 / RR1 pattern:

### 1. Pre-flight

- [x] `pytest` in `services/pipeline-runner` — 35 passed
- [ ] Runtime `.env` has: `AIRTABLE_PAT`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, Google OAuth (Drive), `PIPELINE_RUNNER_SHARED_SECRET` — **ELEVENLABS_API_KEY still missing; OpenAI key billing-limited**
- [x] Voiceover normalizer running on **3012** (`Voiceover_Normalization_Service_URL` = `https://voiceover.chicagoshining.com`)
- [x] Local/public `/health` shows `stages_implemented: 7`

### 2. Enable Worker var

In `.github/workflows/configure-pipeline-runner-production.yml`, add to `updates` dict:

```python
'STAGE_BACKEND_P2': ('plain_text', 'python'),
```

Commit + push to PR branch if not already on main.

Run workflow (needs secret from runtime `.env`):

```powershell
$secret = (Select-String -Path "D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env" `
  -Pattern '^PIPELINE_RUNNER_SHARED_SECRET=(.+)$').Matches[0].Groups[1].Value
gh workflow run configure-pipeline-runner-production.yml `
  --ref cursor/studio-continuation-controller `
  -f pipeline_runner_shared_secret=$secret
```

### 3. Deploy Worker

Worker **must** include `item4PulseP2Python` + `pulseStudioP2Handoff` Python branch (already in branch).

```powershell
gh workflow run deploy-cloudflare-worker-production.yml --ref cursor/studio-continuation-controller
```

If deploy fails on binding contract, ensure `repair/scripts/studio_api_binding_contract.py` lists `STAGE_BACKEND_P2` under `OPTIONAL_BINDINGS` (already done in `dc4a96c`).

### 4. Sync + restart pipeline-runner

Robocopy (above) + `06-pipeline-runner-local.ps1`.

### 5. Deactivate Make P2

- Scenario ID: **5530955**
- Hook: **2567880**
- Use Make MCP `scenarios_deactivate` with `scenarioId: 5530955`

### 6. Bounded proof (do not webhook-spam production)

**Dry-run** (no paid APIs, no Airtable writes) — pick a Content Item in `Ready for Voiceover` or silent thumbnail state:

```powershell
$secret = (Select-String -Path "D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env" `
  -Pattern '^PIPELINE_RUNNER_SHARED_SECRET=(.+)$').Matches[0].Groups[1].Value

Invoke-RestMethod -Uri "https://pipeline.chicagoshining.com/stages/p2" `
  -Method POST `
  -Headers @{"X-Pipeline-Secret"=$secret; "Content-Type"="application/json"} `
  -Body '{"content_item_record_id":"recXXXXXXXXXXXX","extra":{"dry_run":true}}'
```

**Live proof:** Promote one test Content Item through Studio (or use matrix CI **90–94** parents that need P2 re-run — see platform-matrix handoff). Watch:

- Content Item gets `Voiceover_URL` / `Thumbnail_URL` + Drive file IDs
- `Content_Status` → `Thumbnail Ready`
- P3 webhook fires (Make P3 `5531703` still handles planner until P3 is ported)

### 7. Archive docs

Update `ARCHIVE_MOVED_TO_PYTHON/MANIFEST.json` and add `WAVE3_P2.md` when cutover is proven.

**2026-08-23 status:** Steps 2–5 done (configure [32676302994](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32676302994), deploy [32676304332](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32676304332), Make 5530955 inactive, runner restarted). Dry-run on CI [95](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recCTw0gxbR07xGu4) selected `silent_thumbnail`. Live paid call failed with OpenAI `billing_hard_limit_reached`. Archive written as routed-not-fully-proven. Do not Approve.

---

## Auth / secrets reference

| Secret | Where |
| --- | --- |
| `PIPELINE_RUNNER_SHARED_SECRET` | Runtime `.env` + Worker binding (via configure workflow) |
| Google refresh token | Runtime `.env` — scopes: `drive`, `drive.file`, `gmail.send` |
| `OPENAI_API_KEY` | Runtime `.env` (thumbnails) |
| `ELEVENLABS_API_KEY` | Runtime `.env` (voiceover) |
| Normalizer URL | Airtable Pipeline Settings `Voiceover_Normalization_Service_URL` or `VOICEOVER_NORMALIZER_URL` in `.env` |

**RR1 dry-run pattern** (same secret loading — never use literal `<your-secret>`):

```powershell
$secret = (Select-String -Path "D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env" `
  -Pattern '^PIPELINE_RUNNER_SHARED_SECRET=(.+)$').Matches[0].Groups[1].Value
Invoke-RestMethod -Uri "https://pipeline.chicagoshining.com/stages/rr1" -Method POST `
  -Headers @{"X-Pipeline-Secret"=$secret; "Content-Type"="application/json"} `
  -Body '{"extra":{"dry_run":true,"max_runs":1}}'
```

---

## What NOT to do

- Do **not** commit runtime `.env` or secrets
- Do **not** force-push `main`
- Do **not** PATCH live Make P2 blueprint while cutting over (deactivate instead)
- Do **not** Approve matrix outputs **225–243** for publishing unless Joseph says so (`docs/handoffs/platform-matrix-autonomous-tests.md`)
- Do **not** webhook-run P2 manually in a loop — use Worker continuation or one bounded dry-run

---

## After P2 — remaining pre-publish migration

| Stage | Make ID | Notes |
| --- | --- | --- |
| P3 | 5531703 | Webhook `66wq22...`; scaffold in `services/pipeline-runner/p3/` |
| AP0 / publish | IG/FB/TT/YT orchestrators | Scaffold in `services/pipeline-runner/publish/` |

P2 success currently triggers P3 via **Make webhook** (same as Make P2 did). P3 Python port is the next wave after P2 cutover is stable.

---

## Active platform-matrix context (optional test targets)

See `docs/handoffs/platform-matrix-autonomous-tests.md`. Matrix parents **90–94** exercised P2 via Make; after P2 cutover, continuation cron should pulse Python P2 for `wait_voiceover` / `wait_thumbnail` parents.

Worker continuation order (recent): media gate → P2 pulse → R5 → R4 → R3 → RR1 → R2 (Python branches when vars set).

---

## Recent commits (branch tip may differ)

- `9f9e346` — Wave 3 RR1 + full P2 port
- `dc4a96c` — Worker binding contract for `STAGE_BACKEND_*` vars
- `6c1f5a9` — Photo VO mix / review status fixes (post-RR1)

---

## Success criteria for P2 cutover

1. `STAGE_BACKEND_P2=python` on live Worker  
2. Make `5530955` inactive  
3. `/health` → 7 implemented stages, public route OK  
4. One bounded Content Item completes voiceover and/or thumbnail via Python, P3 chains  
5. No regression on silent-thumbnail route (RC-NATIVE-D4 fix was in Make v2.3 — Python port includes `silent_thumbnail` route)

---

**Start command for new agent:**

> Cut over P2 to Python on PR #11 using `docs/handoffs/wave3-p2-cutover-handoff.md`. Follow the checklist: configure workflow, deploy Worker, deactivate Make 5530955, sync runtime, bounded dry-run then one live proof. Do not Approve matrix outputs for publish.
