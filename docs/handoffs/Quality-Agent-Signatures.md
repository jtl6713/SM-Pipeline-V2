# Quality Agent Signature Catalog

This file is the machine-readable/text companion to `docs/handoffs/Quality-Agent.docx`. Quality Agent checks should consult this catalog when scanning failed, retry-pending, or soon-to-publish outputs.

## QA-TT-DUPLICATE-SLIDES — TikTok duplicate carousel slide links

**First observed:** Platform Output 997, Content 226, October 5, 2026.

### Signature

Recognize this signature when all of the following are true:

- Platform is **TikTok** and the publish route is a native photo / photo-carousel draft.
- `Image_Count = N` for an approved nonzero count.
- The linked **Carousel Slides** table contains exactly **2 × N** rows where `Asset_9x16_Public_Status = Ready` and `Asset_9x16_Public_URL` is nonblank.
- The already stamped `Render_Clip_List_JSON` contains exactly **N** ordered public image URLs.
- Typical failed state, when it reaches TTD0 before being healed:
  - `Publish_Status = Failed`
  - `TikTok_Draft_Status = Retry Pending`
  - `Publish_Error_Stage = TTD0_ASSETS`
  - error text matches: `TTD0 aggregated <2N> ready 9:16 slide(s); expected <N>.`

The Quality Agent should also run this check **proactively before TTD0 fails**. A failure record is not required if the 2× count plus authoritative N-image stamped manifest is already present.

### Root cause pattern

A prior/replayed carousel preparation pass can create a second Carousel Slide record for each logical TikTok slide while both sets remain linked to the same Platform Output. TTD0 then counts both sets and sees twice the approved image count even though the Platform Output itself still has the correct N-image stamped package.

### Safe automatic repair

1. Treat the ordered `Render_Clip_List_JSON` as authoritative only when it contains exactly **N** valid public image URLs.
2. Rebuild `TikTok_Draft_Assets_JSON` from those N URLs in stamped order.
3. Keep `Image_Count = N` and the draft type as Photo Carousel (or Single Photo for N=1).
4. Clear `Publish_Error_Stage` and `Publish_Error_Message`; clear publish locks/retry time.
5. Set `Publish_Status = Ready to Publish` and `TikTok_Draft_Status = Ready for Delivery`.
6. Resume the normal TTD1 draft-initialization path.
7. **Do not delete physical media assets.** If duplicate Carousel Slide rows are cleaned up, detach only the provably duplicate links after a canonical 1..N set has been established.

### Do not auto-repair / escalate instead

Escalate when any of these are true:

- the stamped manifest is missing, has a different count, or contains non-public/blank URLs;
- a TikTok draft publish ID or public post ID already exists and a second initialization could duplicate a post;
- the ready-slide count is not the exact 2× signature and the underlying mismatch is ambiguous;
- slide ordering cannot be proven;
- the output is already Published or manually completed.

### Runtime implementation

- Detector: `services/pipeline-runner/quality_agent/signatures.py`
- Publishing recovery: `services/pipeline-runner/ttd/ttd0.py`
- Signature ID: `QA-TT-DUPLICATE-SLIDES`

TTD0 also has a conservative stamped-manifest fallback for other slide-table count mismatches when the authoritative manifest exactly matches the approved image count. The explicit Quality Agent signature above remains the exact 2× duplicate-link pattern.


## QA-ENGAGEMENT-* — Social Engagement Automation failures

**First observed:** Engagement module Stage A/B, October 8, 2026.

### Signatures

Recognize these `kind` values from Engagement Action `classification.kind` / Worker ledger:

| Kind | Meaning | Recovery |
|---|---|---|
| `engagement_duplicate` | Idempotency key already published/queued | Do not retry; open Engagement history |
| `engagement_repeated_comment` | Near-identical comment text | Edit or skip |
| `engagement_unsupported` | Official API cannot perform the action | Open Post only; never mark automated success |
| `engagement_permission` | OAuth/permission expired | Re-authorize profile; suspend platform until fixed |
| `engagement_quota` | Provider quota / rate limit | Back off until reset; do not raise Studio limits to bypass spam rules |
| `engagement_failed_comment` | Provider hard failure | Inspect error; never blind-retry |
| `engagement_wrong_profile` | Profile isolation mismatch | Switch to the correct brand profile |
| `engagement_irrelevant_ai` | Suggestion failed safety/relevance | Skip or regenerate |
| `engagement_post_deleted` | Target post 404 / deleted | Mark target Expired |
| `engagement_ambiguous` | Unclear whether comment exists | Verify via provider before any retry |

### Rules

- Never blind-retry failed external engagement actions.
- Ambiguous comment publishes must check existing comments first (YouTube uploader idempotency path).
- Unsupported platforms must remain Open Post / manual.

### Runtime implementation

- Classifier helpers: `apps/studio-api/engagement.mjs` → `classifyEngagementFailure`
- Catalog: `apps/studio-api/quality-checks.mjs`
- Signature family: `QA-ENGAGEMENT-*`


## QA-IG-AP1C-MISSING-CHILD — Instagram carousel child creation partially committed

**Observed:** Instagram Platform Output 3420 on 2026-10-16 (five linked slides, four child IDs, AP1C retry count 83).

