# SM Pipeline V2 — 21-Item Repair Ledger

Updated: 2026-08-18 UTC
Checkpoint commit before this update: `80d12743f348a9c30e214902fc84b437bd0b313f`

## Operating gate

Items 1–6 are now **complete and verified**. The safe republish/replace gate is cleared and **Item 7 is authorized as the next repair/acceptance step**. Every future test must remain exact-record/exact-output addressed, bounded by the repair controls, and leave cost-driving scenarios OFF unless a specific bounded pulse is required.

## Full 21-item checklist

| # | Repair item | Status | Verified completion / current state | Next required proof |
| ---: | --- | --- | --- | --- |
| 1 | Activation leases and operation limits | **Complete — controller acceptance proven** | Repair leases are live in Make Admin Queue with exact output allowlists, run/operation ceilings, expiry, closure state, and verified shutdown. Controller-only Item 1 acceptance proved a one-operation ceiling (`TR-ITEM1-20260816-BUDGET-L1`) closing with `reason=budget-exhausted`, `operations_used=1`, `scenario_stopped=true`; an intentionally abandoned minimum-duration lease (`TR-ITEM1-20260816-ABANDON-L1`) closed automatically after sweep with `reason=lease-expired`, zero runs/operations, and verified inactive shutdown; a subsequent sweep left the terminal audit record unchanged in its request/result/closed state. No live repair leases or test fixtures remained afterward. | Closed for lease/operation control. Reopen only on new evidence of a control-plane regression. |
| 2 | Record-resolution discipline | **Complete — structural exact-addressing and production isolation verified** | Exact immutable record targeting is proven through the controlled orchestrator and publishing mutation paths: I4, P1→P2→P3, C7→C8→C9, P4/P5, R2/R3/R4/R5/RR paths, AP0/AP1/AP1C, TTD/AP-CAR and publisher/post-publish stages. Production batch owners exclude tagged tests where they touch production outputs; C3/C3B/PUB3/SMV1 final Test Mode seams are also exact-identity guarded. | Closed for structural exact-addressing. Reopen only on new cross-record evidence; normal-path runtime acceptance remains Item 7 and platform-specific acceptance remains later items. |
| 3 | Renderer native overlap transitions | **Complete — native overlap and A/V acceptance proven** | Authoritative `Services/Remotion_Renderer` now uses Remotion `TransitionSeries` for true adjacent-scene overlap with duration-neutral compensation, native fade/slide presentations, preserved first-scene reveal, bounded clip audio, and service version `2026-08-17-native-overlap-transitions`. Acceptance job `item3-native-overlap-20260817-071452` completed at 360×640/30 fps with exactly 135 video frames and a 4.500 s video stream; AAC audio is present/non-silent; fade and slide overlap were proven by rendered-frame pixel evidence. Baseline→patched Item-3 lint stayed 2→2, TypeScript stayed 0→0, and both full Remotion bundles passed. Durable evidence: `repair/evidence/item3-native-overlap-acceptance-20260817.json`. | Closed for renderer transition behavior. Reopen only on new evidence of non-overlap, duration drift, A/V regression, or source/version drift. |
| 4 | AP0 versioned re-stage | **Complete — live proven** | AP0 `5612096` keeps its exact webhook entrance and nine-module topology. R2 keys are revision-specific: `publish/platform-output-{{1.Output_ID}}/{{1.Final_File_ID}}.mp4`; stored filenames include `Final_File_ID`; four original new-asset branches plus four `text:notequal` revision-changed branches are live. Output 157 proof showed unchanged revision = 2-operation SUCCESS/no-op, changed revision = 8-operation SUCCESS with old and new R2 versions simultaneously reachable, and deliberate invalid-master execution = ERROR while the last-good URL/name/ready timestamp remained unchanged. | Closed for AP0 behavior. R2 object retention/TTL/orphan cleanup remains Item 12; do not repatch AP0 without new evidence. |
| 5 | Genuine hard test mode | **Complete — final SMV1 target-only isolation matrix passed** | Durable `Test_Run_ID` identity propagates through Studio/controller, Content Items, Production Requests, Platform Outputs, carousel review, P4/P5 asset-request, C3/C3B, PUB3 and SMV1 queue/work-item paths. Production selectors exclude tagged tests and test side effects require exact matching identity plus explicit acknowledgement where applicable. Final SMV1 proof run `31993357970` advanced only the matching test row while a different test row and blank-production row remained unchanged; the canonical production selector was restored, SMV1 returned OFF, and fixtures were deterministically cleaned up. | Keep exact `record_id` + `Test_Run_ID` isolation as a standing regression invariant; reopen only on evidence that a test-tagged run can mutate unrelated or blank-production state. |
| 6 | Safe republish/replace transaction and duplicate cleanup | **Complete — exact transaction and synthetic cleanup semantics proven** | Transaction/revision identity is enforced across the relevant stage handoffs; ambiguous replacement failures fail closed instead of blind retry; the repair controller uses exact Scenario_ID + lease_id + Test_Run_ID addressing and catches async route failures as JSON instead of Cloudflare 1101. Final isolated Output 167 proof (`32056383357`) passed prepare, idempotent replay, nonpublic begin denial, synthetic new-identity verification, obsolete-object snapshot, mismatched cleanup-evidence denial, matching cleanup completion, cleanup replay, and final Complete state. Output 167 was restored exactly, `Do_Not_Publish=true` was preserved, the lease closed with zero Make runs, and the production Worker version remained unchanged. Durable closure evidence: `repair/evidence/item6-safe-republish-replace-closure-20260817.json`. | Closed for cross-revision transaction safety and duplicate-cleanup state semantics. A real external YouTube deletion was deliberately not performed or claimed; platform-specific native cleanup/reconciliation remains part of later platform acceptance where supported, with `Manual Cleanup Required` as the safe fallback. |
| 7 | Fresh edge-to-edge 9:16 normal-path regression | **Complete - R2/R3/R4/R5/RR1 accepted on Output 168** | Fixture remains Platform Output 168 (`recByMge4QPlCOsD2`) / Content Item 75 (`recA0WClSp6SR6vvl`) with exact `Test_Run_ID=ITEM7_9X16_REGRESSION_RUN32060507474`, 9:16, and `Do_Not_Publish=true`. R2 accepted via L11 `32072311195` plus independent postflight `32072648938`. R3 accepted via L14 `32073675521` with canonical `maxRecords=10` restoration hardened in deploy `32073376086`. R4 accepted via L15 `32074479277` with render job `job-20260817220701-bc03f06f` verified in run `32074747996`. R5 accepted via L16 `32077730040`: one cycle advanced Output 168 to `Render_Status=Rendered`, populated `Final_File_URL`, `Final_File_ID`, and Studio preview fields; controller R5 canonical `maxRecords=5` preservation deployed in `32077649270`. RR1 accepted via L19 `32078647065` after clearing a non-canonical `Review_Status=Pending` fixture state and deploying RR1 canonical `maxRecords=10` preservation in `32078078572`; Output 168 reached `Review_Status=Review Sent` with `Review_Email_Sent_At=2026-08-17T23:02:03.289Z`. All stage postflights proved scenarios OFF, `{Test_Run_ID}=BLANK()` production selectors restored, and schedules preserved. No publishing occurred. | Closed for the bounded 9:16 exact-output regression. Reopen only on new cross-record evidence or a fresh platform-specific acceptance item. Malformed review-HTML concatenation remains Item 10 scope, not an Item 7 blocker. |
| 8 | Regenerate/invalidate queued blur-fill variants and caches | **Complete — `fill-crop-v2` live, queued audit clean, forward cache identities versioned** | Production variant service V2 now emits center-crop outputs and rejects stale recipe requests; deterministic synthetic-fixture proof changed the `9:16` SHA-256 from `8bb4797d28179df6d9889992a2001bfae56942d7bdca42851df09af4680f778f` to `77354dc70402e729a881a4463445a88f0a26e51e1b172f113c012276b22625f0` ([run 32080453235](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32080453235)). Studio API commit `d0bdc5e` versions transfer IDs, Drive filenames, manifest schema/metadata, and render queries; guarded production rollout passed ([run 32080634791](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32080634791)). Live SMV1 module 33 now explicitly requests `recipe=fill-crop-v2`, remained inactive with scheduling preserved, and the exact queue audit found **0** Pending/Drive Uploaded/Processing platform variants, so no broad regeneration was required ([run 32080885633](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32080885633)). Existing Ready development artifacts were intentionally retained; future rebuilds receive distinct recipe-scoped Drive and R2 preview identities. | Proceed to Item 9. |
| 9 | Genuine platform covers/thumbnails | **Complete — YouTube and Facebook native covers proven; Instagram create-time contract live** | P2/P3 already create and copy `Thumbnail_URL`. Publish contracts were patched without starting orchestrators ([run 32082039243](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32082039243)). Isolated platform proof ([run 32082841725](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32082841725)) left every cadenced orchestrator OFF and created no new posts: private YouTube Output 151 `4HAhk2Lg7GE` accepted `thumbnails.set` (`youtube#thumbnailSetResponse`, `YouTube_Thumbnail_Status=Uploaded`); Facebook Reel 149 `1579989503541819` preferred thumbnail changed from `1696730381388886` to `1581545820052854` via Graph multipart `source` file. Drive PNG covers are 4.1 MB and exceed YouTube's 2 MB limit; the attachable JPEG is `https://media.chicagoshining.com/publish/thumbnail-item9-native-cover-proof-v2.jpg`. Instagram AP1-IG `5862882` still sends `cover_url={{1.Thumbnail_URL}}` at create time; existing Output 148 was not republished because Instagram cannot reattach a Reel cover. Durable evidence: `repair/evidence/item9-native-cover-platform-proof-20260817.json`. | Closed for native cover attach. Reopen only on new evidence that YouTube/Facebook reject the generated cover or that AP1-IG drops `cover_url`. FBS4 Make module 70 still cannot post a multipart `source` file; Graph rejected URL query params. Wire that Make path or a helper service before the next Facebook publish if silent cover-miss is observed. |
| 10 | RR1/RR2 review evidence and all-image enumeration | **Deferred — dashboard reviews replace in-pipeline email except final publish approval** | No RR1/RR2 email test will be run now. Review/approval is moving to the dashboard; email stays only for final approval immediately before publish. | Resume only if a remaining in-pipeline review-email path is still required after the dashboard review flow exists. |
| 11 | YouTube OAuth and upload/thumbnail chain | **In progress — upload/thumbnail proven; durable OAuth configuration underway** | Output 151 recovered through exact YTP1→YTS1→YTS2→YTS3 while YT-ORCH stayed OFF; Item 9 attached a generated JPEG cover through `/youtube/thumbnail` without republishing ([run 32082841725](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32082841725)). Remaining gap is Google OAuth consent **Testing** refresh-token expiry plus local token persistence/truncation. Do not republish Output 151. | Prove live token refresh and video read on `4HAhk2Lg7GE`, then set the Google OAuth consent screen to **In production** and re-check persistence. Leave YT-ORCH OFF. |
| 12 | R2 lifecycle/version/TTL/cleanup | **Not started — AP0 version evidence retained** | AP0 behavioral proof created two isolated versioned R2 objects under the disposable Output 157 namespace and verified both remained reachable after re-stage. They are intentionally retained as evidence because no verified R2 deletion/lifecycle route has been approved yet; no production R2 object was changed. | Implement metadata, lifecycle/TTL, report-first orphan detection, and a bounded cleanup path; then remove the retained Output 157 proof objects through that verified lifecycle mechanism. |
| 13 | Facebook multi-photo product contract | **Decision pending** | No route or product contract changed. | Decide native multi-photo versus Reel explicitly; align Studio labels, routing, and resulting object type. |
| 14 | Native Instagram carousel validation | **Not started** | No carousel invocation or Instagram object occurred. | Test AP-CAR-ORCH/AP0C–AP5C with one exact isolated output and reconciliation proof. |
| 15 | TikTok per-photo title/overlay preparation | **Not started** | No preparation/render change occurred. | Implement deterministic per-photo overlays, timing, safe areas, and idempotency. |
| 16 | TikTok draft idempotency/email/manual completion | **Not started / prior outcome unresolved** | No TikTok retry, email, or draft occurred. | Reconcile existing uncertainty first; then prove one-key/one-draft and Gmail evidence without blind retry. |
| 17 | Studio per-photo caption/title editing | **Not started** | No Studio UI/source change occurred. | Add edit/preview/version/approval lock and deterministic render-input flow. |
| 18 | Upload-preview self-heal | **Not validated** | No preview or upload was changed in this checkpoint. | Prove observable state, bounded retry, automatic client revalidation, and no hard-refresh dependency. |
| 19 | Make webhook administration/API gaps | **In progress — registry access confirmed** | Direct Make hook inventory remains unavailable through `hooks:read`, but active startup webhook URLs are available in Airtable Pipeline Settings and complete scenario blueprints can be fetched with the bundled Make credential. No hook was rotated or recreated. R4 has `hookId: null`, so it must not be described as a webhook scenario. | Build the read-only scenario-to-startup-webhook map from Pipeline Settings plus fresh blueprints, preserve every webhook identity, and run only one bounded non-production invocation after the exact contract is verified. |
| 20 | Cloudflare/GitHub diagnostics and source drift | **Partial** | GitHub-controlled safe Worker rollout and deliberate evidence workflows succeeded. Current repo-to-Worker changes are traceable for this repair. Broader source drift and stale version labeling remain unresolved. | Inventory authoritative services/configs, fix deployment gates/version reporting, and produce clean diagnostics without secrets. |
| 21 | Repair scope/change-control and evidence-backed completion | **Partial — ledger active and current** | Permanent ordered ledger includes R4 target/denial proof, R5 pulse isolation, AP0 versioned proof, controller lease/Test Mode acceptance, current publishing selector audit, C7/C8 exactness, successful YouTube Output 151 recovery, and rollback-safe R2/P4/P5 Test Mode identity hardening. | Continue ledger after each meaningful repair and require deterministic positive/negative evidence before marking each remaining item complete. |

