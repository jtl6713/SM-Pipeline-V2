# SM Pipeline V2 — 21-Item Repair Ledger

Updated: 2026-08-16 UTC  
Checkpoint commit before this update: `80d12743f348a9c30e214902fc84b437bd0b313f`

## Operating gate

The top-five repair program remains in progress. **Do not begin Item 6.** No broad end-to-end test is authorized. Every future test must be exact-record/exact-output addressed, bounded by the repair controls, and leave cost-driving scenarios OFF.

## Full 21-item checklist

| # | Repair item | Status | Verified completion / current state | Next required proof |
| ---: | --- | --- | --- | --- |
| 1 | Activation leases and operation limits | **Partial** | Repair-control lease code is deployed. Module 19 compact-result repair and bounded proofs exist in prior workflow evidence. Cost-driving scenarios were kept OFF throughout this checkpoint. | Complete success, failure, timeout, abandoned-chat, budget-exhaustion, immutable-ledger, and guaranteed-shutdown acceptance matrix. |
| 2 | Stage-specific, exact-output-addressable orchestrators | **In progress — R4 blocked at Make trigger contract** | R4 `5556716` Module 1 is exact `airtable:ActionGetRecord` using corrected Make mapping `{{var.input.output_record_id}}`; six-field interface installed; denial fixture and lease controls passed. Live executions prove that an interface alone produces zero bundles because R4 has no Make **Start Scenario** trigger module. AP0 `5612096` exact entrance remains verified. | Obtain the exact Start Scenario module schema (current token lacks `templates:read`), add it without disturbing Modules 2–32, then rerun one isolated target/denial proof. Do not repeat direct-input runs before that topology fix. |
| 3 | Renderer native overlap transitions | **Not started** | No renderer source mutation or render occurred in this checkpoint. | Confirm authoritative renderer source; implement overlap transitions; prove frame, timing, and A/V acceptance after Items 1, 2, and 5 pass. |
| 4 | AP0 versioned re-stage | **Not started** | AP0 exact entrance is live, but content-fingerprint/versioned R2 staging is not implemented. | Implement immutable version keys, atomic pointer update, replay, rollback, and lifecycle evidence. |
| 5 | Genuine hard test mode | **Partial** | Repair controller hard-requires exact Airtable IDs, `Do_Not_Publish`, allowlists, `test_run_id`, and denies generic ACTIVATE/RUN. | Extend enforcement to every stage worker and prove scoped/production-negative fixtures before any live path test. |
| 6 | Safe republish/replace transaction and duplicate cleanup | **Blocked by top-five gate** | No work performed in this checkpoint. | Begin only after Items 1–5 are implemented and verified. |
| 7 | Fresh edge-to-edge 9:16 normal-path regression | **Blocked by top-five gate** | No render or platform delivery performed. | Run one isolated normal-path regression only after Items 1–5 pass. |
| 8 | Regenerate/invalidate queued blur-fill variants and caches | **Not started** | No variants or caches changed. | Version recipe; target rebuilds; prove distinct hashes and cache-busted downstream URLs. |
| 9 | Genuine platform covers/thumbnails | **Not started** | No covers, posts, drafts, or thumbnails created. | Validate native Facebook, Instagram, and YouTube cover behavior with platform evidence. |
| 10 | RR1/RR2 review evidence and all-image enumeration | **Not validated** | No RR1/RR2 change or email test occurred in this checkpoint. | Prove 1-, 3-, 4-, and larger-image enumeration plus Gmail/review evidence gating. |
| 11 | YouTube OAuth and upload/thumbnail chain | **Blocked — OAuth** | No YouTube call occurred. Prior `invalid_grant` remains the known blocker; the idempotent Airtable deployment package exists but is not counted here as live validation. | Reauthorize OAuth, populate required channel configuration, then test one exact private output through YT-ORCH–YTS3. |
| 12 | R2 lifecycle/version/TTL/cleanup | **Not started** | No R2 objects were created, changed, or deleted. | Implement metadata, lifecycle, report-first orphan detection, and bounded cleanup proof. |
| 13 | Facebook multi-photo product contract | **Decision pending** | No route or product contract changed. | Decide native multi-photo versus Reel explicitly; align Studio labels, routing, and resulting object type. |
| 14 | Native Instagram carousel validation | **Not started** | No carousel invocation or Instagram object occurred. | Test AP-CAR-ORCH/AP0C–AP5C with one exact isolated output and reconciliation proof. |
| 15 | TikTok per-photo title/overlay preparation | **Not started** | No preparation/render change occurred. | Implement deterministic per-photo overlays, timing, safe areas, and idempotency. |
| 16 | TikTok draft idempotency/email/manual completion | **Not started / prior outcome unresolved** | No TikTok retry, email, or draft occurred. | Reconcile existing uncertainty first; then prove one-key/one-draft and Gmail evidence without blind retry. |
| 17 | Studio per-photo caption/title editing | **Not started** | No Studio UI/source change occurred. | Add edit/preview/version/approval lock and deterministic render-input flow. |
| 18 | Upload-preview self-heal | **Not validated** | No preview or upload was changed in this checkpoint. | Prove observable state, bounded retry, automatic client revalidation, and no hard-refresh dependency. |
| 19 | Make webhook administration/API gaps | **Blocked — token scope** | Read-only hook access failed because the current Make token lacks `hooks:read`. No hook was rotated or recreated. R4 was repaired through the no-webhook exact-input controller. | Obtain/validate read scope; inventory hooks read-only; preserve identities; run one bounded non-production invocation. |
| 20 | Cloudflare/GitHub diagnostics and source drift | **Partial** | GitHub-controlled safe Worker rollout and deliberate evidence workflows succeeded. Current repo-to-Worker changes are traceable for this repair. Broader source drift and stale version labeling remain unresolved. | Inventory authoritative services/configs, fix deployment gates/version reporting, and produce clean diagnostics without secrets. |
| 21 | Repair scope/change-control and evidence-backed completion | **Partial — ledger active** | Permanent ordered ledger exists. This checkpoint records target IDs, operations, effects, exclusions, rollback, evidence, and next gate. | Continue ledger per repair and require deterministic positive/negative evidence before marking any item complete. |

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
- Root cause is now narrowed to the missing Make **Start Scenario** trigger module. Make's current scenario-input contract requires this trigger; R4 currently starts directly with ordinary data modules.
- The available Make token cannot read public template blueprints (`templates:read` missing), so the exact safe module schema could not be retrieved automatically.
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

Do **not** run R4 again until the exact Make Start Scenario module blueprint schema is available. Acquire `templates:read` or obtain a credential-free exported example, add one Start Scenario trigger ahead of Module 1, map its `output_record_id` to Module 1, preserve Modules 2–32, and then recreate one isolated allowlisted target plus one denial control for a single bounded proof.
