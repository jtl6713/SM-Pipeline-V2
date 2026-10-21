# QA-PUBLISH-001 — Approved past due, publication unconfirmed

**Scope:** Chicago Shining Studio (SM Pipeline V2), all four active profiles, all active platform output types.

## Why this is a QA signal
A final-approved Platform Output can be past `Scheduled_Post_Date` while not yet showing a confirmed public publication in Studio. This is not sufficient evidence of a failed platform post: scheduled upload, private YouTube video, TikTok draft delivery, accepted webhook, stale Airtable status, and active Graph API processing are materially different states.

**Source of truth:** Airtable Platform Outputs. Supabase remains a read/mirror layer and must never be used as an independent write authority.

**Signature:** `QA-PUBLISH-001 / APPROVED_PAST_DUE_UNRECONCILED`

Candidate selection: `Review_Status=Approved`; valid `Scheduled_Post_Date` at least 15 minutes behind current UTC time; not `Do_Not_Publish`; no recorded Published state or public post URL; test records excluded. Read every page; report scan failure as `unavailable`, not zero. The final UI/production verdict is stricter than merely observing a passed date.

## Evidence priority and safe autonomous actions

| Signature / observation | Classification | Quality Agent action | Can create another post? |
|---|---|---|---|
| Authoritative Published_At and public Platform_Post_URL (not private/draft), current approval and no lock | Stale state | Re-read authoritative Airtable row and reconcile only status fields | No |
| Remote post ID but no verified live URL or publication receipt | Remote identity, visibility unknown | Route to existing platform-specific reconciler; preserve ID and attempt counters | No |
| TikTok draft delivered, needs manual completion | Draft is not publication | Wait for human completion / verified public post URL | No |
| YouTube upload complete/private or provider processing | Upload is not public release | Existing YouTube publish-visibility poll | No |
| Active dispatch lock or Publishing/Processing state | In flight | Let provider poll and lock expiry run; never parallel-dispatch | No |
| Next-retry cooldown active | Backoff | Wait; existing bounded healer owns retry | No |
| `Publish_Status=Failed` | Publish failure | Existing failed-output Quality Agent with cause-specific checks | Only via existing guarded healer |
| `Output_Status=Ready for Review`, `Review_Status=Approved` | Approval/output state mismatch | Reconcile approval outcome before attempting publish | No |
| Eight completed Facebook dispatches without post identity (observed in LA), or three or more uncertain attempts | Dispatch ceiling | Escalate receipts/provider diagnostics; do not reset counters | No |
| Zero dispatches, valid approved-for-publishing state, auto-publish enabled, due | Missed initial dispatch | Existing five-minute overdue rescue / authoritative publish lock | Only through existing idempotent dispatcher |
| Auto-publish disabled or hold | Policy/manual | Preserve hold; never turn it on silently | No |

## Existing services reused
- `studioReconcileOverdueScheduledPublishes` and `studioReconcileApprovedPublishes`: every-five-minute guarded due-publish path, not replaced by a new sender.
- Platform-specific Facebook, Instagram, TikTok and YouTube reconcilers: verification and provider progress.
- `studioHealLiveFailedPublishStatus`, `studioHealFailedStatuses`, `failedOutputRetryGate`: publication evidence, bounded retries, cooldown and lock handling.
- `studioQualityAuditApprovedPastDue`: half-hour heavy cron, complete status census and bounded status-only repairs. Never directly dispatches or marks public posts with inadequate evidence.
- Factory Quality Agent cards: output ID, city, platform, due time, attempts, diagnosis, action, exact Pipeline navigation.

## Production example signatures observed read-only (2026-10-21)
- Los Angeles Facebook outputs with eight recorded publisher dispatches, no saved post ID or URL, still `Ready to Publish`. Automatic redispatch must remain blocked.
- Facebook outputs with Platform_Post_ID but `Publish_Status=Publishing` despite old scheduled dates. Provider visibility must be checked.
- NYC outputs with `Review_Status=Approved` but `Output_Status=Ready for Review`: state disagreement, not proof of publisher failure.
- TikTok processing and YouTube uploaded cases: public visibility is not proven by transfer status.

Screenshot Home count was 30 (18/6/4/2). Because Home snapshots and live queries differ in time, grace, and what qualifies as published, do not assert a fixed live count or assume all 30 are unpublished. Show scan timestamp and counts by cause.

## Acceptance checks
- Zero blind or duplicate reposts during reconciliation.
- Exhausted/cooldown/locked outputs never have dispatch count reset by QA-PUBLISH-001.
- Every past-due candidate has a stable identity and a deterministic action; unresolved unknown platform state is visible, not silently dismissed.
- Completed paginated scan or explicit unavailable status; no newest-12 cap.
- Published status updates require fresh approval, documented publication evidence, and lock/policy checks.
- Airtable authoritative; no Phase 6 migration change.