## 2026-08-16 Item 1 acceptance completion delta

- Root cause of the apparent Airtable lease-store failure was an orphaned expired R4 lease from an earlier Test Mode proof whose allowlisted/deny fixtures had been deleted before closure. Direct credential, binding, table-ID, field-schema, and exact-query probes all passed. The orphan was manually reconciled as failed and explicitly not counted as automatic recovery evidence.
- Stable sweep immediately succeeded after that reconciliation, proving the lease-store runtime path healthy.
- Budget acceptance fixture `TR-ITEM1-20260816-B` / lease `TR-ITEM1-20260816-BUDGET-L1` used OFF IG-PUB-ORCH `5864632`, `max_operations=1`, `max_runs=1`. The first exact allowlist assertion succeeded. The controller then auto-closed the exhausted lease with `reason=budget-exhausted`, `operations_used=1`, `runs_used=0`, `scenario_stopped=true`, and `already_inactive=true`. The disposable Platform Output remained unchanged and was deleted only after terminal closure.
- Abandoned-chat/timeout acceptance fixture `TR-ITEM1-20260816-C` / lease `TR-ITEM1-20260816-ABANDON-L1` was intentionally left without client follow-up beyond its minimum-duration expiry while its exact fixture remained present. Sweep returned HTTP 200 and the lease closed `Succeeded` with `reason=lease-expired`, zero runs/operations, `scenario_stopped=true`, and `already_inactive=true`. The fixture remained unchanged and was deleted only after closure.
- A later sweep succeeded and left the closed abandoned-lease audit record unchanged, proving terminal ledger stability.
- Final direct Airtable check found zero Processing `REPAIR_LEASE_V1` records.
- No Make scenario activation, render, email, draft, upload, or public platform operation occurred in this Item 1 acceptance matrix.

