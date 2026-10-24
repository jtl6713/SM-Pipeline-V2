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
