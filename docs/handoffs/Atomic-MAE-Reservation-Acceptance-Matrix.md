# Atomic MAE Scheduling Reservation — Acceptance Matrix

Branch: `feat/atomic-mae-reservation-authority`  
Draft PR: #819

Status: **implementation branch only; production authority remains disabled**.

The tests below are deterministic and use explicit barriers/state transitions rather than arbitrary sleeps for concurrency proof. GitHub-hosted Actions are currently terminating before any steps execute, so this matrix records implemented coverage, not a claim that CI has passed.

| # | Required scenario | Concrete coverage | Status |
|---|---|---|---|
| 1 | Ten Facebook outputs produce ten nonconflicting reservations | `schedule-reservation-concurrency.test.mjs` — “ten Facebook outputs commit ten unique nonconflicting MAE reservations” | Implemented |
| 2 | Ten TikTok outputs produce ten nonconflicting reservations | concurrency test — “ten TikTok outputs…” | Implemented |
| 3 | Two Factory batches compete for same profile/platform | concurrency test — “two Factory-style batches on the same lane cannot plan concurrently” | Implemented |
| 4 | Factory batch competes with Pipeline single approval | concurrency test — “Factory batch and Pipeline single approval serialize on the same lane” | Implemented |
| 5 | Different platforms reserve simultaneously | concurrency test — “different platforms do not block…” | Implemented |
| 6 | Different profiles reserve simultaneously | concurrency test — “different content profiles do not block…” | Implemented |
| 7 | Different output types share platform wall-clock occupancy | concurrency test — “different output types share one platform wall-clock occupancy”; MAE regression for same-platform pileups | Implemented |
| 8 | Owner crashes before Airtable write | authority + concurrency tests for expired/pre-write retryable owner | Implemented |
| 9 | Owner crashes after Airtable write | authority test — “crash after authoritative write before ledger confirmation…” | Implemented |
| 10 | Lease expires during in-flight write | concurrency test — “lease expiration during an in-flight external write quarantines…”; Verifying expiry authority test | Implemented |
| 11 | Stale owner tries to release newer lock | authority test — expired pre-write owner replaced then stale release fenced | Implemented |
| 12 | Stale owner tries to commit after losing ownership | authority test — “stale owner cannot commit after a recovery generation fences it” | Implemented |
| 13 | Retry after ambiguous Airtable response | transaction test — “ambiguous response after successful external write…”; authority stable-probe recovery | Implemented |
| 14 | Manual override competes with automatic reservation | concurrency test — “manual exact-time override competing with automatic reservation…”; manual-route source integration | Implemented |
| 15 | Schedule regeneration moves existing reservation safely | authority move test + `studioAtomicApplyScheduleRegenEntry` integration source contract | Implemented |
| 16 | Published and scheduled rows remain occupied | MAE/occupancy tests + integration source assertion that Published rows are not excluded | Implemented |
| 17 | Quality Agent detects and safely recovers hung lock | authority alarm/reconcile tests + Quality Agent HUNG classifier/runtime wiring | Implemented |
| 18 | Quality Agent refuses unsafe ambiguous recovery | authority ambiguous recovery test + Quality Agent Needs Eyes behavior | Implemented |
| 19 | Browser closure does not stop Factory scheduling | concurrency test — “browser/client disappearance cannot release…” + durable Factory batch regression | Implemented |
| 20 | Lock recovery does not duplicate publish/approval | idempotent operation retry writes once; Quality recovery source contract prohibits publish dispatch | Implemented |

## Additional invariants under test

- Feature flag off executes legacy scheduling only.
- Lock key is Content Profile ID + Platform; output type is ledger metadata, not lock scope.
- Final occupancy refresh occurs while the lane is held.
- Durable committed reservations are unioned with Airtable occupancy.
- Airtable schedule write is re-read and compared exactly before reservation commit.
- YouTube mirrored schedule is verified where applicable.
- Release occurs after Durable Object commit, never after calculation alone.
- External writes receive a bounded AbortSignal; default write window is 30 seconds.
- Reservation heartbeat defaults to every 20 seconds while a transaction is active.
- Ambiguous “not committed” recovery waits at least 5 minutes and requires two stable authoritative reads separated by at least 30 seconds.
- Manual explicit times fail on blackout/collision rather than silently moving.
- Schedule regeneration excludes superseded old lane times but reintroduces earlier committed replacements through the durable ledger.
- Factory delete/skip uses a verified `vacate` transaction and clears all schedule mirrors.
- Quality Agent collision findings never silently move approved schedules.
- Quality Agent recovery code never calls publish dispatch.

## Validation gate

Do not enable `STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED` until all of the following are true:

1. Reservation unit/concurrency/integration/quality/runtime suites execute successfully.
2. Studio Worker split/source checks pass.
3. Wrangler dry run validates the SQLite Durable Object binding and declarative class export.
4. Production deploy first provisions the namespace with the authority flag still `false`.
5. Binding/Worker version verification passes.
6. A controlled synthetic or explicitly authorized canary is executed.
7. Only after canary evidence confirms sequential reservations and Quality Agent health may the production feature flag be considered for activation.

## Live production-namespace synthetic canary evidence (2026-10-17)

GitHub Actions run: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/39065990167

Exact tested commit: `62c33d9db89a8c7695e145651083c60ee222173d`.

All six live SQLite checks passed: same-lane contention, unique committed occupancy, prewrite failure, prewrite recovery queue progress, ambiguous quarantine reconciliation, and lease expiry with stale-owner fencing. Sanitized response confirmed `live_namespace=true`, `production_flag_unchanged=true`, `external_write=in_memory_stub_only`, `airtable_writes=0`, and `publishing_calls=0`.

This is not proof of an end-to-end production Airtable scheduling transaction. Before enabling the authority, independently verify temporary canary Worker deletion, current active production Worker version, active flag value, rollback eligibility, and a bounded activation scope. The existing production deploy workflow deliberately enforces the disabled flag.