Evidence runs: budget acquire `31974401076`; first allowed operation `31974455484`; abandoned-lease workflow `31974601447` (its final parser expected the wrong `swept.results` shape, but the sweep itself returned HTTP 200 and the Airtable terminal lease record independently proved recovery); terminal-ledger follow-up sweep `31974740309`.

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


## 2026-08-16 continuation delta — P4/P5 Test Mode identity + YouTube recovery

- YouTube Output 151 recovered successfully with video ID `4HAhk2Lg7GE`; exact YTP1→YTS1→YTS2→YTS3 chain completed while YT-ORCH remained OFF. OAuth Testing-mode token lifetime remains the durable configuration gap.
- Fresh live publishing selector audit reconfirmed IG, Facebook, TikTok, and YouTube selectors exclude test-tagged Platform Outputs and remain stage-specific/max-one.
- Added durable `Test_Run_ID` to Asset Requests (`fldZFl683gtrEurEM`) and Asset Request Shots (`fldg2LWKkmu7w1Yyj`).
- R2 `5569495` Modules 20/21 now pass `test_run_id` to P4.
- P4 `5533802` Module 42 now requires exact Output ID plus matching/blank Test Mode identity; Modules 10/44 propagate identity to Asset Requests; Modules 17/50 propagate identity to Asset Request Shots; Module 44 only reconciles within the same identity boundary; Module 12 suppresses real asset-request email for test-tagged work. Webhook `2567873` and topology/state were preserved.
- P5 `5536624` Module 1 now filters `{Test_Run_ID}=BLANK()` while preserving its existing view, sort, and 200-record production reminder behavior.
- Rollback-safe repair run `31988766540` completed successfully with sanitized evidence and no scenario topology/state drift.

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

