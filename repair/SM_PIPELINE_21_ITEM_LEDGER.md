# SM Pipeline V2 — 21-Item Repair Ledger

Updated: 2026-08-16 UTC  
Checkpoint commit before this update: `80d12743f348a9c30e214902fc84b437bd0b313f`

## Operating gate

The top-five repair program remains in progress. **Do not begin Item 6.** No broad end-to-end test is authorized. Every future test must be exact-record/exact-output addressed, bounded by the repair controls, and leave cost-driving scenarios OFF.

## Full 21-item checklist

| # | Repair item | Status | Verified completion / current state | Next required proof |
| ---: | --- | --- | --- | --- |
| 1 | Activation leases and operation limits | **Partial — materially hardened** | Repair leases are live in Make Admin Queue with exact output allowlists, run/operation ceilings, expiry, closure state, and verified shutdown. R4 and AP0 bounded proofs exercised positive/denial, stale-lease recovery, low-operation one-run control, and AP0 final failure proof L4 completed in 17 control operations with AP0 OFF afterward. | Complete the remaining timeout, abandoned-chat, budget-exhaustion, immutable-ledger, and guaranteed-shutdown acceptance matrix before marking globally complete. |
| 2 | Stage-specific, exact-output-addressable orchestrators | **In progress — materially advanced** | R4 `5556716` live proof and R5 controlled-pulse isolation remain valid. TTD-ORCH `5806668` and AP-CAR-ORCH `5791537` production selectors were explicitly hardened; TTD0–TTD3 and AP0C–AP5C are exact-output webhook workers. I4 `5524092` Module 1 was repaired from a global up-to-25-candidate scan to exact webhook `{{4.record_id}}` targeting. Production Platform Output selectors in R3/R4/R5 plus IG/FB/TikTok/YT/AP-CAR now explicitly exclude test-tagged rows with `{Test_Run_ID}=BLANK()`. | Continue the remaining stage/exact-addressing inventory and prove any still-unverified orchestrator entrances; preserve normal R5 production batching and all webhook identities. |
| 3 | Renderer native overlap transitions | **Not started** | No renderer source mutation or render occurred in this checkpoint. | Confirm authoritative renderer source; implement overlap transitions; prove frame, timing, and A/V acceptance after Items 1, 2, and 5 pass. |
| 4 | AP0 versioned re-stage | **Complete — live proven** | AP0 `5612096` keeps its exact webhook entrance and nine-module topology. R2 keys are revision-specific: `publish/platform-output-{{1.Output_ID}}/{{1.Final_File_ID}}.mp4`; stored filenames include `Final_File_ID`; four original new-asset branches plus four `text:notequal` revision-changed branches are live. Output 157 proof showed unchanged revision = 2-operation SUCCESS/no-op, changed revision = 8-operation SUCCESS with old and new R2 versions simultaneously reachable, and deliberate invalid-master execution = ERROR while the last-good URL/name/ready timestamp remained unchanged. | Closed for AP0 behavior. R2 object retention/TTL/orphan cleanup remains Item 12; do not repatch AP0 without new evidence. |
| 5 | Genuine hard test mode | **Partial — durable identity boundary live and controller-proven** | Durable `Test_Run_ID` is now present on Idea Candidates, Production Requests, Content Items, Production Request Outputs, and Platform Outputs, with I4 and Studio propagation live. Ordinary production selectors explicitly exclude tagged test rows. The repair controller now requires lease/input `test_run_id` to exactly equal Platform Output `Test_Run_ID`. Controller-only acceptance used disposable Outputs 158–161: matching identity lease succeeded; mismatched identity failed closed; blank durable identity failed closed; same-test but non-allowlisted output was rejected; lease release and expired-lease sweep succeeded; all fixtures were deleted. No Make stage execution/render/email/draft/post occurred. | Extend the durable test identity contract through any remaining non-Platform-Output workers/stages, prove deterministic cleanup/production-negative behavior end-to-end under the bounded controller, and complete Item 1 shutdown/budget matrix before marking Test Mode globally complete. |
| 6 | Safe republish/replace transaction and duplicate cleanup | **Blocked by top-five gate** | No work performed in this checkpoint. | Begin only after Items 1–5 are implemented and verified. |
| 7 | Fresh edge-to-edge 9:16 normal-path regression | **Blocked by top-five gate** | No render or platform delivery performed. | Run one isolated normal-path regression only after Items 1–5 pass. |
| 8 | Regenerate/invalidate queued blur-fill variants and caches | **Not started** | No variants or caches changed. | Version recipe; target rebuilds; prove distinct hashes and cache-busted downstream URLs. |
| 9 | Genuine platform covers/thumbnails | **Not started** | No covers, posts, drafts, or thumbnails created. | Validate native Facebook, Instagram, and YouTube cover behavior with platform evidence. |
| 10 | RR1/RR2 review evidence and all-image enumeration | **Not validated** | No RR1/RR2 change or email test occurred in this checkpoint. | Prove 1-, 3-, 4-, and larger-image enumeration plus Gmail/review evidence gating. |
| 11 | YouTube OAuth and upload/thumbnail chain | **Blocked — OAuth** | No YouTube call occurred. Prior `invalid_grant` remains the known blocker; the idempotent Airtable deployment package exists but is not counted here as live validation. | Reauthorize OAuth, populate required channel configuration, then test one exact private output through YT-ORCH–YTS3. |
| 12 | R2 lifecycle/version/TTL/cleanup | **Not started — AP0 version evidence retained** | AP0 behavioral proof created two isolated versioned R2 objects under the disposable Output 157 namespace and verified both remained reachable after re-stage. They are intentionally retained as evidence because no verified R2 deletion/lifecycle route has been approved yet; no production R2 object was changed. | Implement metadata, lifecycle/TTL, report-first orphan detection, and a bounded cleanup path; then remove the retained Output 157 proof objects through that verified lifecycle mechanism. |
| 13 | Facebook multi-photo product contract | **Decision pending** | No route or product contract changed. | Decide native multi-photo versus Reel explicitly; align Studio labels, routing, and resulting object type. |
| 14 | Native Instagram carousel validation | **Not started** | No carousel invocation or Instagram object occurred. | Test AP-CAR-ORCH/AP0C–AP5C with one exact isolated output and reconciliation proof. |
| 15 | TikTok per-photo title/overlay preparation | **Not started** | No preparation/render change occurred. | Implement deterministic per-photo overlays, timing, safe areas, and idempotency. |
| 16 | TikTok draft idempotency/email/manual completion | **Not started / prior outcome unresolved** | No TikTok retry, email, or draft occurred. | Reconcile existing uncertainty first; then prove one-key/one-draft and Gmail evidence without blind retry. |
| 17 | Studio per-photo caption/title editing | **Not started** | No Studio UI/source change occurred. | Add edit/preview/version/approval lock and deterministic render-input flow. |
| 18 | Upload-preview self-heal | **Not validated** | No preview or upload was changed in this checkpoint. | Prove observable state, bounded retry, automatic client revalidation, and no hard-refresh dependency. |
| 19 | Make webhook administration/API gaps | **In progress — registry access confirmed** | Direct Make hook inventory remains unavailable through `hooks:read`, but active startup webhook URLs are available in Airtable Pipeline Settings and complete scenario blueprints can be fetched with the bundled Make credential. No hook was rotated or recreated. R4 has `hookId: null`, so it must not be described as a webhook scenario. | Build the read-only scenario-to-startup-webhook map from Pipeline Settings plus fresh blueprints, preserve every webhook identity, and run only one bounded non-production invocation after the exact contract is verified. |
| 20 | Cloudflare/GitHub diagnostics and source drift | **Partial** | GitHub-controlled safe Worker rollout and deliberate evidence workflows succeeded. Current repo-to-Worker changes are traceable for this repair. Broader source drift and stale version labeling remain unresolved. | Inventory authoritative services/configs, fix deployment gates/version reporting, and produce clean diagnostics without secrets. |
| 21 | Repair scope/change-control and evidence-backed completion | **Partial — ledger active and current** | Permanent ordered ledger includes R4 target/denial proof, R5 controlled-pulse isolation, AP0 versioned behavioral proof, selector hardening, I4 exact-target repair, durable Test_Run_ID propagation/production exclusion, and the controller-only positive/mismatch/blank/non-allowlist acceptance matrix with fixture cleanup. | Continue ledger per repair and require deterministic positive/negative evidence before marking each remaining item complete. |

