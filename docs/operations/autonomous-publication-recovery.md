# Autonomous publication reconciliation

This is a status-only recovery listener on the existing Worker minute cron.
It cannot upload, publish, finalize provider posts, release holds or reset retry
ceilings. Airtable remains authoritative; the existing Airtable gateway retains
its Supabase write-through and Home invalidation behavior.

## Deployment gates

- PUBLICATION_RECONCILIATION_SCAN_ENABLED: literal "true" enables background inspection.
- PUBLICATION_RECONCILIATION_ENABLED: literal "true" separately authorizes status correction.
- PUBLICATION_RECONCILIATION_CANARY_RECORD: exact Airtable record ID eligible for the first correction.
- PUBLICATION_RECONCILIATION_BOUNDED_ENABLED: literal "true" permits other eligible outputs after the approved canary.
- EXCEPTION_RECOVERY_ACTIONS_ENABLED is unchanged and controls administrator actions only.

All gates default OFF. Do not enable either mutation flag as part of a read-only
deployment. The user must approve the first exact live correction after fresh
authenticated evidence; only then may the bounded rollout be considered.

Default scan interval: 15 minutes, two queue entries per interval, one source
page of up to 100 records per interval, 60-minute verification cooldown, five
verification attempts. Interval, batch, cooldown and maximum attempts are
configurable through PUBLICATION_RECONCILIATION_INTERVAL_MINUTES, BATCH_SIZE,
COOLDOWN_MINUTES and MAX_ATTEMPTS. Batch maximum is five. These are verification
attempts; publisher counters are never incremented or reset.

The global scan and each output use the existing R2 approval lease. Discovery
and processing cursors, cooldowns, pending write intents and last results persist
in R2. A pending write is resolved by authoritative readback after restart;
partial/conflicting results require a decision and never cause a blind PATCH.

## Evidence and history

Append-only events are stored in the existing Airtable Exception Recovery
Messages table with signature AUTONOMOUS-PUBLICATION-RECONCILIATION. Each attempt
has a UUID; intent, uncertainty and outcome events have separate deterministic
keys. The service reads back the audit and restart journal before PATCH, then
rechecks the output and evidence. Success requires authoritative Airtable
readback. Repeated checks of fully reconciled outputs do not append duplicate
successes. History remains available after an output leaves active inventory.

The administrator-only history endpoint is GET /api/admin/exception-recovery/history.
It returns paginated durable audit events with date, profile, provider, result,
actor and text filters. Filters apply to each source page; continue through
next_cursor even when a filtered page is empty. The UI explicitly discloses
this. Historical administrator events lacking stored snapshots remain labeled
as saved audit events; new administrator actions capture before/after metadata.

The active UI uses the existing canonical inventory and provisional QA parity
disclosures. Worker status is attached to the first 100 observed QA cases;
unavailable state is shown as awaiting verification, never as active automation.

## Provider coverage

YouTube uses the existing profile uploader GET /youtube/oauth/status and
GET /youtube/videos/:id, authenticated with its existing service credential.
The authenticated channel and video snippet channel must both match the fresh
Content Profile YouTube_Channel_ID. Exact saved video ID, channel ownership, successful provider processing,
and matching explicit provider scheduling (when Studio has a saved YouTube
schedule) are mandatory. A saved public URL is NOT required: it is frequently
missing precisely because Studio failed to finish its own status update.
Existing URLs must still agree with the authenticated provider identity.

There are two distinct successful Studio completion outcomes:

- **Already public:** Output_Status=Published, Publish_Status=Published, provider
  public URL and actual verified publication timestamp. No second upload.
- **Delivered privately/unlisted or scheduled:** Output_Status=Awaiting Public
  Release, Publish_Status=Published Privately, YouTube_Stage=Complete.
  Studio handoff is completed and excluded from the overdue/error recovery
  queue, but it is **not** counted as publicly published. Do not synthesize
  Published_At or populate a missing public URL from a private video.