## 2026-08-17 Items 2 and 5 closure delta

- **Item 2 closure:** the prior structural completion inventory found no additional active cross-record orchestrator blocker in Item 2 scope after exact-addressing repairs to I4, P1→P2→P3, C7/C8, P4/P5, render/review handoffs, AP0/AP1/AP1C, TTD/AP-CAR, and publishing chains. The remaining C3/C3B/PUB3/SMV1 surfaces were subsequently handled as the final Test Mode seam tranche, so they no longer remain an Item 2 gap.
- **C3 `5587853`, Module 4 — Send One Review Email Per Content Item:** production review email now requires blank parent `Test_Run_ID`; corrected repair run `31990171575` succeeded. The earlier run `31990016152` stopped before any Make write.
- **C3B `5592384`, hook `2545695`:** exact slide pre-read identity guards precede approve/regenerate/delete/manual mutation, with parent/linked-slide identity checks on global updates. Repair run `31990328432` succeeded after topology audit `31990224163`.
- **PUB3 `5580354`, Module 5 — Mark Published in Airtable:** production confirmation requires blank test context; test-tagged confirmation requires exact incoming/output `Test_Run_ID` equality plus explicit `allow_test_publish=true`, retaining existing publication guards. Repair run `31990171575` succeeded.
- **SMV1 queue authority:** Studio Media Transfer Queue `tblBZLXPd1p2NRWRK` has durable `Test_Run_ID` field `fldrUASIRo91tMnmZ`; Studio derives owning Production Request identity for master and variant queue writes. Source patch `31990631302` and guarded rollout/promotion `31990685644` succeeded.
- **SMV1 `5894885`, Module 1:** ordinary scheduled production selection requires `{Test_Run_ID}=BLANK()` around existing eligibility. Repair run `31990739903` succeeded with the scenario kept OFF/no-hook.
- **Controlled SMV1 test pulse:** Studio refuses to seize an already-active SMV1, requires every queue row for the request to match the same test identity, installs an exact request + `Test_Run_ID` selector for a single max-one pulse, then deactivates SMV1 and restores the production selector in cleanup paths. Scoped source patch `31991001553` and guarded rollout/promotion `31991048868` succeeded; the earlier `31990922155` attempt failed safely before commit on a non-unique source anchor.
- **Final behavioral acceptance:** `Prove SMV1 TestMode Isolation` run `31993357970` succeeded. The exact target test row advanced `Pending` → `Ready for Cleanup` with `S3a Ready for Audit`; the other-test row stayed `Pending`; the blank-production row stayed `Pending`; the canonical selector `AND({Request_Type}='Master Original',{Status}='Pending',{Test_Run_ID}=BLANK())` was restored; SMV1 was OFF afterward; fixtures were deleted deterministically.
- No broad E2E, renderer, review-email delivery, platform draft/upload, or public publishing operation was used to close Items 2 or 5.