## Delta completed since the preceding handoff checkpoint

### R4 exact-entry repair — Item 2

- Scenario: **R4 — Start Remotion Render v2.6.2 — Non-Black Cover Frame Contract** (`5556716`).
- Module 1 changed from broad `airtable:ActionSearchRecords` to exact `airtable:ActionGetRecord`.
- Module name: **1 — Get Exact Platform Output**.
- Exact record expression: `{{input.output_record_id}}`.
- Invocation fields installed: `test_run_id`, `output_record_id`, `platform_output_id`, `intended_stage`, `attempt_number`, `idempotency_key`.
- Make interface fields remain optional because required fields are incompatible with the scenario's scheduled configuration; the Worker hard-requires and validates all six before permitting an exact run.
- Preserved: all other 15 modules, their types, names, and routes.
- Final state: **R4 OFF**, 16 modules, no webhook/gateway entrance.
- Idempotent verification returned `already_repaired:true` with no additional Make write.

### Repair-controller and rollout work — Items 1, 2, 5, 20, 21

- Implemented a no-webhook, exact-input repair controller in the Studio Worker.
- First pass correctly rolled back after Make rejected required interface inputs with `IM016`.
- Corrected pass uses optional Make interface declarations while retaining hard validation in the Worker.
- Safe Worker rollout succeeded.
- Workflow evidence assertion was corrected, and a separate idempotent verification plus final read-only module map succeeded.
- Permanent full 21-item ledger is now maintained in the repository.

