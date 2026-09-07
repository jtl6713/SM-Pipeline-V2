# SM Pipeline V2 — GitHub Source Control and Local Service Deployment Runbook

**Repository:** `jtl6713/SM-Pipeline-V2`  
**Primary branch:** `main`  
**Local Git checkout:** `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`  
**Live service root:** `D:\Content Creation\ChicagoShining Pipeline\Services`  
**Operational controls:** `D:\Content Creation\ChicagoShining Pipeline\Source Control\Production-Start-Stop-Verify-Services`

Legacy junction (existing shortcuts): `D:\Content Creation\ChicagoShining Pipeline\Production Start-Stop-Verify Services`  
**Deployment framework:** `deploy\local-services\`  
**Framework version proven on Windows PowerShell 5.1:** `1.0.1-ps51-collections`

---

## 1. Purpose

This runbook documents how SM Pipeline V2 uses GitHub for source control and how approved source is promoted to the five Windows-hosted local services.

It is written for the owner/operator, a future ChatGPT session, another AI assistant, and a future human maintainer who may be more familiar with older centralized tools such as Visual SourceSafe than with Git.

The core rule is simple:

> **GitHub is source authority. The live Services folders are runtime. They are deliberately separate.**

Production is never intended to run directly from the Git working copy.

## 2. Mental model: Git compared with VSS

| VSS concept | Git/GitHub concept |
|---|---|
| Source database | Repository |
| Project/folder | Repository directory |
| Get latest | `git pull` |
| Version/checkpoint | Commit |
| Label/version identifier | Commit SHA or tag |
| Parallel work area | Branch |
| Review/promote change | Pull Request (PR) |
| Accept change | Merge |
| File history | Git/GitHub history |
| Restore older version | Checkout/deploy an earlier commit or use deployment rollback |

Git is distributed. The folder under `Source Control\SM-Pipeline-V2` is a real local repository clone, not merely a cache.

## 3. Three authority zones — do not mix them

### GitHub: approved editable source authority

Repository: `jtl6713/SM-Pipeline-V2`  
Approved branch: `main`

The `services/` subtree contains source and reproducible non-secret configuration for the five local services.

### Local Git checkout: source-control working copy only

`D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`

Use it for `git pull`, local source review, deployment tooling, and local Git operations. Do **not** run production services directly from it.

### Live Services folders: production runtime only

`D:\Content Creation\ChicagoShining Pipeline\Services`

These folders contain the running services and runtime-only material. The deployer copies approved source from an exact Git commit into the live service while preserving runtime state.

## 4. Local service map

| # | Service | GitHub source | Live runtime | Port | Permanent public route | Required tab title |
|---:|---|---|---|---:|---|---|
| 1 | Frame Extractor | `services/frame-extractor` | `Services\Frame_Extractor` | 3334 | `https://frames.chicagoshining.com` | `1 LOC Frame Extractor :3334` |
| 2 | Remotion Renderer | `services/remotion-renderer` | `Services\Remotion_Renderer` | 3333 | `https://render.chicagoshining.com` | `2 LOC Remotion Renderer :3333` |
| 3 | Watermark | `services/watermark` | `Services\Watermark` | 3011 | `https://watermark.chicagoshining.com` | `3 LOC Watermark :3011` |
| 4 | Voiceover Normalizer | `services/voiceover-normalizer` | `Services\voiceover-normalizer\service` | 3012 | `https://voiceover.chicagoshining.com` | `4 LOC Voiceover Normalizer :3012` |
| 5 | YouTube Uploader | `services/youtube-uploader` | `Services\youtube-uploader\service` | 3340 | `https://youtube-upload.chicagoshining.com` | `5 LOC YouTube Uploader :3340` |
| 6 | Pipeline Runner | `services/pipeline-runner` | `Services\pipeline-runner\service` | 3350 | `https://pipeline.chicagoshining.com` | `6 LOC Pipeline Runner :3350` |
| 7 | Video Compressor | `services/video-compressor` | `Services\Video_Compressor` | 3335 | `https://compress.chicagoshining.com` | `7 LOC Video Compressor :3335` |
| 8 | Timing Engine | `services/timing-engine` | `Services\timing-engine\service` | 3336 | `https://timing.chicagoshining.com` | `8 LOC Timing Engine :3336` |

All five services were captured from the authoritative live Windows sources and placed under Git source control on 2026-08-17.

## 5. What belongs in Git

Typical source-controlled material includes source files, `package.json`, `package-lock.json`, `requirements.txt`, non-secret configuration templates, safe blank-value `.env.example` files, README/runbook files, and deployment scripts.

### Never commit

Never commit `.env`, OAuth client secrets, OAuth refresh/access tokens, credential JSON, private keys, `node_modules`, `.venv`/`venv`, `__pycache__`, generated media, Frame Extractor working frames, Remotion temp/render working directories, YouTube `data/youtube-jobs.json`, logs, caches, local backups, ZIPs, deployment backups, or deployment logs.

## 6. GitHub website — button-level basics

### Browse source