### Detection

- Platform = Instagram; output type = Carousel; native-photo render route.
- Ordered, linked Carousel Slides count matches approved `Image_Count = N`, and all N public 4:5/IG source asset URLs are Ready.
- `IG_Carousel_Error_Stage = AP1C Child Creation` and `IG_Carousel_Error_Message` matches `AP1C child-ID verification mismatch. Created/retained: M; expected: N.` where `0 < M < N`.
- At least one ordered slide has a blank `IG_Child_Container_ID` while other slides have IDs. For output 3420: slide 1 has no child ID; slides 2–5 have IDs marked IN_PROGRESS.
- A high repeated `IG_Carousel_Retry_Count` (83 on 3420) demonstrates that simply rerunning the same parent stage without slide-level diagnosis is ineffective.

### Root-cause class

**Partial AP1C child creation or partial persistence**: some Instagram child containers were created and retained but at least one was not, preventing the parent from reaching its required N children. The missing slide's Meta API response/transport logs are required to distinguish child-creation failure from persistence failure; do not claim an exact upstream Meta error from the count alone.

### Required Quality Agent repair

1. **Never re-publish when `Platform_Post_ID`, `IG_Carousel_Published_Media_ID` or a verified public permalink exists.** Reconcile status only. Outputs 2352 and 2605 were already Published, and 1702 was Rendered on the 2026-10-16 audit.
2. Obtain a per-slide ledger sorted by `Slide Number` with public asset readiness, `IG_Child_Container_ID`, child status and error/response JSON. Verify exactly N unique numbered linked slides and prevent duplicate logical links.
3. For each nonblank child container ID, query Meta for that specific ID; retain only valid, attributable IDs for the current output and revision. Treat IN_PROGRESS as an asynchronous poll state, not proof of a failure.
4. For blank child IDs only, attempt creation **once under an output+revision+slide idempotency lease**, after confirming no previously created child is recoverable from saved response/attempt log. Record the returned child ID durably on its original slide before verifying aggregate completeness. Never recreate all N children for a single missing ID.
5. Recount N unique valid child IDs, poll each to FINISHED or an explicit terminal error, and only then advance AP2C/AP3C through the existing dispatch guard. Never fabricate child IDs or mark a missing child Ready.
6. If a missing child cannot be safely attributed or created, record its precise slide number and provider response, cap the automatic retry count, use bounded exponential backoff, and raise actionable Needs Eyes. Do not spin 83 retries.
7. On verified Published state, clear historical failed-facing attention indicators by reconciling canonical publication state; never trigger a new publish from a stale failure badge.

### Acceptance checks

- Output 3420 has exactly five distinct Meta child IDs, one for each ordered slide, all verified before any parent publish attempt. State advances beyond AP1C without a repeat 4-of-5 mismatch.
- No duplicate Instagram media is created and published outputs remain terminal.
- Quality Agent reports the missing slide number and actionable recovery step, not only a generic `render_failed` retry.
- Distinguish native-photo carousel children from Remotion MP4 rendering: `Render_Status = Native Photo Route` is expected, **not** a render failure.

**Existing check mapping:** `apps/studio-api/quality-checks.mjs` check `ig_carousel_child_verification_race` / `verify_children_then_advance`. This document refines that signature; runtime implementation and real Meta verification must be confirmed separately.


## QA-SCHEDULE-* — Atomic scheduling reservation authority

**Introduced:** October 17, 2026.

These signatures apply only when the atomic reservation authority feature is enabled. The reservation lane is Content Profile ID + Platform; output type remains a sequencing dimension but does not create an independent wall-clock lock.

### Signatures

| Signature | Detection | Safe response |
|---|---|---|
| `QA-SCHEDULE-LOCK-HUNG` | Owner lease expired or lane entered Recovery Required/quarantine | Fence the prior owner. If no external write was possible, resume safely. If Airtable may have been written, reconcile authoritative state before releasing. A stale heartbeat with a still-valid lease is contention/slow progress, not a hung lock. |
| `QA-SCHEDULE-LOCK-CONTENTION` | A request waits 30 seconds or more on the lane | Record contention and inspect owner progress. Never bypass the lock. |
| `QA-SCHEDULE-RESERVATION-DRIFT` | Durable committed reservation and authoritative Platform Output schedule differ | For unpublished outputs, adopt the authoritative schedule under the same lane lock without moving the post. Published drift requires operator review. |
| `QA-SCHEDULE-COLLISION` | Two committed outputs on one profile/platform violate the platform separation policy | Urgent Needs Eyes. Do not silently move approved schedules. The documented Story companion main +10 exception is not considered a collision with its own main. |
| `QA-SCHEDULE-QUEUE-STALLED` | Oldest waiter exceeds two minutes or quarantine prevents queue progress | Reconcile/recover the blocking lane, then allow normal retries to resume. |

### Recovery contract

A `Verifying` reservation means an Airtable schedule write may be in flight. Lease expiry must quarantine the lane; elapsed time alone never clears it.

Recovery reads the current fencing generation, active reservation, and authoritative Platform Output schedule. The previous owner is fenced before reconciliation. If Airtable matches the selected reservation, preserve it as committed. If Airtable still matches the previous schedule (or remains blank for a first reservation), automatic abandonment requires the configured ambiguity settle period and two stable authoritative observations. Any third state is ambiguous and remains Needs Eyes.