## 2026-08-17 Item 3 preparation delta — authoritative renderer native-overlap patch

- Authoritative source snapshot came from `D:\Content Creation\ChicagoShining Pipeline\Services\Remotion_Renderer`; live `/health` returned HTTP 200 before any change. `src\ChicagoShiningPhotoSequence.tsx` snapshot SHA-256 is `e8b0244347e9256fc32581e0a6c5ec09bf2d5dd1bc22e0da71d3b83cf0a053d3`; `render-server.js` is `0491c52ccb35fec4dcb713e79a3e5f18905e2cb08601470a269eebca1c775936`.
- Root defect confirmed in the authoritative source: image scenes are consecutive `Sequence` blocks; opacity/translate/scale are animated within each isolated scene, so outgoing and incoming scenes are never rendered simultaneously.
- Prepared repair uses Remotion `TransitionSeries` with the existing Remotion package line pinned to `4.0.484`. Fade and slide become native overlap presentations; zoom retains scale behavior while using native transition progress/overlap context. The pre-existing first-scene reveal remains separately preserved because it is an intro effect, not an interscene transition.
- Exact-duration compensation extends each outgoing transition wrapper by the transition overlap that `TransitionSeries` subtracts, preserving the renderer existing total frame count, voiceover-aware duration, music/caption timing, and end-tail contract. Per-clip audio remains bounded to the original clip slot.
- Static preparation gates passed: patched TSX TypeScript transpilation, `render-server.js` syntax, and structural assertions for native overlap, duration compensation, slide/fade mappings, removal of legacy transition opacity, and bounded clip audio.
- Repair bundle: `SM_Pipeline_V2_Item3_Native_Overlap_Repair_2026-08-17_v3.zip`, SHA-256 `07337fdbb3d4a6a925a069b8f6ab2f42609e2ff365a3e1f510089aeb9950b063`. Installer v1 stopped safely on Windows PowerShell stderr promotion during npm and rolled back. Installer v2 reached the full-project lint gate, exposed six pre-existing authoritative-source lint errors, then rolled back before renderer restart/acceptance rendering. V3 hash-checks the authoritative snapshot, captures the pre-change full-project ESLint fingerprint, requires zero new lint errors, then requires `npx tsc --noEmit` and `npm run build`, restarts only the renderer, and rolls back on any failed gate.
- V3 runtime acceptance is intentionally still pending. The bounded local matrix must prove exactly 135 frames / 4.5 seconds, an audio stream, simultaneous red→green fade overlap, simultaneous green→blue slide overlap, and healthy service version `2026-08-17-native-overlap-transitions`. No Airtable, Make, R2, email, draft, upload, or platform mutation is part of this test.