For both outcomes clear the Studio publish-retry eligibility and retry clock
only after successful authoritative readback. The external YouTube schedule
must remain intact. Missing channel identity, conflicting saved permalinks,
mismatched provider schedule, or incomplete upload/processing block correction.

Facebook, Instagram, TikTok and other destinations remain decision-only for
autonomous correction. Existing read-only receipt UI remains available. Their
account ownership/publication contracts and live canaries must be strengthened
and tested before extending the automatic policy. Draft delivery is never proof.

## Validation and activation

Run the dedicated Exception Recovery Center CI and new authenticated-adapter,
policy, persistence and concurrency tests. Publication Recovery Read-Only Canary
uses existing GitHub credential infrastructure to independently read output
4092 and hc1heQnfn6k, its current profile and provider receipts. It performs GETs
only and emits a sanitized report. A blocked canary is evidence of a blocker,
not a successful recovery.

Before release verify Worker bundling, Pages, actual live deployment versions,
all effective gates, the history authorization boundary and persisted audit
readback. Keep production corrections disabled until explicit canary approval.
Do not claim the mock suite proves live provider success.

## October 24 read-only integration verification and cleanup

- PR #1120 (read-only Exception Center) is merged. PR #1136 added the
  Recovery History view; PR #1141 released the Studio 0.6.759 read-only UI.
  This mainline PR #1142 remains draft until its independent gates pass.
- Live Airtable output #4092 still has the saved YouTube video
  `hc1heQnfn6k`, `Review_Status=Approved`, and Publishing/Approved for
  Publishing states, with the October 23 scheduled handoff date.
  **These Airtable fields do not independently prove authenticated delivery.**
- Real record links confirm that Platform Outputs.Content_Profile is a
  **multipleLookupValues display field**, not the actual Content Profiles
  link. Before each status-only action, resolve
  Output.Content_Item → Content Items.Content_Profile → Content Profiles,
  verify all record IDs, and normalize the ownership identity.
- The LA Content Profile lacks a populated YouTube_Channel_ID, but active
  `LA_YOUTUBE_CHANNEL_ID` exists in Pipeline Settings. The Worker and the
  read-only canary now use the same fail-closed scoped channel resolver; any
  conflict between both sources blocks the action.
- The GET-only canary also repeats the authoritative output/content/profile
  checks after provider readback. If a link or output state changed while
  the GET was in flight, it blocks rather than treating stale proof as valid.
- The Actions canary now uses the established temporary Cloudflare service-binding
  bridge to call the deployed Worker's fixed read-only endpoints. It does not
  copy or decrypt Airtable credentials. The bridge is deleted in cleanup.
- The repository currently contains other long-lived divergent feature
  branches. Do not delete those solely for a cleaner branch list; independently
  prove their changes merged or are superseded. Obsolete self-patching
  workflows were already retired in merged PR #1140.

Do not enable `PUBLICATION_RECONCILIATION_ENABLED`,
`PUBLICATION_RECONCILIATION_BOUNDED_ENABLED` or administrator action
mutations on the basis of local mocks or Airtable state alone.


## Authenticated live reference proof — 2026-10-24 22:08 UTC

Read-only Airtable output/content/profile checks and authenticated uploader GETs
verified output #4092, “E Line To Beach,” against video `hc1heQnfn6k`, owned by
LA channel `UCVt3nBxRfPuuxxduuxmz9sw`. YouTube returned processed/public and
publication time `2026-10-23T12:40:01Z`. Airtable still read Approved for
Publishing / Publishing and was unchanged after provider verification.
Inspected: 1; verified: 1; corrected: 0; remote writes: 0.

The real response exposed an obsolete schedule check: public videos no longer
need a future `publishAt`. The adapter now requires schedule matching only for
nonpublic delivery. The deployed Worker canary must independently reproduce the
proof and verify History authorization before requesting the first correction.
This reference proof does not authorize a production status mutation.