## Evidence

- Corrected schema probe: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31957481722
- R4 full pre-repair map: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31957395189
- Initial hook-scope failure: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31956722503
- First repair attempt / controlled rollback: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958063471
- Read-only rollback verification: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958092788
- Corrected safe Worker rollout: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958138159
- Successful Make repair response (workflow final assertion was initially over-escaped): https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958189120
- Successful idempotent repair verification: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958227532
- Final read-only R4 module map: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958315394

Relevant source/evidence commits:

- No-webhook controller: `12dca8d5`
- Initial safe rollout trigger: `3134c762`
- Optional-interface correction: `f169d219`
- Corrected rollout trigger: `0ecd1ee`
- Evidence assertion fix: `ceabdfa`
- Idempotent verification trigger: `2794d26`
- Final module-map trigger: `303a4ead`
- Initial permanent ledger: `80d12743f348a9c30e214902fc84b437bd0b313f`

## Actual operations and external effects

| Effect | Actual |
| --- | ---: |
| Make scenario runs | 0 |
| Scenario activations | 0 |
| Airtable record writes | 0 |
| Renders | 0 |
| R2 objects created/deleted | 0 |
| Emails sent | 0 |
| Platform drafts/posts/videos created or deleted | 0 |
| Successful Make repair/recovery writes | 5 |
| Rejected Make interface writes | 1 |

The five successful Make writes were the initial blueprint patch, rollback blueprint, rollback interface, corrected blueprint patch, and corrected interface patch. The rejected interface write returned `IM016`. The repair controller restored the original blueprint/interface before the corrected pass.

## Test-candidate inventory and next safe checkpoint

- Platform Outputs table: `tblrlPeboBthkplH0`.
- Exact query found **0** records with `Do_Not_Publish=true` and `Render_Status=Ready for Render`.
- Exact query found **0** non-test records with `Render_Status=Ready for Render`.
- Existing `Do_Not_Publish` Output 125 (`recrSWeLpsA5TtpX5`) is already Rendered / Ready for Review and was not reset.
- Therefore no R4 execution proof was attempted.

**Next safe checkpoint:** create a dedicated isolated `Do_Not_Publish` test output under an explicit bounded test plan, prove exact R4 execution, then prove an eligible unrelated record remains unchanged. Do not reset Output 125 merely to manufacture a fixture.

## Destructive exclusions honored

No existing record was reset, no durable Drive file changed, no R2 object created or deleted, no render started, no email sent, no draft/post/video published or removed, no webhook identity rotated, and no scenario activated.


## 2026-08-16 continuation delta — isolated R4 execution proof

### What was completed

- Created isolated Platform Output 153 (`recPd2OnropiUpJzR`) as the allowlisted target and Output 154 (`rec4t364GUMajl9T7`) as the eligible unrelated denial control.
- Both fixtures were `Do_Not_Publish=true`, `Ready for Render`, and used unique filenames.
- The denial-control request was rejected before any scenario run on every bounded proof.
- Corrected R4 Module 1 mapping from the invalid `{{input.output_record_id}}` form to Make's `{{var.input.output_record_id}}` form.
- Added execution-status evidence, Make execution consistency delay, canonical schedule recovery, reduced polling, and transient required-input restoration guards.
- Proved the original mapping failure exactly: execution `566a21d836484912901914d6f7ae3e88` failed in R4 Module 1 `ActionGetRecord` because its record ID was null.
- Proved the corrected mapping no longer throws; later executions reported `SUCCESS` but produced zero bundles and did not advance the exact target.
- The failed proof establishes only that scenario input does not start R4's ordinary first data module; it does **not** establish that a Start Scenario module must be added.
- Correction after access review: complete scenario blueprints are retrievable with the bundled Make credential, and startup webhook URLs are stored in Airtable Pipeline Settings. R4 itself is scheduled (`hookId: null`), so the trigger design must be derived from the upstream webhook map plus R4's polling contract.
- Restored R4's canonical schedule from preserved evidence: `{"type":"indefinitely","interval":900}`.
- Final read-only verification: R4 OFF, 16 modules, no on-demand scenario left behind.
- Deleted both temporary Platform Output fixtures after confirming that no render or downstream effect was created.