Durable Object alarms perform immediate lease-expiry fencing. The Worker Quality Agent scans the sanitized R2 lane index on its normal cadence for reconciliation, contention, queue, collision, and drift findings.

### Runtime implementation

- Authority: `apps/studio-api/schedule-reservation-authority.mjs`
- Quality classifiers: `apps/studio-api/schedule-reservation-quality.mjs`
- Runtime sweep: Studio API Worker scheduled handler (only after the feature is enabled)
- Durable lane index: `studio/state/schedule-reservation-lanes/v1/`
- Latest Quality Agent report: `studio/state/schedule-reservation-quality/v1/latest.json`


## October 21, 2026: AP1C/AP3C carousel and Factory approval failures (outputs 7932, 7934, 7894, 6934, 7856, 7043)

This incident was investigated against the production Airtable Platform Outputs,
Carousel Slides, and Production Request Outputs tables. Failure diagnosis is
**per-stage**; an approved parent Output can have an unresolved downstream
Instagram task. The Production Request Output may separately remain Draft even
when its routed Platform Output is approved; never rewrite those statuses as a
shortcut. Airtable remains the write source of truth.

### QA-FACTORY-APPROVAL-SOURCE-NOT-FOUND — 7932 and 7934

Both were reported as failing **inside Factory approval**, before Instagram
publishing. Neither numeric Output_ID resolves in production Airtable. An
independent **complete scan of 7,361 Platform Outputs** documented in
[issue #1027](https://github.com/jtl6713/SM-Pipeline-V2/issues/1027)
found the entire neighboring cohort **7931–7936** missing, and a complete
1,372-Content-Item scan found their likely parent **Content 1446** missing.
That strongly suggests a deleted/superseded cohort left behind stale R2
Factory approval items, but does **not** establish whether deletion was
intentional or reveal each Factory item's exact exception text.

Before assigning a precise deletion/retry root cause, read the exact Factory R2
`studio/state/factory-approvals/v2/jobs/{profile_id}/{request_id}.json`
ledger, and for a global submit inspect its corresponding `groups` parent.
Match the stored `item.output_id`, `item.id`, `item.status`, `item.error`,
`item.total_attempts` and timestamped `timeline` to a fresh Airtable
record lookup by **record ID**, not display number alone.

- If the item ledger says approved and the authoritative record is confirmed
  approved, reconcile the ledger only; never resubmit approval.
- If the item failed transiently and the authoritative record remains
  unapproved, retry **only that item**, under the existing profile/approval
  lease and bounded backoff. First recheck whether scheduling or output changes
  partially committed.
- If the output record is absent, its identity is ambiguous, or the approval
  may have written schedule/dispatch state before an exception, **quarantine
  the item and escalate Needs Eyes** with the exact ledger error. Do not
  recreate the content or approve a guessed substitute.
- The Quality Agent must scan Factory batch failures independently from
  Platform Output Failed flags; otherwise precommit failures will disappear.

This signature is an **evidence-pending** classification for 7932/7934 until
the R2 ledger is inspected; it is not a claim that both have the same root cause.

### QA-IG-AP1C-DUPLICATE-SLIDE-SETS — 7856 and 7043

The Instagram AP1C child-creation stage reported
`AP1C slide-set mismatch: final view 8, public-ready 8, expected 4`.
Both Airtable parents have exactly eight linked slide rows (two separate
slide-number groups 1..4), four approved images in the ordered
`Render_Clip_List_JSON`/`Selected_Assets_JSON`, and **no created Instagram
child IDs**. Retry counts were **31** (7856) and **42** (7043).

The two sets have different saved source URL/order combinations: a doubled
count does **not** by itself prove that four rows are interchangeable.
A follow-up read of both outputs established a stronger pattern: for each
logical order, the two slide records share the same approved Google Drive file
ID, **but their saved IG public URLs are shifted**. The authoritative four
approved previews are numbered `0.jpg, 1.jpg, 2.jpg, 3.jpg`; for **order 2**,
neither duplicate row points to `1.jpg` (one points to `2.jpg`, the other
to `3.jpg`). Thus, merely unlinking four rows would still publish a
misaddressed image. Resolve source URL identity and verify the actual public
object before considering the records interchangeable.
Safe remediation:

1. Acquire an exact output + approved media revision lease and ensure the
   output is unpublished, not currently producing, and not held.
2. Read **all** linked slide records, final public URLs, source/asset identities,
   slide numbers, revision stamps, and the authoritative ordered stamped media
   manifest. Verify exactly four unique intended logical media assets.
3. Only if there is an unambiguous 1:1 match for each approved manifest entry,
   detach demonstrably noncanonical *links*, preserving every physical image
   and revision; verify the remaining order and readiness after rereading
   authoritative records. Never arbitrarily select the first four rows.
4. Resume AP1C once under the idempotency fence, ensure four distinct saved
   child IDs and advance through AP2C. If source selection is ambiguous,
   escalate with the conflicting slide IDs and URLs without any mutation.

The pipeline's AP1C failure handler now fences exact doubled mismatch rows
in `IG_Carousel_Status=Retry Pending`, `Publish_Retry_Eligible=false`,
rather than endlessly returning them to Assets Ready. This is an automatic
**containment** action, not an unconditional auto-detach; the latter remains
unsafe without strict manifest matching and an atomic repair lease.

### QA-IG-AP3C-AMBIGUOUS-PARENT — 7894

AP1C/AP2C have finished: four distinct child containers and four children
ready. AP3C parent creation returns **HTTP 500**, Meta OAuthException
`code=2, is_transient=true`; the saved error has a Graph trace ID but no
acknowledged parent container ID. `IG_Carousel_Retry_Count=62`.

An HTTP 500 on a state-creating call is **ambiguous**, not proof that Meta
created nothing. The automated safe action is to quarantine additional AP3C
creates, preserve the complete saved Graph response, and investigate whether
a parent was actually committed. Only a verified existing parent may be
reused; otherwise require a confirmed negative provider outcome before one
bounded re-create. Retain children, media, and schedule. Do not call
`media_publish` as part of the recovery probe. AP3C now quarantines ambiguous
HTTP5xx/unknown outcomes and caps nonambiguous retries.

### QA-IG-EXPIRED-CHILD-STATE-DRIFT — 6934

Airtable parent still reports `IG_Carousel_Status=Children Processing`,
`IG_Carousel_Children_Ready_Count=0`, but all four linked child rows retain
unique provider IDs marked `FINISHED`. The saved parent response contains
Meta OAuthException `error_subcode=2207020`, `Expired Media`:
`The media you are trying to access has expired. Please try to upload again.`
The parent retry count was 2.

The *historical* FINISHED row status cannot override a newer provider error.
AP2C already polls every saved child ID and, **if Meta confirms** all four
FINISHED and current, recomputes the ready count and moves to Children Ready.
If any ID expired, do not promote the stale count: recreate only expired
child containers from the four approved public images with a revision lease,
verify all N, then attempt parent creation **once**. Never regenerate or
reorder source assets merely to clear a stale counter.

### QA-IG-RETRY-STORM — cross-cutting guard

Stop deterministic or ambiguous stage retries after detection, and cap
otherwise transient retries at five across the carousel attempt counter
until a repaired revision is explicitly rearmed. Keep the actual last error,
Stage, Retry Count, Graph trace/response, next eligibility and linked output ID
visible. A retry limit must not be reset by merely clicking the Factory
"Retry Failed" control; only a verified source repair/new content revision
can reset a fenced Instagram publishing stage.

### Autonomous review / recovery lifecycle

- Scan paginated Platform Output failures **and** downstream Instagram stage
  errors without relying only on `Output_Status=Failed`; for child-drift also
  inspect `IG_Carousel_Status=Children Processing` with a saved parent
  response. Scan Factory R2 failed items as a separate surface.
- Report the specific stable signature in the Quality Agent checks catalog
  with the exact output, stage, evidence, action, and whether it was
  automatically contained, repaired, or escalated.
- Always guard by Airtable's authoritative current approval, publish evidence
  (Platform_Post_ID, post URL, Published_At, IG media IDs), active lock,
  cooldown, approved media revision, and original schedule.
- The only unconditional automatic action for ambiguous Meta writes or
  conflicting media sets is **quarantine + actionable escalation**.
  Performing potentially duplicate creates, deleting media, guessing an
  ordering, or forcing a publish is forbidden.
- Reuse the existing AP2C child polling/reconciliation for provably
  verified, safe state drift. Repair only exact, uniquely attributable
  assets or children and verify postconditions before resuming publishing.

**Code:** `services/pipeline-runner/apc/ap1c.py`,
`services/pipeline-runner/apc/ap2c.py`,
`services/pipeline-runner/apc/ap3c.py`,
`apps/studio-api/failed-output-monitor.mjs`,
`apps/studio-api/worker-functions-04.mjs`, and
`apps/studio-api/quality-checks.mjs`.


## QA-FB0-DOUBLE-SLIDE-SETS — Facebook photo output mislabeled Manual Action (2026-10-21)

**Known affected outputs:** Miami #6982 (`recEgbTPeXyX2r2ai`, four expected/eight ready), Chicago #7040 (`receQBUf5jqZtpy99`, four/eight), New York #7060 (`rectIfOlgbmCETdD8`, one/two). All were FB0 stage `FB0_ASSETS`, `FB_Publish_Status=Manual Fallback Required`, `Manual_Fallback_Required=true`; unlike a TikTok draft, **the user cannot complete these manually**. For Chicago and NYC the `Publish_Error_Message` can be blank, so Quality Agent census must explicitly include `Manual_Fallback_Required`.

**Signature:** Every ordered Facebook `Carousel Slides` row is duplicated, yielding exactly `2 × Image_Count` eligible 4:5 assets. Each duplicate pair shares one original Google Drive file ID and `Asset_Family_Key`, but some rows' `Asset_4x5_Public_URL` resolve to a **different ordered image**. FB0 counts all rows, exhausts its three retries, and incorrectly escalates to manual action. Do not just clear the manual flag or choose arbitrary rows.

**Native autonomous recovery:** At FB0, only if there are exactly two rows per manifest order and every row belongs solely to the same Platform Output, has the original approved Drive ID, expected asset-family record, Ready public asset and Shared_Asset_Approved=true: select one row per order using the canonical public URL `https://media.chicagoshining.com/studio/previews/lettered/{output_record_id}/{order-1}.jpg`. Repair any mismapped public URL on that kept row; mark only redundant slide row(s) `Deleted From Carousel=true` and remove their `Platform Output` link, preserving original source Drive/media assets and their other platform variants. **Re-read** after changing links: proceed only when exactly N canonical approved slides remain. Otherwise, quarantine and raise Needs Eyes with per-order details. This signature can be automatically classified as `healer_eligible` by Desk/Factory; it is **not** a user-facing Manual Action.

**For pre-existing held outputs:** Quality Agent may rearm only after an approved, not-published, unlocked and exact-manifest preflight; set `FB_Publish_Status=Ready for Assets`, `Manual_Fallback_Required=false`, restore bounded stage retry state, clear FB0 error fields, and leave approved content and publishing schedule intact. Native FB0 will perform the same guarded reconciliation before any Graph publishing. **Never** rearm after an existing Facebook Post ID / Published_At / active lock. Continue to honor scheduled and rate-limit windows, and do not replay already published output.


## QA-FB-STORY-368-RETRY-PENDING — Facebook Story approved but anti-spam held (2026-10-21)

**Known example:** Chicago Facebook Story output **4112**, "City Or County?"
(`recA52Uk9eLyFOEdi`). Airtable preserves `Review_Status=Approved`,
`Output_Status=Approved for Publishing`, `Publish_Status=Ready to Schedule`,
`Publish_Error_Stage=FACEBOOK_STORY_RATE_LIMIT_368`,
`Publish_Next_Retry_At=2026-10-23T21:47:40.627Z`, and
`Scheduled_Post_Date=2026-10-24T23:40:00.000Z`. The authoritative
`Studio_Publish_Dispatch_Note` contains Facebook's "We limit how often you can
post" refusal. No `Platform_Post_ID`, `Published_At`, or public post URL
is recorded. The Story has an approved public CDN MP4.

**Root cause:** The Facebook Graph Story send path parks a rate-limited Story
without necessarily changing `Publish_Status` to Failed. The older automated
`studioHealFacebookRateLimitRearm` detects only Reel error stages
`FBS3_RATE_LIMIT` and `FB_GRAPH_RATE_LIMIT` with Failed publish state, so a
Ready to Schedule Story never gets rearmed. The quality failed-output census
also ignored approved/non-Failed Story error stages.

**Autonomous detection:** Scan `FACEBOOK_STORY_RATE_LIMIT_368` explicitly
alongside the existing failed census and classify it separately from Reel/FBS3
rate limiting, regardless of whether Publish_Status is Failed or Ready to
Schedule. Treat it as a reversible cooldown hold, not an editorial rejection or
a missing-media/render failure.

**Guarded recovery:** Retain the original approved content, immutable
`Scheduled_Post_Date`, and all attempt history. Never send during cooldown.
After the saved retry time, allow the existing Worker continuation to rearm a
Story **only if** final approval, public CDN media, recorded schedule, no
Do_Not_Publish, no test identity, no publication evidence, no active lock, and
both publish/dispatch counters below their original safety threshold. Clear
only the expired retry/error flags and restore the Ready to Schedule/Ready to
Publish state. The normal due-time dispatcher, not the QA healer, initiates
the eventual Facebook send at the *original schedule*.

**Separate exhausted-attempt state:** Los Angeles Story outputs **2036, 4064,
1133, 2116, 4058, 4004, 1151, 4022, 4034** share the same error stage,
a saved retry time and **8 dispatch attempts** without a verified Facebook
post ID. These are **not permanently irrecoverable** but are *not safe for blind
automatic reposting*. Before any new attempt, reconcile Facebook's publication
state and confirm provider restrictions are lifted. The QA card must say
`remote_verification_required` rather than suggesting a generic retry or a
fresh Approve click. Preserve all counters, refrain from forced reposting,
and escalate Needs Eyes when remote verification is inconclusive. In
particular, a Story disappearing from Facebook after 24 hours is **not**
reliable proof that an earlier create failed. Do not reset an eight-attempt
limit to bypass platform rate controls.

**Related but distinct:** Facebook Reel output 2457 has
`FBS3_RATE_LIMIT` and one attempt, and uses the established Reel rearm.
Instagram AP1C child/parent failures 1023/8221/1076 are unrelated to 368
and must never be handled by this signature.

**Tests:** `apps/studio-api/failed-output-monitor.test.mjs`,
`apps/studio-api/facebook-story-rate-limit-quality.test.mjs`.

## QA-AUTOVERIFY-1050 — autonomous verification recovery and accounting

Extends QA-FB-STORY-368-RETRY-PENDING from merged PR #1045. The Quality Agent
no longer labels exhausted Story-368 retries as "Needs you" simply because
the original attempt counter reached 8. They stay in **pending verification**
with a read-only retry window; no Graph create or historical counter reset is
authorized without trustworthy publication evidence.

**Outcomes:** `publication_evidence` means existing remote identifier,
URL or published timestamp is present; reconcile published status without
posting again. `cooldown_waiting` means no send before the saved retry time.
`pending_verification` means attempt cap blocks a repeat and recorded
evidence is inconclusive. `human_action_required` applies only to an
explicit Meta security checkpoint; display the concrete checkpoint action.
`safety_blocked` honors explicit publication holds. `guarded_rearm`
continues to invoke the original #1045 Worker gate with approval, media, lock,
schedule and attempt ceilings.

**Evidence limitation:** A missing Facebook Story ID or Graph 368 response is
not proof that none of several previous creates succeeded. Until a trustworthy
remote lookup and reconciliation receipts cover the attempts, exhausted Story
holds cannot be safely rearmed; do not tell operations that they were recovered.
This version autonomously reconciles records that ALREADY contain a platform
publication ID/URL/timestamp, and rearms low-attempt cooldowns through the
original publisher. It does not bypass Meta spam protection or auto-reset the
eight-dispatch cases.

**Metrics:** Factory Quality API `output_failures.verification_recovery`, and
Desk Quality API `verification_recovery`, expose unique-output counts for
`recovered_automatically`, `human_action_required`,
`pending_verification`, `cooldown_waiting`, and `safety_blocked`,
with profile breakouts and timestamps. Recoveries are counted from successful
Worker actions tagged `QA-AUTOVERIFY-RECOVERED:<UTC timestamp>` in the
Airtable Studio Publish Dispatch Note, within a rolling seven-day period.
These are observed recoveries only; overwritten historical notes may
undercount. A missing recovery-audit scan reports `partial`, not a false
zero. The failed census remains paginated across every profile.

**Deployment:** Cloudflare Worker version
`0.10.673-autonomous-verification-recovery`, release tested with
`autonomous-verification-recovery.test.mjs`. Airtable remains write
authoritative. No Supabase Phase 6 changes. To roll back, deploy previous
Worker; existing historical attempt counters are never reset.

## QA-FB-STORY-REMOTE-IDENTITY — read-only Meta publication reconciliation (Issue #1050)

**Verifier:** `GET /{page-id}/stories?fields=post_id,media_id,status,url,creation_time`,
using the Page token and current profile's Facebook destination configuration.
Bounded pagination uses the returned `paging.cursors.after` but never follows
an arbitrary `paging.next` URL. No user-access token appears in the query string
or logs. Only an **exact saved numeric `Platform_Media_ID`** matching a Graph
`media_id` with published/archived status and a valid numeric `post_id` is
positive proof. Use Meta's `url` field only if on facebook.com, never compose
an unverified Story URL.

**Source repair:** The native `studioPublishFacebookPageStory` must write the
Graph `start.video_id` to Airtable **before uploading bytes or submitting
finish**. If this write fails, do not send. A later attempt with a saved
media identity performs read-only verification and either reconciles the
confirmed published Story or parks in
`FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING`. No new Graph upload session
may be created while that identity is unresolved. A legacy Graph-368 retry
whose dispatch receipt proves an attempted Story but lacks media identity
also parks rather than posting blindly.

**Autonomous continuation:** The existing Worker Quality Agent cron paginates
all Facebook Story Graph-368 and explicit remote-verification pending records
with a saved media ID, uses profile-scoped Meta settings, re-reads the Airtable
record to validate media identity/lock/status, and reconciles only exact
positive matches. Set Published and the verified post ID (plus URL and source
creation time when available), clear stale rate-limit flags, disable repeated
publishing, and stamp the existing `QA-AUTOVERIFY-RECOVERED` recovery marker
for Factory/Desk counts.

**Negative evidence is unavailable:** An empty Story listing (especially
after 24 hours), revoked token, Graph 368/429, incomplete pagination, missing
media identity, or lookup timeout is **never** proof that no prior Story
was posted. Existing exhausted-attempt outputs without saved media ID cannot
be safely reposted automatically from the evidence available. They remain
pending verification with a specific reason, not a misleading successful
recovery or a generic manual-action demand. A future provider-supported
idempotency/authoritative send ledger is required for any verified-not-published
retry path; no counter reset or override is provided here.

**Safety/rollback:** Airtable remains write authority, and all existing
approval, asset, lock, schedule, cooldown and retry limits remain intact.
The new Graph client performs only GETs, never POSTs. If errors increase, roll
back Worker source and keep saved media IDs and held publication states; never
erase them to make retries proceed.

## QA-ASSET-LOCATION-MISMATCH — Scripted-short location-constrained library media

**First observed:** Battery Park City history proposal, New York Shining profile,
October 21, 2026. The prompt expressly required uploaded Battery Park images;
the proposal incorrectly claimed successful library matches for Lincoln Park
Boardwalk, North Pond, and North Avenue Beach (Chicago).

**Signature:** A scripted-short prompt requires uploaded imagery from a named
place and any scene references a missing media asset, a different content
profile, or an asset whose library name, Location, Topic and Asset_Description
contain no evidence of the requested place. A valid Airtable media ID is **not**
evidence of geographic relevance. Scope applies to Chicago, New York, Los
Angeles and Miami profiles.

**Prevent / repair:** The Proposal Engine extracts an explicit location/media
constraint before searching. Filter discovered candidates to the profile and
place before passing the catalog to the writer. The independent Quality Agent
checks the finished timeline; if a mismatch is detected, replace only with an
unused, eligible library file. If no verified replacement exists, leave that
scene unassigned, explain what imagery is missing and report suggestion_count
rather than a false success. If zero eligible files exist, stop proposal
creation with a clear 409. Proposal acceptance re-fetches the exact media
records from authoritative Airtable and runs the same independent check
*before* any idea or Production Request writes.

**Safeguards:** Preserve original voiceover and scene ordering; no automatic
external-image ingestion, public publishing, synthetic geographic metadata,
cross-profile substitutions or Drive media mutations. An unscoped asset needs
direct location evidence. The UI may display all-library success only when
the validation reports no mismatch and zero unassigned scenes.

**Observability:** Proposal payload reports asset_policy and
asset_validation with verified/unassigned/recovered/unresolved counts,
signature and mismatches. Escalate incomplete imagery to the proposal editor;
do not rerun indefinitely. Regression tests use the original Battery Park
prompt plus Chicago, New York, Los Angeles and Miami fixtures.

**Rollback:** Revert the Worker asset-policy integration and its catalog entry;
no Airtable schema migration or mutation is required.

## QA-SCRIPTED-SHORT-PRODUCER-CONSTRAINTS — Durable brief and production-plan fence

**Signature:** A Script-a-Short draft reaches Production without its structured
Producer Plan, crosses content profiles, loses a required uploaded Media Asset,
replaces a scene's required asset without an explicit revision, leaves a scene
unassigned, or selects media whose saved name/location/topic/description does
not support the requested place or topic.

**Prevent / repair:** Proposal and Accept independently validate authoritative
Media Asset rows. Accept stores the exact original brief on the linked Idea and
a structured Producer Plan on the Production Request. Production bridge
preflight and Approve validate the saved plan again against the authoritative
master manifest and timed scene order. A missing asset stays blocked with a
scene-specific remediation message. Restore the required upload, select a
verified match, or make an explicit Producer/Factory revision; never silently
substitute unrelated media.

**Factory connection:** Producer Plan notes remain attached while the existing
Factory Request Changes workflow creates a revision job, holds publishing,
rerenders, and runs independent post-render evidence checks. A revision cannot
erase or bypass the initial constraints implicitly. Fresh human review remains
required after a completed revision.

## QA-AUTOVERIFY-LEDGER — durable reconciled publication metrics (Issue #1050)

**Production Airtable schema:** `Quality Agent Recovery Ledger` in the existing
ChicagoShining AI Content Creator base. Fields: `Event_Key` (deterministic),
`Output_Record_ID`, `Output_ID`, `Profile_ID`, `Platform`, `Output_Type`,
`Outcome`, `Evidence_Source`, `Media_ID`, `Post_ID`, `Verified_At`,
`Reconciled_At`, `Actor`, `Details_JSON`. Times are UTC ISO-8601 strings.
No sensitive tokens, session URLs or credentials are stored.

A recovered output counts only if the Quality Agent reconciled it from
**positive** publication evidence, reread authoritative Airtable as
`Publish_Status=Published` and `Output_Status=Published` with a matching remote
post ID, and appended an event with `Outcome=reconciled_published`. A cached
scan or retry attempt is not a recovery. Event keys are deterministic per
output/outcome, dashboard counts are deduplicated by output record ID and
reported for a bounded 7-day period. Concurrent repeated inserts are harmless
to reported counts but should be audited for duplicate event rows.

The valid evidence sources are `meta_page_stories_exact_media_id` (exact
Graph Story GET match; NO Graph create) and
`airtable_existing_publication_receipt` (both recorded remote post ID and
publication timestamp already exist; reconcile stale Studio status only).
If ledger reads fail, Factory/Desk mark recovery metrics **partial/unknown**;
never silently translate an unavailable ledger to zero.
The deployment's read-only Factory canary now requires a healthy production
ledger query to pass before release is considered safe.

**Exhausted Story classification:** Dispatch cap takes precedence over
`Publish_Next_Retry_At`; a 48-hour Meta cooldown does not authorize a ninth
Story send. Twelve October 2026 LA eight-dispatch Stories remain
`pending_verification` + `safety_blocked` until authoritative proof is
available, even if shown with a future cooldown date. No reset, speculative
repost or bypass of original approved schedule/locks.

**Operational canary:** Once the code deploys, observe an existing
receipt-positive Facebook Story with an inconsistent Studio publication state
transition to Published *without any new Meta Graph POST*. Verify exactly
one ledger event for that output, a matching post ID, and Factory/Desk count
increase by one. Also verify the 12 exhausted LA Story records retain
dispatch_count=8 and have no new Meta upload identity. A mocked-Graph GET-only
test is NOT a substitute for live readback. Previous `QA-AUTOVERIFY-RECOVERED:`
notes are reconciled into the durable ledger when original positive
publication fields remain present; overwritten notes cannot establish
historical completeness. Airtable remains authoritative. No Supabase
Phase 6 write cutover.


## QA-IDEA-PHOTO-SLA — automatic matching / production handoff

- **Detect:** On bounded five-minute Worker scans, classify eligible unpromoted non-held Ideas older than two hours with (a) no photo-matching attempt, (b) Waiting and last attempt older than two hours, or (c) Ready with no linked Production Request. Classifier: `ideaPhotoMatchingSlaFinding` in `apps/studio-api/idea-photo-wait.mjs`.
- **Evidence:** `studio/state/quality/idea-photo-matching/latest.json` in the Worker `STUDIO_MEDIA` R2 binding; records the scan timestamp, finding counts, exact Idea record IDs, and profile IDs.
- **Safe recovery:** Only the existing bounded automatic listener, photo matcher, and idempotent ready-production queue may mutate eligible Ideas. Respect manually paused/held/rejected/promoted Ideas and preserve manually selected photo deletions.
- **Escalate:** Repeat offenders that remain stale after the next successful, non-cooldown match attempt, or any result lacking authoritative profile-scoped media. Never create platform posts, bypass final human approval, or repeatedly manufacture a Production Request to clear this signature.


## QA-IG-STALE-UPLOAD — Instagram Reel orphaned AP1-IG publishing lock

**First identified:** 2026-11-02, 68 orphaned AP1-IG locks across NYC (23), Chicago (17), LA (16), Miami (12). A further NYC Reel #9098 had saved provider identifiers and requires separate receipt reconciliation.

### Detection contract (30-minute default)

- Approved, automated Instagram Reel with Publish_Status=Publishing and Publish_Locked_By=AP1-IG.
- Publish_Locked_At and Last_Publish_Attempt_At both older than 30 minutes. The default threshold is configurable; do not treat the UI 85% bar as proof of ongoing activity.
- Independently check runner instance heartbeat and lease-expiration/fencing token. A fresh heartbeat or valid lease forbids recovery; missing observations must be reported explicitly.
- No test identity, review hold, Do_Not_Publish, publication receipt, active provider cooldown or replacement transaction.
- A saved Platform_Media_ID / Platform_Post_ID / URL requires provider reconciliation, **not** another Graph create.
- A missing saved provider ID is not proof that the provider request never committed.

### Guarded recovery contract

1. Read authoritative Airtable output immediately before claiming the exact output. Compare current owner, lock generation, attempt timestamps, approval, holds, cooldown and identity with the detected snapshot.
2. Independently query runner heartbeat/lease state and fence the prior generation. If lease state is unknown or a remote create may have succeeded, escalate or reconcile before any new dispatch.
3. Query Instagram for saved container, post and permalink. For a confirmed live post, persist the receipt only after identity proof. For a processing container, resume **that exact container**. If provider state remains ambiguous, mark Needs Eyes rather than claiming a safe retry.
4. Only when remote identity is conclusively absent and old owner fenced, release Publish_Locked_By / Publish_Locked_At / Publish_Started_At, preserve attempts and historical notes, and reschedule via the **atomic MAE reservation authority** (profile-local time, configured horizon, 90-minute separation, priority windows then balanced overflow, blackout and lane contention). Do not directly stamp calendar dates without reservation reconciliation.
5. Append an auditable attempt event with signature, output and profile IDs, source/stage, prior lock owner/generation, heartbeat and remote check result, old/new reservation, actor, UTC timestamps, and outcome. Make replay idempotent. Airtable is authoritative; Supabase is only a mirror.
6. Publish only when the new scheduled time is due and a fresh attempt has acquired its own lease. Respect provider limits and holds. Accepting duplicate risk is not permission to bypass the review/publish safety gates.

### Regression coverage

- Crash after lock but before Graph create; after Graph create but before container ID write; after publish but before Airtable receipt; after Airtable schedule write but before reservation commit.
- Fresh heartbeat, valid lease, changed generation, hold, replacement, existing provider ID, cooldown, insufficient media/caption and exhausted attempt controls.
- NYC, Chicago, LA and Miami time zones, DST, full priority windows and balanced overflow; rescan idempotence, independent authoritative readback and audit write failures.
- Render a stalled/Needs Eyes status rather than an indefinitely frozen 85% Uploading bar.

**Implementation status (2026-11-02 branch PR #1531):** The Python classifier and fail-closed coordination seam have unit tests. The Studio Worker half-hour heavy-cron scanner is wired in `apps/studio-api/qa-ig-stale-upload.mjs`, bounded to 8 candidates per tick, with an authoritative reread, optional authenticated exact-post-ID Instagram account membership check or exact saved-container status GET (IN_PROGRESS/FINISHED/PUBLISHED/ERROR/EXPIRED), and idempotent finding records in the Airtable `Quality Agent Recovery Ledger`. The existing saved-publication reconciliation cron remains responsible for independently verified status-only finalization. The Python AP1-IG producer now clears an exact owned lock on prepublication review-guard returns, and quarantines ambiguous Graph requests instead of erasing container IDs or allowing blind fresh creates. **Automatic stale-process fencing, a durable cross-runtime per-attempt heartbeat/lease, definite proof of remote non-creation, and MAE transaction-driven rescheduling are NOT yet connected.** The scanner is report-only (`graph_creates:0`, `lock_releases:0`, `reschedules:0`); operator triage remains mandatory for missing/ambiguous remote identities. GitHub branch CI is not production verification. Do not enable unattended reupload or claim end-to-end recovery until the missing safety components have been built and canary-verified.
