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