1. Open GitHub.
2. Open `jtl6713/SM-Pipeline-V2`.
3. Confirm the branch selector says `main`.
4. Click `services`.
5. Click the service folder.
6. Click a filename.

### View file history

1. Open the file.
2. Click **History**.
3. Click a commit to see the exact change.

### Review a Pull Request

Preferred normal change-management model:

1. Click **Pull requests**.
2. Open the PR named by the AI/maintainer.
3. Read **Conversation** for purpose, scope, tests, and deployment notes.
4. Click **Files changed**.
5. Green lines are additions; red lines are removals.
6. Confirm the change is limited to intended files/service.
7. Return to **Conversation**.
8. If approved and checks are green, click **Merge pull request**.
9. Click **Confirm merge**.

Merging updates `main`; it does **not** deploy the live Windows service.

Direct commits to `main` should be exceptions rather than the default for service logic.

## 7. Local Git basics

Double-click **SYNC Local Git Checkout.bat** in `Production Start-Stop-Verify Services` (or run `deploy\local-services\SYNC-Git-Main.bat` from the Git checkout). That checks out `main`, fast-forwards from `origin/main`, prints `git status`, and shows the current commit. It does **not** deploy or restart live services.

Or open PowerShell:

```powershell
cd "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2"
```

Synchronize:

```powershell
git pull --ff-only origin main
```

Check clean state:

```powershell
git status
```

Show exact local commit:

```powershell
git rev-parse HEAD
```

Recent history:

```powershell
git log --oneline -10
```

Do not casually use `git reset --hard`, `git clean -fdx`, or `git push --force`.

## 8. Controlled deployment framework

Authoritative files:

```text
deploy\local-services\Deploy-SMService.ps1
deploy\local-services\Install-Deployment-Shortcuts.ps1
deploy\local-services\README.md
```

Friendly launchers under `Production Start-Stop-Verify Services`:

- `SYNC Local Git Checkout.bat`
- `PLAN Local Service Deployment.bat`
- `DEPLOY Local Service.bat`
- `DEPLOY Pipeline Runner.bat`
- `ROLLBACK Local Service.bat`
- `INSTALL Operator Shortcuts.bat`

