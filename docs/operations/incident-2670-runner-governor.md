# Incident #2670 — Python runner load governor (draft rollout)

## Scope and safety

This is a **single-Windows-host** cross-process governor for the Python Studio
producer and Item4 transfers. All runner processes must share one local durable
SQLite database path. The SQLite state is independent from Supabase, avoiding
extra database requests just to queue work during a Supabase outage.

**Do not enable across independent hosts**: they cannot share SQLite WAL safely.
A distributed, Worker-inclusive Supabase/Redis/Durable Object coordinator is
still required before a multi-host rollout. This governor does NOT cover all
Cloudflare Worker requests or all runner modules; it is a bounded first phase.

No path in this change calls a publishing provider, toggles DNP, releases a
publication hold, changes review decisions, or enables Airtable/Make.

## Recovery-mode governor staging (November 22, 2026)

**Do not reactivate old work just to verify the governor.** With
`PIPELINE_RUNNER_RECOVERY_READ_ONLY=true`, new production HTTP writes are
rejected, the governor initializes its SQLite coordination database but does
**not start its autonomous dispatcher**, and its `claim_next()` and
media/write resource admissions are disabled. Bounded read-only Supabase REST
traffic remains permitted. Existing durable queue records are retained.

After this guard is merged and reviewed, the Windows operator should:

1. Keep `PIPELINE_RUNNER_RECOVERY_READ_ONLY=true`,
   `I1_DURABLE_ENABLED=false`,
   `RENDERING_REVIEW_AUTO_DISPATCH_ENABLED=false`, and
   `NATIVE_GALLERY_AUTO_EXECUTE_ENABLED=false` (or unset).
2. Back up the live `.env` once more, then choose a **new, absolute,
   persistent** local SQLite path outside temporary/deployed source folders,
   for example
   `D:\Content Creation\ChicagoShining Pipeline\RuntimeData\governor\studio-workload-20261122.sqlite3`.
   Verify the path does **not** already hold queued jobs; never overwrite
   existing durable governor state.
3. Stage the new `STUDIO_GOVERNOR_DB_PATH` and strict initial
   canary limits: **1 producer / 2 photo groups / 1 ratio worker per group /
   4 in-flight reads / 2 in-flight writes**, but leave
   `STUDIO_WORKLOAD_GOVERNOR_ENABLED=false` for the *first* deployment.
4. **Do not merge the guarded app.py change before the host configuration
   is staged**: `.github/workflows/deploy-pipeline-runner-via-ops.yml`
   includes `services/pipeline-runner/app.py` in main-push triggers and
   may deploy automatically. After CI is green and operator acknowledges the
   staged `.env`, merge and review the GitHub deploy workflow result.
   Use Ops `PLAN deploy` to verify the same commit. Only manually deploy
   if the automatic rollout did not succeed. The deploy restarts the service
   but preserves the live `.env`.
5. Verify loopback `GET /health` reports
   `recovery_read_only=true`, `workload_governor_enabled=false`,
   `i1_durable_jobs=false`. Confirm authenticated loopback
   `GET /admin/workload` returns `enabled=false`. No jobs are launched.
6. **Second controlled service restart:** once the new guard is confirmed
   deployed, change only `STUDIO_WORKLOAD_GOVERNOR_ENABLED=true` in the
   backed-up live `.env` and use the dedicated Ops **Restart one service**
   action for Pipeline Runner. Do not deploy or restart unrelated services.
   With `recovery_read_only=true`, the governor initializes SQLite
   but does not spawn a dispatcher or claim any media.
7. Require `GET /health` to show `recovery_read_only=true`,
   `workload_governor_enabled=true`; require authenticated
   `GET /admin/workload` to show `enabled=true`,
   `recovery_read_only=true`, `admission_paused=true`,
   `active_jobs=0`. Inspect queued/paused counts and verify the
   new staging SQLite path has no pre-existing jobs.
8. Check read-only database connectivity and pre/post aggregate hold counts.
   No publishing provider calls, automatic I1 or Rendering Review consumer
   restarts, or mass queue admissions are part of this phase.
   Do not clear recovery read-only merely because health checks pass.

