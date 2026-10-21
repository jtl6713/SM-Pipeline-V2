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
