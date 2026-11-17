# QA-PRODUCTION-MISSING-PLATFORM-OUTPUTS — production request has no materialized output links

**Observed:** 2026-11-17, LA Shining requests `PR-20261117045317-QNCAQF` (two planned outputs) and `PR-20261117045332-NS5O86` (four planned outputs).

## Signature and proactive scan (all four profiles)

Scan **Supabase** `production_requests` and `production_request_outputs` for Chicago, Los Angeles, New York, and Miami. Do not read or write Airtable.

- Request is Submitted or in an active production state; `output_plan_status = Ready`.
- The approved `output_plan.items` is nonempty and the matching `production_request_outputs` rows exist.
- One or more expected `production_request_outputs.platform_output_id` values are NULL, or the referenced `platform_outputs` row is absent.
- Production error contains `No Platform Outputs found for this Production Request`, or the job has stalled before output materialization. **Do not wait for five retries or escalation to detect this.**
- Also flag a promoted request whose count of uniquely linked, correctly profiled Platform Outputs differs from its planned enabled output count.

Signature ID: `QA-PRODUCTION-MISSING-PLATFORM-OUTPUTS`. Emit request ID, profile, plan count, linked count, missing output keys, step, error, age, and remediation outcome.

## Root cause and prevention

The runner must not enter the stamp/render stage until the planned outputs have been materialized and linked to their production-request output rows. Promotion/materialization is a prerequisite, not something that a retry of stamping can accomplish. If no promoted Content Item exists, first run the **normal idempotent promotion/materialization path**; do not insert orphan Platform Outputs. Gate transitions on a fresh Supabase readback of both parent and child links.

## Bounded safe recovery

1. Acquire an exclusive request-scoped production lease with a fencing token. Re-read the request, plan, profile, job, output rows, Content Item, and existing Platform Outputs from Supabase.
2. Match each enabled planned output to an existing output by immutable production-request-output UUID and canonical profile/platform/output-type identity. Detect duplicates and ambiguous matches. Preserve existing output IDs, selected media, sequence, approval, and scheduling.
3. If the request is not promoted, invoke the **existing idempotent promotion workflow** to establish the Content Item. If promotion is unavailable or ambiguous, mark Needs Eyes and stop.
4. For each proven missing output, invoke the **normal idempotent materialization workflow** with the production-request-output UUID as idempotency key. Never invent IDs or copy an output from another request/profile. Do not publish, approve, or schedule.
5. Fresh-read and verify every enabled planned output has exactly one existing Platform Output, correct Content Item/profile/platform/type and authoritative media, and an established `platform_output_id` link. Any mismatch or duplicate is Needs Eyes.
6. Resume the existing production job from the earliest valid prerequisite step; clear the escalation latch only after reconciliation succeeds. Cap attempts, record the repair audit and recheck progress. Do not loop the same missing-output error.
7. Success requires the request reaching Ready for Review with expected unique output counts and no duplicate outputs. Otherwise preserve the actual blocked state and an actionable reason.

## Hard stops

Never automatically repair if a lease is active/unknown, a linked output is published or approved, the identity is ambiguous, the profile mismatches, source media/order cannot be verified, promotion is partially committed, or the Supabase environment cannot be confirmed as authoritative. No direct database insert of guessed Platform Outputs. No Airtable access.

## Regression tests

- Missing 2/2 and 4/4 links; partial 1/N link; dangling FK; stale job after max retries.
- Existing canonical outputs with null link: link only, no duplicate creation.
- Concurrent recovery under the same request: one materialization per planned output.
- All four profiles: identical behavior with strict profile isolation.
- Negative cases: ambiguous duplicate, published output, incomplete media, unknown lease, unpromoted request with unavailable promotion adapter.
- Assert no external publish/schedule/approval, no Airtable calls, and auditable Needs Eyes on unsafe cases.

**Implementation requirement:** This document is the signature contract; it is not evidence that a runtime scanner or recovery adapter is deployed. Wire the Quality Agent scanner and test it before claiming automatic repair.