## 2026-08-17 Item 3 completion delta — native overlap accepted

- Authoritative live renderer source was repaired in `D:\Content Creation\ChicagoShining Pipeline\Services\Remotion_Renderer`; prior source hash preconditions matched before mutation.
- Native transition implementation uses Remotion `TransitionSeries` with `@remotion/transitions` pinned exactly to `4.0.484`. Outgoing sequence wrappers are extended by each overlap duration so `TransitionSeries` subtraction is duration-neutral relative to the existing voiceover/music/caption frame contract.
- Validation before service restart: Item-3 ESLint baseline/after = 2/2 (zero new errors), targeted TypeScript baseline/after = 0/0, baseline full Remotion bundle PASS, patched full Remotion bundle PASS.
- Patched `/health` returned `ok=true`, port `3333`, version `2026-08-17-native-overlap-transitions`.
- Acceptance render `item3-native-overlap-20260817-071452` completed successfully: 360×640, 30 fps, exactly 135 video frames, 4.500 s video stream, 4.544 s container/audio duration, AAC 48 kHz audio present. Independent post-upload decode confirmed non-silent audio.
- Fade proof at 1.700 s produced mixed red/green RGBA `[63,127,0,255]`; direct temporal sampling showed red at 1.5 s, mixed frames at 1.6–1.8 s, and green by 1.9 s.
- Slide proof at 3.200 s simultaneously showed green left `[0,254,1,255]` and blue right `[0,0,254,255]`; temporal sampling showed the spatial overlap entering at 3.1 s and resolving to blue by 3.4 s.
- Uploaded evidence ZIP SHA-256: `c485fed3eae8d9e13d19b8f5e7e45df7a594378aa12a36ad66426d7999124ad8`. Durable compact evidence is committed at `repair/evidence/item3-native-overlap-acceptance-20260817.json`.
- No Airtable write, Make run, R2 mutation, email, draft, upload, or platform post was used for this acceptance.
- Items 1–5 are therefore complete. Item 6 is the next authorized repair; Item 7 broad normal-path E2E remains deferred until Item 6 closure.

