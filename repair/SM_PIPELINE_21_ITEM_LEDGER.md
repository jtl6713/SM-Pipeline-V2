# SM Pipeline V2 — 21-Item Repair Ledger

Updated: 2026-08-16 UTC

## Current checkpoint

The top-five repair program remains in progress. Do not begin Item 6.

| Item | Target | Status | Evidence | Remaining work |
| --- | --- | --- | --- | --- |
| 1 | Activation leases, budgets, watchdog, MAKE-ADMIN-BRIDGE `5893243` Module 19 | Partial | Repair-control lease code is deployed; Module 19 compact-result repair and bounded proofs exist in prior workflow evidence. Cost-driving scenarios are kept OFF. | Complete the full success/failure/timeout/abandoned-chat acceptance matrix and immutable operation ledger proof. |
| 2 | Stage-specific, exact-output addressing | In progress | R4 `5556716` Module 1 is now exact `airtable:ActionGetRecord` from `{{input.output_record_id}}`; six-field scenario input contract is installed; R4 remained OFF; Modules 2–32 were preserved. | Apply and prove the same contract across every orchestrator/stage. Create a dedicated test output before any R4 run proof. |
| 3 | Native renderer overlap transitions | Not started | No renderer source mutation or render was performed in this checkpoint. | Confirm authoritative local renderer source, implement overlap transitions, and run isolated frame/A/V tests after Items 1, 2, and 5 are active. |
| 4 | AP0 versioned re-stage | Not started | AP0 `5612096` exact entrance is live and separately verified, but content-fingerprint/versioned R2 staging is not implemented. | Implement immutable version keys, pointer update, replay, rollback, and lifecycle evidence. |
| 5 | Hard test-mode boundary | Partial | Repair controller requires exact Airtable IDs, `Do_Not_Publish`, allowlists, test-run IDs, and denies generic ACTIVATE/RUN. | Complete stage-worker enforcement and negative fixtures for every path. |

## 2026-08-16 R4 exact-entry repair

- Scenario: **R4 — Start Remotion Render v2.6.2 — Non-Black Cover Frame Contract** (`5556716`).
- Exact Make change: Module 1 changed from broad `airtable:ActionSearchRecords` to `airtable:ActionGetRecord`, named **1 — Get Exact Platform Output**, using `{{input.output_record_id}}`.
- Invocation fields: `test_run_id`, `output_record_id`, `platform_output_id`, `intended_stage`, `attempt_number`, `idempotency_key`.
- Make requires interface fields to remain optional while the scenario retains its scheduled configuration; the Worker hard-requires and validates the complete contract before an exact run can be permitted.
- Preserved: all other 15 modules, their types, names, and routes.
- Final state: R4 OFF; 16 modules; no webhook/gateway entrance.
- Scenario runs: 0.
- Airtable record writes: 0.
- Renders, R2 objects, emails, drafts, and platform objects: 0.
- Make mutation calls across the controlled repair/recovery: 5 successful writes and 1 rejected interface write. The rejected write returned `IM016`; rollback restored the original blueprint/interface before the corrected pass.
- Final idempotent verification: success with no additional Make write.

## Evidence

- Safe Worker rollout: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958138159
- Successful Make repair response (workflow evidence step; final assertion was initially over-escaped): https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958189120
- Successful idempotent repair verification: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958227532
- Final read-only R4 module map: https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/31958315394

## Test-candidate inventory

- Exact query found **0** Platform Outputs with `Do_Not_Publish=true` and `Render_Status=Ready for Render`.
- Exact query found **0** non-test Platform Outputs with `Render_Status=Ready for Render`.
- Existing `Do_Not_Publish` Output 125 (`recrSWeLpsA5TtpX5`) is already Rendered and was not changed.
- Therefore no R4 run proof was attempted. The next run proof requires a dedicated isolated test output, not a reset of Output 125 without an explicit test plan.

## Destructive exclusions honored

No existing record was reset, no durable Drive file changed, no R2 object created/deleted, no render started, no email sent, no draft/post published or removed, and no scenario was activated.
