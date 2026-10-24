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