**Do not clear `PIPELINE_RUNNER_RECOVERY_READ_ONLY` merely because health
passes.** First review the worker's other direct database traffic, reconcile
durable queue and publish holds, and explicitly authorize a single internal
nonpublishing canary. Lifting recovery mode requires a separately approved
restart, because the governor's dispatcher deliberately does not start in
recovery mode.

## Enablement prerequisites (manual, after incident recovery)

1. Verify real Supabase SELECT, production data parity, four profiles, Factory
   previews, provider holds, and no relevant active outage.
2. Ensure one Windows runner host, current runner processes share the same
   persistent local volume. Back up any existing governor SQLite file.
3. Configure absolute `STUDIO_GOVERNOR_DB_PATH` on that host; ensure it is
   writable by all runner processes and backed up with host recovery.
4. Deploy the reviewed and tested governor plus queue, polling and outbox PRs
   together. Keep `STUDIO_WORKLOAD_GOVERNOR_ENABLED=false` until a controlled
   smoke test is approved.
5. Set `STUDIO_WORKLOAD_GOVERNOR_ENABLED=true`; start at **2** producers, **4**
   global photo groups, **2** ratio workers/group, **6** Supabase REST reads and
   **3** writes simultaneously (the latter only for `supabase_pipeline._rest`).
6. Run one nonpublishing synthetic production test and one controlled internal
   real production job without releasing holds. Check
   the governor's local `snapshot()` diagnostics in a nonpublishing test.
   The authenticated loopback `GET /admin/workload` endpoint is staged
   alongside the recovery admission gate, not enabled during an outage.
7. Restart the runner under a queued/claimed synthetic test and confirm leases
   expire/requeue without double-processing. Observe resource graphs, throughput
   and 522/5xx before opening further capacity.

## Failure and rollback

- Jobs accepted while capacity is exhausted remain in the persistent `producer_jobs`
  queue (request ID only); the dispatcher reclaims expired running leases.
- A Supabase 429/5xx/522/transport failure opens a host-wide 90-second
  admission circuit; new producer and media resources pause until cooldown.
  Existing job/transfer resources keep their heartbeat unless ownership is lost.
- Turn **off new admissions at the source** and leave publishing holds intact if
  health remains uncertain. Rollback the flag only after stopping prior jobs;
  legacy in-process mode does not share durable claims.
- Do not delete the SQLite DB while jobs may be queued/running; record its
  state in incident #2670. Do not convert worker failure into provider reupload.
- Recovered jobs are **internal production only**. Provider dispatch and DNP
  must still pass their independent checks.

## Remaining work / explicit nonclaims

- Full multi-host / Cloudflare Worker shared admission and a real database
  health probe require separate integration and canary.
- Other callers of `supabase_reads`, Worker REST APIs and standalone Python
  stages are not yet covered by the `supabase_pipeline._rest` in-flight caps.
- SQLite resource fencing is effective only for participants using this
  governor. Existing external write paths require canonical compare-and-set
  transitions before declaring **global exactly-once** transfers.
- Metrics only cover runner `supabase_pipeline._rest` calls, not total DB load.
- 70% request reduction is a goal to validate, not a claimed outcome.

## Test matrix

- Enqueue same request twice -> one queued/active claim.
- Run three requests -> two active, one persistent queued.
- Simulate process death by expiring a claim -> new fencing token.
- Simulate Supabase 522 -> circuit open, queue retained.
- Launch same transfer twice -> only one owner enters its resource slot.
- Run many photo groups -> at most four active across participating runner
  processes; at most two parallel ratios per group.
- Validate existing Ready, Drive Uploaded, Error and Processing media records,
  unchanged identifiers, and every approval/publish hold.

## Release separation (incident #2670)

- Core governor PR #2674 is feature-flagged OFF by default. It must not trigger
  a production runner release merely because its source was merged.
- Read-only Admin diagnostics and recovery admission gate are independently
  tested before deployment. Editing `app.py` may trigger an automated runner
  deploy workflow; verify deployment triggers and use the gated local Windows
  Ops release. The read-only recovery flag must remain true throughout staging.
- Neither code merge nor enabled feature automatically authorizes the Worker,
  provider publication, or DNP-hold release.
