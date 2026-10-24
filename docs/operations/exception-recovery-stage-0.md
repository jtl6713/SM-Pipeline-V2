# Exception Recovery Center — Stage 0 audit and initial implementation

Related: issue #1119; uploaded handoff dated October 23, 2026. Branch: feature/exception-recovery-center-foundation-20261023.

## Mandatory reuse audit (repository main, initial audit)

| Capability | Existing implementation | Phase A choice |
|---|---|---|
| Failed detection / classification | apps/studio-api/failed-output-monitor.mjs; QA in Factory and Ops | Reuse existing cursor-paginated scan and \`describeFailedOutput\` |
| Approved past due | apps/studio-api/approved-past-due-quality.mjs and existing heavy cron | Reuse QA-PUBLISH-001 scan and classification |
| Safe autonomous recovery | Worker cron, platform-specific reconcilers, retry gates | Do not add a second worker, scanner, or retry controller |
| Durable verified publication recoveries | apps/studio-api/qa-recovery-ledger.mjs | Reuse; *subset* of all resolutions |
| Existing workflow & batch progress | Factory/Pipeline and approval-batch progress | Reuse; no new mutating API in Phase A |
| Activity / service tickets | Desk inventory and activity in worker-functions-04.mjs | Existing incidents; not an administrator conversation inbox |
| Persistent conversation format | Producer thread in producer-conversation.mjs, in Production_Notes | Reuse pattern; do not store output recovery messages in production notes |
| Help | Help page is guidance, not persisted two-way recovery inbox | Requires verified conversation backend design before mutation |
| Administrator authorization | Worker resolveAuthorization + requirePermission(tenant_admin) | All new APIs must enforce server-side admin, not frontend-only gating |
| Duplicate detection/deletion | Existing pipelines require deeper source-media/lease audit | No new deletion action; human-reviewed only |
| Counts | QA-PUBLISH-001 and failed-output monitor use different criteria from Home | Report observed/provisional counts, never assert parity |
| Supabase Phase 5 | Airtable is authoritative writes; Supabase mirror | No change |

## Phase A delivered

\`exception-recovery-center.mjs\` turns the existing Quality Agent snapshot into a read-only view model with strict field allow-list, one row per output, historical source labels, safe status of unavailable buckets, and explicit provisional counts. It does **not** start a scanner, mutate an output, publish, reset retries, alter holds, or create Airtable tables.

The admin API adapter must enforce \`tenant_admin\` on the server and retain the existing Airtable-backed quality scan. A nav tab and action controls are separate rollout stages: do not expose any administrator UI until access policy and live behavior are verified.

## Next verified checkpoints

1. Verify full production snapshot from all profiles and reconcile exact IDs with Home / Factory / Pipeline count semantics before enabling canonical counts.
2. Review existing Provider readback and recovery locks, and design a shared preflight contract for each action.
3. Implement durable admin conversations with linked output IDs, revision / idempotency fencing, and explicit human approval; no arbitrary command execution.
4. Release read-only interface behind verified admin authorization and an operator feature flag; test GET denied without membership/tenant_admin.
5. Extend existing engines for guarded per-output and bulk actions. No blind repost, automatic delete, bypassed hold or concurrent dispatch.
6. CI and production verification before claiming deployed.

## Stage B–D implementation evidence (draft PR #1120)

- Admin-only UI entry and read-only inventory: `apps/studio-web/index.html`, `assets/exception-recovery.js`, and `assets/exception-recovery.css`.
- Admin authorization via `resolveAuthorization` and `requirePermission(authorization, "tenant_admin")` for all three endpoint families.
- Existing Quality Agent scan is reused; there is no second polling engine. Counts remain provisional and do not claim to match canonical Home/Factory/Pipeline numbers.
- A dedicated Airtable `Exception Recovery Messages` table exists in the ChicagoShining AI Content Creator base, identified as `tbldo9DAxKPU3h0JO`. It has Event_Key, Output_Record_ID, Exception_Signature, Role, Message_Text, Actor, Created_At, Reply_To_Event_Key, and Intent_JSON. It is separate from Output Notes and the verified publication recovery ledger.
- Conversation writes are limited to explicit admin POSTs and fenced by a dedicated, short-lived R2 CAS lease. Stable client request identities allow replay checking. Partial persisted results fail closed. Responses are rule-based safety acknowledgments, not autonomous Producer/Quality Agent execution or provider-verification proof.
- Fresh per-output preflight classifies holds, remote IDs, attempt limits, cooldowns and potential active locks, but deliberately authorizes **zero mutations**.
- Bulk preview of at most five outputs simply calls existing read-only preflight GETs and reports unavailable records individually. It does not acquire publication locks or change output state.
- Dedicated `Exception Recovery Center CI` covers these classes, plus Studio worker source contract and page release-cache parity via existing workflows.

### Remaining before merge and production rollout

1. Run an authenticated, non-mutating live census and reconcile record-by-record with Home/Pipeline/Factory definitions, including Approved No Date, Manual Action, production stuck, suspected duplicates and full intentional holds.
2. Test admin 401/403 refusal and an actual Airtable conversation POST/readback with an explicitly safe sacrificial nonpublishing output. Do not create a fake published record.
3. Prove provider receipt reconciliation and existing stage-specific retry, rework, schedule, hold and duplicate-deletion adapters, each with independent idempotency, fresh output/receipt/lock/hold preflight, explicit user authorization and append-only audited outcome.
4. Expand deterministic auto-heal via existing Quality Agent only after canary and evidence. Retain terminal holds/cooldowns and cross-platform duplicate-publication protections.
5. Confirm full CI, Worker dry-run, deployment gates and verified production health. Leave the PR draft until these gates are met.

*Production status*: no deployment or merge verified for PR #1120. Airtable table creation is a schema-level preparation, not a deployed feature.

## Admin-approved action bridges and provider receipts (October 23 follow-up)

Two explicit, allow-listed administrator POST actions are connected to existing recovery paths under the **existing** per-output Factory/Pipeline R2 approval mutex:

1. \`finalize_existing_facebook_post\`: existing FB3 Page photo/post finalizer. Requires an exact current output ID, saved Facebook Page post ID, eligible FB3 state, no hold or active lock, and a fresh Meta Graph GET matching the saved ID and confirmed public permalink. Revalidates Airtable after the Graph call. Calls **FB3 only**, never FB0/FB1/FB2/create.
2. \`reconcile_verified_existing_receipt\`: reuse QA-PUBLISH-001 \`publishedReceiptRepairReason\` and its *status-only* repair fields for an already-stored \`Published_At\` and trusted public URL. Requires administrator confirmation, exact saved remote ID, live read-only provider verification, no hold/active lock, and a second fresh Airtable preflight after provider latency. Patches only \`Output_Status\`, \`Publish_Status\`, \`Publish_Retry_Eligible\`, \`Publish_Next_Retry_At\`. Re-reads Airtable before asserting success. Reuses the verified Quality Agent Recovery Ledger. No remote upload/post creation.

Every other mutation remains disabled: general retry, repost, reschedule, hold release, Producer rework, duplicate deletion and archival.

Provider receipt probe \`GET /api/admin/exception-recovery/:recordId/receipt\` performs *read-only* Meta Graph and YouTube \`videos.list\` lookups with profile-scoped existing credentials. Facebook requires exact Graph post ID, trusted permalink and \`is_published === true\`. Instagram requires an exact published media ID and trusted permalink. YouTube requires an exact ID and \`privacyStatus=public\`. Unsupported TikTok or missing credentials return "unavailable," not "published." OAuth/Graph credentials are never returned. Remote visibility was **not verified against a deployed Worker**; fake fetchers are used for hermetic tests and a production-side authenticated canary is still mandatory.

Authoritative counts endpoint \`GET /api/admin/exception-recovery/counts?fresh=1\` runs the existing complete cursor-paginated Airtable scan (no newest-250 truncation) and imports **the same** \`mapOutput\`, \`homeApprovedExceptionKind\`, \`homeIsUnpublishedFailure\`, and \`homeOutputContribution\` used by Home and Pipeline. It counts all profiles, approved past due, approved without date, failed, manual-action and held outputs, and returns exact ID-symmetric differences against the existing QA formula scan. It explicitly does **not** claim matching cache-generation parity with the live Home widget until independently verified.

### Live source-side audit (read-only)

A separate connected Airtable pagination scan at **2026-10-24 03:56:47 UTC** examined all **8,084** Platform Output records in **nine** pages, including three Test_Run_ID records excluded from production metrics. Simplified raw-field source inventory: 25 approved past due (17 YouTube, eight Instagram); five Failed; 49 Do_Not_Publish held; zero approved with missing date; 23 saved remote identities with no saved public publication evidence; and no matching FB3 pending-finalize candidate. These are **raw-field source counts, not established Home-normalized or live QA parity**. Airtable records may have changed since this snapshot.

### Remaining mandatory production gates

- Check current admin membership and forbidden access (401/403) on the deployed Worker.
- Run live provider GET with profile-scoped credentials on a safe known existing private/published output and verify explicit privacy evidence; **no live provider receipt call was performed in this development session**.
- Validate complete/full census API against Home/Pipeline/Factory counts with matching generation and record-ID diff. Test 8k-row pagination time under Worker limits.
- Execute safe **existing-post-only** canary with a suitable eligible record, followed by exact provider and Airtable readback, verified recovery-ledger append, and no new remote creation. Snapshot had no FB3 eligible candidate; do not fabricate one.
- Confirm all CI including Worker dry-run, regression, protected deployment and footer/Worker versions. Keep PR draft and do not deploy until gates satisfied.