### Bounded proof accounting

| Measure | Actual |
| --- | ---: |
| Proof workflow attempts blocked before scenario execution | 2 |
| Exact R4 scenario executions | 7 |
| Maximum runs per lease | 1 |
| Platform Output fixtures created | 2 |
| Platform Output fixtures deleted | 2 |
| Production/unrelated Platform Output mutations | 0 |
| Render jobs created | 0 |
| R2 objects created/deleted | 0 |
| Emails sent | 0 |
| Platform drafts/posts/videos created | 0 |

### Key evidence

- Initial null-record execution failure: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31959421508
- Module 1 `var.input` migration: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31959604708
- Canonical schedule recovery: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31960300701
- Successful Make execution with zero target advancement: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31960522256
- Final R4 OFF/topology verification: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31960677653
- Final scheduling inventory (`on_demand: []`): https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31960677677

### Updated next safe checkpoint

Do **not** run R4 again through direct scenario input. First retrieve the fresh upstream blueprints, correlate their custom-webhook entrances with the active Pipeline Settings registry, and determine the bounded handoff into scheduled R4 without changing webhook identities or scenario/module names. Then recreate one isolated allowlisted target plus one denial control for a single bounded proof.


## 2026-08-16 access-correction delta

- Confirmed Airtable **Pipeline Settings** (`tblpHPWeEkyJaF7ql`) is accessible and contains the active startup-webhook registry.
- Confirmed the handoff provides the Make API credential required for fresh read-only blueprint retrieval beyond the bundled snapshots.
- Confirmed R4 `5556716` has `hookId: null` and canonical 15-minute scheduling; it is not itself a custom-webhook scenario.
- Removed the unsupported claim that `templates:read` or insertion of a Start Scenario module is the next required fix.
- Preserved the prior safety state: R4 OFF, canonical schedule retained, no webhook identity changed, and no additional Make execution performed during this correction.
\n\n## 2026-08-16 continuation delta — R4/R5 closure and AP0 revision proof\n\n### R4/R5 controlled orchestration — Item 2\n\n- R4 **Start Remotion Render v2.6.2 — Non-Black Cover Frame Contract** (`5556716`) was returned to its actual scheduled Airtable-consumer contract rather than direct scenario input.\n- Module 1 selects one eligible Platform Output at `Render_Status = Ready for Render`; scenario remains normally OFF with canonical 15-minute schedule and 16-module topology.\n- Isolated positive Output 155 advanced to `Rendering` and received a real Remotion job/status URL. Denial Output 156 remained untouched. R4 returned OFF, the render reached terminal state, and both fixtures were deleted.\n- Studio-controlled R4/R5 pulse logic was hardened to refuse an already-active scenario and to require the requested output to be the only currently eligible controlled target. Normal R5 multi-record production polling remains unchanged.\n\n### AP0 immutable revision staging — Item 4\n\n- Scenario: **AP0 — Prepare Public Publish Asset — Worker R2 Upload v5.2 — Exact Video Output Webhook** (`5612096`), hook `2653029`.\n- Independent read-only post-repair verification succeeded: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31965173081\n- Publisher-state guard audit confirmed AP0/platform publisher orchestrators OFF before behavioral testing: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31965244010\n- Versioned key contract: `publish/platform-output-{{1.Output_ID}}/{{1.Final_File_ID}}.mp4`.\n- Version marker filename: `platform-output-{{1.Output_ID}}-{{1.Final_File_ID}}.mp4`.\n- Output 157 baseline staged successfully to the original Drive revision; execution-detail verification reported `SUCCESS`: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31966096542\n- Three-phase proof then established:\n  - unchanged revision: `SUCCESS`, 2 operations, no attempt/URL/name/ready change;\n  - changed revision: `SUCCESS`, 8 operations, distinct new staged URL/name, both old and new R2 versions reachable;\n  - the workflow stopped before the deliberate failure phase only because the Make organization rate limit returned HTTP 429. Evidence: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31966191634\n- Final isolated one-run failure proof after rate-window cooldown: deliberate invalid `Final_File_ID` reached terminal `ERROR`; prior revised `Publish_Asset_URL`, `Publish_Asset_File_Name`, and ready timestamp remained unchanged and reachable; AP0 ended OFF; publisher orchestrators were OFF before and after; 17 control operations. Evidence: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31966308015\n- Disposable Airtable Output 157 and its copied Drive master were deleted after proof.\n- Two versioned R2 proof objects are intentionally retained for Item 12 lifecycle/cleanup evidence because no unverified deletion path was used.\n\n### Safety accounting for AP0 behavioral proof\n\n| Measure | Actual |\n| --- | ---: |\n| Production Platform Output mutations | 0 |\n| Disposable Platform Output records | 1 created / 1 deleted |\n| Disposable Drive copies | 1 created / 1 deleted |\n| AP0 successful baseline/full staging executions | 2 |\n| AP0 unchanged no-op executions | 1 |\n| AP0 deliberate failed-revision executions | 1 |\n| Platform publishing orchestrator executions | 0 |\n| Platform posts/drafts/videos created | 0 |\n| Versioned R2 proof objects retained | 2 |\n\n**Gate remains:** Items 1–5 are not all closed because renderer transitions (Item 3) and genuine hard Test Mode (Item 5) remain open. Do not begin Item 6 or broad E2E acceptance yet.\n

