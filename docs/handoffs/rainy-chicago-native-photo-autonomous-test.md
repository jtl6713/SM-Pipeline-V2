# Rainy Chicago native multi-image — autonomous system test

This runbook tests the **production autonomous path**, not an operator (human or agent) driving Make.

The Studio Worker is the orchestrator. Interval Make cadence is parked (`PRODUCTION_CADENCE_PARKED`). After a normal Studio promote, cron and promote `waitUntil` are supposed to continue the item until it is ready for Joseph to Approve in Studio. If that does not happen, the system is not autonomous yet — that stall is the defect to fix.

This supersedes both `docs/handoffs/multi-image-rainy-chicago-e2e-prompt.txt` (stage-by-stage pulses) and the previous draft of this file (isolated Make selector patches).

**Do not stamp `Test_Run_ID`.** Worker continuation, RR1, SMV1, P3 planned-output, and publisher queues all require `{Test_Run_ID}=BLANK()`. Tagging a test hides it from the very autonomy under test. Isolation is the wiped operational slate plus no Studio Approve (Approve is what arms live publishers).

---

## 1. What this test is *not*

The agent will **not**:

- Open Studio in a browser and click through screens
- Patch Make selectors to `RECORD_ID()` / this fixture
- `scenarios_run` / activate a cadenced scenario for a one-off pulse
- POST Make webhooks (P2, P3, RR2, AP1-IG, FBS, TTD, …) from the agent
- Call Worker repair/pulse/continuation endpoints as a substitute for cron
- PATCH Airtable stage fields (`Output_Status`, `Render_Status`, `Review_Status`, `Publish_Status`) to fake progress
- Use Item 7 `pulse_item7_exact_stage`
- Leave MAKE-ADMIN-BRIDGE `5893243` running
- Turn interval Make cadence back on
- Call Studio Approve (that path sets `Auto_Publish_Enabled=true`, clears `Do_Not_Publish`, and dispatches Graph/TikTok)

If a stage does not move, the agent does **not** pulse it. The agent diagnoses why cron / promote follow-up / native routing did not take the row, patches the Worker or scenario so the **next scheduled tick** would, then waits for that tick.

---

## 2. What the autonomous system is supposed to do

Production behavior already in `apps/studio-api/worker.js`:

| Trigger | What the Worker does |
| --- | --- |
| Studio **Promote** | Arms parent, POSTs P2 if VO/thumb needed, POSTs P3, `waitUntil` `advanceStudioProductionOutputs` + carousel/SMV1 |
| **Cron** (`scheduled`) | Publish reconcile first, then parked cadence sync (on-demand pulse **only if queue has work**), then continuation |
| Continuation | Inspects blank-`Test_Run_ID` in-flight outputs; pulses P1/R2/R3/R4/R5/RR1 only when their work formulas match; drains SMV1; C2 if variants/AI waiting |
| Studio **Approve** | Product gate. Arms webhook scenarios, POSTs the publisher hook, runs that platform’s on-demand orchestrator. **Out of scope until Joseph authorizes live publish.** |

Native photo contract (this fixture):

- Instagram `Carousel` / Instagram Carousel
- Facebook `Multi-Image Post` / Facebook Photo Set
- TikTok `Multi-Photo` / TikTok Slideshow
- Voiceover **No**, music **No**, no Story/Reel/YouTube extras
- P3 must leave those three `Ready for Review` with `Native Photo Route` (or equivalent), **no** Remotion job
- R2–R5 work formulas must **not** match them
- RR1 work formula already includes those three native types (`STUDIO_RR1_WORK_FORMULA`)
- SMV1 / CDN crops must complete because continuation sees `missing_ratio_crop` / `wait_variants`

Parked cadence is correct. Autonomy is “Worker sees work → on-demand pulse → parks again,” not “agent pulses Make.”

---

## 3. How the agent conducts the test

### Allowed actions