ChicagoShining Pipeline **root** should also have shortcuts for START / STOP / VERIFY plus SYNC / PLAN / DEPLOY / DEPLOY Pipeline Runner / ROLLBACK. Re-run after pulling:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Install-Deployment-Shortcuts.ps1"
```

That archives known unused Start-Stop-Verify docs/one-time scripts under `_legacy_archive\`, removes pipeline-root `.pytest_cache`, and refreshes the root shortcuts without overwriting working START / STOP / VERIFY targets.

## 9. PLAN — safe/read-only

1. Open `Production Start-Stop-Verify Services`.
2. Double-click `PLAN Local Service Deployment.bat`.
3. Select 1-5.
4. Review service, runtime path, approved commit SHA, file differences, and baseline local/public health.
5. A successful plan ends with:

```text
PLAN ONLY - no production files or processes were changed.
```

PLAN synchronizes Git and uses an isolated temporary worktree, but it does not stop or modify production.

## 10. DEPLOY — approved Git source to one live service

1. Double-click `DEPLOY Local Service.bat`.
2. Select the service.
3. Review the plan.
4. When prompted, type exactly `DEPLOY`.
5. Wait for:

```text
PASS - controlled deployment completed and verified.
```

Internally the deployer requires a clean checkout, fast-forwards `main`, resolves the exact approved commit, materializes it in an isolated worktree, verifies baseline health, creates a timestamped backup, stops only the selected service, copies deployable source only, preserves secrets/runtime state, rebuilds dependencies if needed, restarts only the selected service with the numbered tab title, verifies local `/health`, verifies permanent public `/health`, records the deployed SHA in `.smv2-deployment.json`, writes deployment history, and removes the temporary worktree.

If a post-mutation step fails, the framework attempts automatic rollback.

## 11. Dependency behavior

- **Frame Extractor:** Python; `.venv` remains runtime-only; `requirements.txt` is controlled.
- **Remotion Renderer:** Node/Remotion; `node_modules` remains runtime-only; package metadata/lockfile are controlled.
- **Watermark:** Node; package metadata/lockfile controlled; `node_modules` runtime-only.
- **Voiceover Normalizer:** source controlled; host dependencies such as FFmpeg remain runtime concerns.
- **YouTube Uploader:** `.env`, OAuth material, and `data/youtube-jobs.json` remain runtime-only and must survive source deployments.

## 12. ROLLBACK

1. Double-click `ROLLBACK Local Service.bat`.
2. Select the service.
3. Review the latest backup shown.
4. Type exactly `ROLLBACK`.
5. Wait for:

```text
PASS - rollback completed and verified.
```

Backups:

`D:\Content Creation\ChicagoShining Pipeline\Deployment Backups\Local Services`

Logs:

`D:\Content Creation\ChicagoShining Pipeline\Deployment Logs\Local Services`

## 13. Proven deployment evidence

Framework commits:

- `13a731737708192c50c75ac65d1f47ef09ef5c4a` — initial deployment framework.
- `051b6251bad51f797f39765096b68008de08fce1` — Windows PowerShell 5.1 collection compatibility.

The first PLAN exposed a PowerShell 5.1 collection-return incompatibility before any production mutation. The fix was committed and pushed.

Watermark was the first complete proof: PLAN, exact-commit deploy, backup, local/public health, manual rollback, health after rollback, redeploy, and full five-service production verification all passed.

The other four services were then PLAN-validated and brought into the managed deployment model. Final production verification reported all five local services and all five permanent Cloudflare routes reachable.

## 14. Normal change workflow for an AI assistant

1. Read this runbook.
2. Read `PROJECT_RULES.md`.
3. Read `services/README.md`.
4. Read `deploy/local-services/README.md`.
5. Verify current GitHub `main`.
6. Verify target service baseline health.
7. Work on a branch when available.
8. Change only intended service/source files.
9. Never add secrets/runtime state.
10. Run appropriate static tests/lint/build.
11. Open a PR when possible.
12. Review exact changed files.
13. Merge approved source to `main`.
14. PLAN the target service.
15. Review differences and health.
16. DEPLOY that service only.
17. Confirm local/public health.
18. Run normal production VERIFY after material changes.
19. Keep rollback backup until confidence is established.
20. Record meaningful operational changes in durable documentation/handoff.

Do not “fix production” by editing live `Services` source and forgetting Git. If an emergency live repair is unavoidable, reconcile the proven repair back into Git immediately.

## 15. Start-of-session checklist for a new AI

1. Identify `jtl6713/SM-Pipeline-V2`.
2. Read `PROJECT_RULES.md`.
3. Read `Documentation/README.md` and this runbook.
4. Read `deploy/local-services/README.md`.
5. Read the target service README/source.
6. Check latest `main` commit.
7. Confirm local checkout path.
8. Confirm live runtime path/port.
9. Confirm baseline health.
10. Use PLAN before first mutation.
11. Never touch multiple services just because one changed.
12. Preserve `1 LOC` through `5 LOC` naming.

## 16. Production verification

The normal verifier checks Cloudflared, five local origins, and five permanent named routes:

```text
frames.chicagoshining.com
render.chicagoshining.com
watermark.chicagoshining.com
voiceover.chicagoshining.com
youtube-upload.chicagoshining.com
```

Some root URLs intentionally return HTTP 404 while still proving reachability. Deployment validation uses `/health`.

## 17. Cloudflare/Airtable URL verifier

Keep **VERIFY Cloudflare Airtable Services**. It validates a different layer: Airtable `Pipeline Settings` should have exactly one active permanent URL per service.

The old dynamic **UPDATE Cloudflare Airtable URLs** utility is obsolete for normal operations now that permanent named hostnames are used. Keep it retired/archived.

## 18. Common failure modes

- **Dirty Git checkout:** run `git status`; do not deploy over unexplained changes.
- **Already up to date:** normal condition.
- **LF/CRLF warnings:** usually line-ending warnings; use `git diff --check` for actual source-quality gating.
- **NativeCommandError:** Windows PowerShell 5.1 can treat native stderr as error; framework judges native success by exit code.
- **npm allow-scripts warning:** not itself deployment failure; health checks are decisive.
- **Health failure:** allow automatic rollback; preserve the backup/log evidence.
- **Wrong tab title:** numbered `1 LOC` through `5 LOC` titles are an operational contract.

## 19. Emergency recovery

For a bad managed deployment, use `ROLLBACK Local Service.bat` first.

If local Git is behind:

```powershell
cd "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2"
git pull --ff-only origin main
```

If the checkout is dirty, stop and inspect `git status`. Do not reflexively use `git reset --hard`.

## 20. Moving to another AI

Tell the new AI to read, in order:

1. `PROJECT_RULES.md`
2. `Documentation/README.md`
3. this runbook
4. `Documentation/AI_HANDOFF_GITHUB_AND_LOCAL_SERVICES.md`
5. `services/README.md`
6. `deploy/local-services/README.md`

The AI must understand that `main` is source authority, the local checkout is not production, `Services\...` is runtime, secrets/runtime artifacts stay out of Git, one service is deployed at a time, PLAN precedes risky first deployment, deployment is exact-commit-addressable, rollback exists, health must pass, and live repairs are incomplete until reconciled into Git.

## 21. Deferred housekeeping TODO

Do **not** implement merely because it is documented.

A future work item is to prevent Frame Extractor working frames and Remotion temporary/render working files from accumulating indefinitely. Desired design: post-success cleanup, scheduled orphan sweep, age-based retention, active-job protection, dry-run, cleanup log, disk-space-recovered reporting, and a proven distinction between disposable working state and authoritative outputs/source assets.

See `Documentation/DEFERRED_TODO.md`.

## 22. Source-control operating principle

> **Put reproducible source in Git, keep runtime state out of Git, deploy an exact approved commit into one service at a time, and be able to prove or reverse what is running.**