## 2026-08-16 continuation delta — durable Test Mode identity boundary

### Item 2 / Item 5 hardening completed

- Hardened **TTD-ORCH `5806668`** normal/retry selectors with explicit TikTok production eligibility, auto-publish, `Do_Not_Publish=0`, unpublished/unlocked and retry-due guards; TTD0–TTD3 remain exact-output webhook workers.
- Hardened **AP-CAR-ORCH `5791537` Modules 10/12/14/16/18/20/22/24**; AP0C–AP5C remain exact-output webhook workers.
- Repaired **I4 `5524092` Module 1** so the promotion webhook's `record_id` is the exact Airtable record fetched; removed the prior up-to-25 global-candidate scan without changing hook `2549733` or downstream topology.
- Added durable `Test_Run_ID` text fields to Idea Candidates, Production Requests, Content Items, Production Request Outputs and Platform Outputs; existing production records were not backfilled.
- I4 Module 2 and the Studio Worker now propagate `Test_Run_ID` through promotion/fanout. Studio source was deployed through the non-live candidate -> exact-version smoke -> 100% promotion path; rollback was not required.
- Added `{Test_Run_ID}=BLANK()` to production Platform Output selectors in R3 `5557966`, R4 `5556716`, R5 `5565333`, IG-PUB-ORCH `5864632`, FB-ORCH `5813561`, TTD-ORCH `5806668`, YT-ORCH `5823581`, and AP-CAR-ORCH `5791537`. Transactional verification preserved each scenario's OFF state and schedule.
- Repair controller now binds a test lease to durable record identity: lease/input `test_run_id` must equal Platform Output `Test_Run_ID`. Health capability flag: `repair_durable_test_run_identity_v1`.

### Controller-only acceptance matrix

Disposable Platform Outputs 158–161 contained only Test Mode metadata and no render/publish eligibility.

| Proof | Result |
| --- | --- |
| Matching durable identity (Output 158 / `TR-DURABLE-20260816-A`) | PASS — lease acquired |
| Mismatched durable identity (Output 159 tagged `...-B`, requested `...-A`) | PASS — failed closed before lease/stage execution |
| Blank durable identity (Output 160) | PASS — failed closed before lease/stage execution |
| Same test identity but outside lease allowlist (Output 161) | PASS — rejected as outside `test_run_id` allowlist |
| Lease release | PASS |
| Expired-lease sweep | PASS |
| Fixture cleanup | PASS — Outputs 158–161 deleted |

No Make scenario stage was run, no renderer job was created, no email was sent, and no platform draft/post/video was created by this acceptance matrix.

### Evidence anchors

- Safe Studio rollout with durable identity controller hardening: GitHub Actions run `31972446672`.
- Matching identity acquisition through stable control: run `31973039268`.
- Same-test/non-allowlisted denial: run `31973081348`.
- Lease release: run `31973108944`.
- Expired-lease sweep: run `31973130952`.
- Production-selector `Test_Run_ID` exclusion transaction: run `31969304633`.
- Mismatch and blank-denial artifacts are retained in the stable repair-control workflow evidence.

### Remaining gate

Item 5 is materially advanced but remains **Partial** until the durable identity boundary is extended/proven across any remaining non-Platform-Output stages and Item 1's timeout/abandoned-chat/budget-exhaustion/immutable-ledger/guaranteed-shutdown acceptance matrix is complete. Broad E2E remains unauthorized.