## 2026-08-17 Item 6 closure delta

- Durable transaction-addressed stage handoff proof already covered all relevant publishing stages and kept scheduled orchestrators OFF (`repair/evidence/item6-transaction-addressing-proof-20260817.json`, run `32050199756`).
- Ambiguous create/publish failure paths were already hardened so replacement transactions fail closed with retry disabled and `Manual Cleanup Required` rather than blind duplicate creation (`repair/evidence/item6-ambiguous-retry-guards-proof-20260817.json`, run `32036387558`).
- Repair-control follow-up addressing was hardened to exact Scenario_ID + lease ID + Test_Run_ID. The actual Cloudflare 1101 root cause was an un-awaited async repair route handler; GET/POST repair handlers now `await` inside the outer error boundary. Wrong lease and wrong Test_Run_ID controls now return deterministic JSON 409 responses (`32055477235`, `32055993483`).
- Final nonpublic Output 167 closure proof ran under lease `ITEM6_CLEANUP_LEASE_20260817_1343D`, `allow_public_publish=false`, exact output allowlist only, and zero Make runs. Run `32056383357` proved prepare, idempotent prepare replay, public-begin denial, synthetic replacement verification, obsolete snapshot, bad-cleanup-evidence denial, cleanup acceptance, idempotent cleanup replay, and final Complete state.
- The proof was intentionally synthetic at the platform boundary: it did **not** call YouTube or delete a real external object. That is not counted as a platform deletion proof. The Item 6 safety contract is that verified cleanup may complete the transaction where platform reconciliation exists, otherwise `Manual Cleanup Required` is the explicit fail-safe state.
- Teardown restored Output 167 exactly, retained `Do_Not_Publish=true`, closed the zero-run lease as metadata, deleted the disposable bridge, and verified the production Worker version was unchanged. Artifact `9296527685`, digest `sha256:e793e13ad92972a625493c9e3f5ed2edb41fd74f6cbb428a5ff8026de52907a3`.
- **Item 6 is closed. Item 7 is now unblocked and authorized.**


## 2026-08-17 Item 7 exact-stage regression delta
- Controller defect found from first-pulse artifact: Cloudflare subrequest ceiling was reached during 2-second polling, preventing rollback and leaving the exact R2 selector stranded while R2 itself made no target mutation.
- Durable controller repair: 6-second checkpoint polling, R5 max 5 cycles per lease, and same-output/same-Test_Run_ID stranded-selector recovery while scenario is verified OFF.

- Controller deployment run `32060507474` PASS; active Worker exact-stage marker verified.
- Fresh fixture: Content Item 75 `recA0WClSp6SR6vvl`, Platform Output 168 `recByMge4QPlCOsD2`, exact `Test_Run_ID=ITEM7_9X16_REGRESSION_RUN32060507474`, 9:16, `Do_Not_Publish=true`.
- First R2 exact pulse run `32061240553` made no target progress; no R2 PASS was recorded. R3 remained blocked.
- Live R2 Module 1 inspection is stored at `repair/evidence/item7-r2-selector-preflight-20260817.json` for narrow fixture diagnosis.

- 2026-08-17 Item 7 L6 control-plane checkpoint: controller repair deploy `32065602564` PASS; safety run `32065906190` proved R2 OFF and exact selector isolation; L6 `32066062184` failed during lease acquire with Cloudflare runtime 1104 before any L6 lease/output mutation; expired L5 manually reconciled Failed from independent OFF evidence; obsolete pending deactivation command removed; zero Processing repair leases remain. R2 retry remains the gate; R3 blocked.

- 2026-08-17 Item 7 L7/execution-stop checkpoint: L7 `32066445258` proved exact R2 execution but failed closed on inactive verification after Output 168 entered Selecting; watchdog terminalized L7 with scenario_stopped=true. Exact-execution controller repair deployed in `32067087580`, retaining the leased executionId and using exact force-stop only as a fallback before scenario-stop re-verification. Output 168 was restored only in the two fields mutated by L7 (selection status/note), with Test_Run_ID, Do_Not_Publish and all downstream fields preserved; zero Processing repair leases remain. L8 is the next R2 gate; R3 remains blocked.