1. **One front-door seed** through Studio API (`https://studio.chicagoshining.com`), the same sequence the UI uses:
   - `POST /api/ideas` — rainy Chicago title/summary
   - Create production request from that idea
   - Upload three Chicago rain stills as Item 4 masters (Drive/Wikimedia, not CI82 trash)
   - `POST .../plan` with **explicit** native overrides (do not trust Reel/Slideshow planner defaults)
   - Set voiceover/music off, no Story extras
   - `POST .../promote`
2. **Read-only observe** Airtable + Make execution lists + Worker logs until a gate passes or a stall timer fires.
3. **Harden the autonomous path** when stalled: smallest Worker/scenario mapping fix so cron would select the row, then wait for the next tick.
4. Write evidence under `repair/evidence/rc-native-auto-<id>/`.

If Studio API auth is blocked, **stop**. Airtable-only seeding plus Make pulses is not this test. That is a Joseph auth gate.

### Stall rule

For each observe gate, wait through **at least two cron cycles** (Worker comments describe a ~two-minute tick; use 8 minutes as the default stall window unless a Make run is still in flight). Then:

1. Snapshot the outputs vs the expected fields
2. Evaluate live `STUDIO_*_WORK_FORMULA` / continuation inspect reasons (`wait_variants`, `missing_ratio_crop`, `wait_voiceover`, `no_package`, native vs Remotion)
3. Patch Worker or Make mapping so the **production** formula would match
4. Wait another two cron cycles
5. Repeat up to three unique root causes per gate
6. Never `scenarios_run` as a shortcut

---

## 4. Fixture

| Field | Value |
| --- | --- |
| Title | `Rainy Chicago — native multi-image test` |
| Photos | 3 distinct Chicago rain stills |
| `Test_Run_ID` | **blank** |
| `Do_Not_Publish` | **false / blank** (true would also hide the row from P3 planned-output and Approve) |
| `Auto_Publish_Enabled` | remains off until Joseph Approves in Studio |
| Plan | IG Carousel, FB Multi-Image Post, TT Multi-Photo only |

Isolation: operational tables were wiped after CI82. Do not create a second idea. Do not Approve. Do not enable interval cadence.

---

## 5. Test cases (observe gates, not pulse scripts)

### TC0 — Autonomous control plane is alive

**Do:** Read-only. Confirm `PRODUCTION_CADENCE_PARKED` behavior in live Worker: cadenced R/RR/publisher scenarios OFF, P2/P3 webhook scenarios valid, cron is deployed, MAKE-ADMIN-BRIDGE OFF, AP0 skip documented if still invalid.

**Pass:** Parked cadence, webhook identities preserved, cron exists. No Make writes.

**Fail:** Cron missing or cadence left ON globally → fix Worker/deploy, do not start interval clocks by hand.

### TC1 — Front-door seed and promote (only agent write)

**Do:** Studio API idea → 3 photos → native plan → promote. Stop talking to write APIs.

**Pass:** Content Item + three Platform Outputs exist. Promote response shows P2/P3 handoff attempted by the Worker (not by the agent). `Test_Run_ID` blank.

**Fail:** Planner emitted Reel/Slideshow only → force native overrides on the **plan request** (still front door). If promote did not POST P3, that is a Worker promote bug, not a reason to POST hook `2567877` from the agent.

### TC2 — P3 native handoff (observe)

**Expect within stall window, with no further agent writes:**

- Three outputs, types Carousel / Multi-Image Post / Multi-Photo
- `Output_Status=Ready for Review`
- `Render_Status=Native Photo Route` (or photo JSON present and `Remotion_Job_ID` blank)
- Captions non-empty
- TikTok `Composition_ID` blank

**Fail/fix:** P3 module 103 still sending native types `In Production` + `Selected` → patch P3 so **cron/promote P3** writes Ready for Review; wait for the next promote-follow-up or P3 planned-output sweep. Do not POST the P3 hook yourself.

### TC3 — Remotion stays dark (observe)

**Expect:** No `Remotion_Job_ID`, R3/R4/R5 executions are `no_work` / not started for these rows. Continuation R2 skip-photo-sequence remains in effect.

**Fail/fix:** Tighten `STUDIO_R3_WORK_FORMULA` / P3 native status so cron cannot treat these as Ready for Render. Wait. Do not stop a render by pulsing R5.

