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
   The authenticated runner `GET /admin/workload` endpoint is held in
   separate draft PR #2676 because editing app.py triggers auto-deployment.
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
- Read-only Admin diagnostics endpoint and health flag are separately staged in
  draft PR #2676; this edits `app.py` and therefore can trigger the Windows
  runner deployment workflow. Only release it after Supabase read/write recovery
  and explicit operator approval.
- Neither code merge nor enabled feature automatically authorizes the Worker,
  provider publication, or DNP-hold release.