- 2026-08-17 Item 7 L8/subrequest checkpoint: L8 `32067297719` proved exact execution identity but failed because the long checkpoint poll consumed the Worker subrequest budget before exact execution/scenario shutdown. Safety inspect `32067706933` saw R2 active with the exact selector; watchdog `32067711473` then closed L8 budget-exhausted with scenario_stopped=true. Output 168 was restored only in the partial selection status/note fields; Test_Run_ID, Do_Not_Publish and downstream blank state were preserved. Next repair reserves cleanup capacity; R3 blocked.

## 2026-08-17 Item 7 R2 acceptance delta

- Fixture remains Platform Output 168 (`recByMge4QPlCOsD2`) / Content Item 75 (`recA0WClSp6SR6vvl`) with exact `Test_Run_ID=ITEM7_9X16_REGRESSION_RUN32060507474`, 9:16, and `Do_Not_Publish=true`.
- L9 execution tracing identified the real runtime defect at R2 **Module 9 — Update Selected Assets + Music URL + Diagnostic State (R4 Owns Audio Volume)**: field `Selected_Review_Images_HTML` (`fldEzxfia9EtHbg2F`) failed because its `map()` key serialized as unquoted `google_drive_url`. Read-only blueprint history showed this mapping first appeared in R2 v45; live production blueprint comparison showed equivalent Make `map()` keys are quoted.
- Repair run `32071982668` changed only `map(8.selected_clips; google_drive_url)` to `map(8.selected_clips; "google_drive_url")`. Postflight proved R2 stayed OFF, schedule/hook/name were preserved, and no other flow content changed.
- L10 run `32072146088` failed at the temporary Cloudflare bridge with HTTP 500 before lease creation; no L10 lease record exists and Output 168 did not mutate.
- L11 run `32072311195` acquired one exact lease and executed R2 once. Output 168 reached `Selected` with six clips, non-empty `Selected_Assets_JSON`, 900 total selected frames in the package, `Asset_Selection_Last_Result=Selected`, and exact Test_Run_ID/DNP preservation.
- The L11 controller response hit `Too many subrequests by single Worker invocation` after R2 business completion. Its terminal sweep closed L11 `budget-exhausted` with `runs_used=1`, `operations_used=25`, and `scenario_stopped=true`. A cleanup-only call was then correctly refused because the lease was already terminal.
- Independent read-only postflight run `32072648938` proves scenario 5569495 is OFF and Module 1 is restored to the canonical production selector with `maxRecords=1`, `{Test_Run_ID}=BLANK()`, and `NOT({Do_Not_Publish})`. This supplies the restoration proof missing from the failed controller response.
- R2 is therefore accepted for Item 7. R3 is now authorized; R4/R5/RR1 remain blocked until their preceding stage passes.
- Item 10 note: `Selected_Review_Images_HTML` is now non-empty but its rendered concatenation contains formatting artifacts. That presentation issue is evidence for Item 10 and is not counted as R2 business-state failure.

## 2026-08-17 Item 7 completion delta

- **R5:** run `32077730040` / lease L16. Exact one-cycle pulse finalized Output 168 to `Rendered` with Drive final file `1ZR49jPVZglsnGRda4m7A2-dnC9L6XPiR`, Studio preview URL, and `Do_Not_Publish=true` preserved. Controller patch v8 (`32077649270`) preserves R5 production `maxRecords=5` across exact-stage recovery.
- **RR1:** failed L18 `32078181389` exposed two gates: production RR1 requires `Review_Status=BLANK()` (fixture had `Pending`), and controller canonical `maxRecords=10` had to be preserved like R3/R5. After clearing the fixture review status, deploying RR1 maxRecords v9 (`32078078572`), and rerunning L19 `32078647065`, Output 168 reached `Review Sent` with review email timestamp `2026-08-17T23:02:03.289Z`; RR1 returned OFF with canonical selector restored.
- **Item 7 is complete** for the bounded exact-output 9:16 regression on Output 168. Publishing was not attempted and must remain blocked by `Do_Not_Publish=true`.