### TC4 — Variants / public URLs (observe)

**Expect:** SMV1 drain on cron fills 4:5 (IG) and 9:16 (TT) public CDN URLs (`media.chicagoshining.com`). Continuation reasons `wait_variants` / `missing_ratio_crop` clear.

**Fail/fix:** Item 4 drain / SMV1 selector. Next cron tick must drain. Do not pulse SMV1 `5894885` from Make MCP.

### TC5 — RR1 without a Make pulse (observe)

**Expect:** Cron continuation sees `STUDIO_RR1_WORK_FORMULA` and on-demand pulses RR1 itself. `Review_Status` / `Review_Email_Sent_At` may stamp. Item 10: email is not the pass criterion. Ready for Review with a reviewable native package is enough if RR1 is deferred to dashboard.

**Fail/fix:** If RR1 formula or continuation skips IG/FB native (composition stale, missing JSON), patch **canonical** RR1 / `STUDIO_RR1_WORK_FORMULA` so the next cron tick matches. Do not isolated-pulse RR1.

### TC6 — System is waiting on Joseph, not on Make

**Pass (hardened enough to invite Joseph):**

- Three native outputs reviewable in Studio
- No Remotion jobs
- No agent Make pulses occurred after promote
- Cadence still parked
- `Auto_Publish_Enabled` still off
- Evidence JSON written

Joseph’s test is **Approve in Studio** for one platform at a time. That is the real publish autonomy (approve-arms-publishers + reconcile cron). Until he does that, the agent does not Approve via API either.

### TC7 — Live Instagram Carousel Approve (output 224 only) — **partial pass**

Joseph authorized Studio Approve for [output 224](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recALRkjWgVg066OA) only. 225 and 226 were **not** approved.

| Check | Result |
| --- | --- |
| Silent native carousel posted (3 stills, 4:5, feed `/p/`, not a Reel) | Pass |
| Post caption on Instagram | **Fail** — no caption on the live post/images |
| AI grid cover / thumbnail | **Fail** — grid used the first still crop, not a designed title card |

Airtable after Approve did have `Output_Caption` + hashtags on 224. Parent CI 89 had the same caption, `Include_Thumbnail=Yes`, `Thumbnail_Status=Ready`, and **blank** `Thumbnail_URL`. Output `Thumbnail_URL` / preview was `ITEM4-VARIANT-fill-crop` (raw photo). Instagram therefore showed the first crop as the grid tile.

**Verdict: partially passed.** Do not Approve 225/226 on this idea. Next tests use different platform options.

Root causes recorded as **RC-NATIVE-D4** (no AI grid cover on native stills) and **RC-NATIVE-D5** (no on-image caption; Graph caption also missing on IG despite Airtable text).

### TC7 — If Joseph authorizes live publish later

Not part of agent hardening. Studio Approve is the front door. Agent still does not pulse FBS3/AP-CAR/TTD. Watch dispatch stamps (`Studio_Publish_Dispatch_*`) and cron reconcile. TikTok remains draft-to-inbox.

---

## 6. When Joseph is pulled in

| Gate | Why |
| --- | --- |
| Studio API auth missing | Seed cannot use the front door |
| TC6 passed | Studio review + Approve is the product test |
| Unexpected other production rows | Isolation of the wiped slate broke |
| Accidental public post | Cleanup |
| Want Stories / Reels / YouTube on this idea | Different autonomous path (Remotion) |

Joseph is not needed to pulse R/RR/publishers, click review email, or walk Make with the agent.

---

## 7. Evidence

`repair/evidence/rc-native-auto-<id>/`

- `preflight.json` — parked/OFF map, hook IDs, no writes
- `seed.json` — idea / request / output IDs from Studio API
- `observe-p3.json` / `observe-variants.json` / `observe-rr1.json` — timestamps, field snapshots, any Make executions **started by the Worker**
- `stall-diagnosis.json` — only if a gate timed out: formula vs row, continuation reason, patch applied, subsequent tick result
- `postflight.json` — cadence still parked, no unrelated mutations

If evidence shows `scenarios_run` or selector patches from the agent, the test is invalid.
