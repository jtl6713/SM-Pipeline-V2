# Rendering Review — Chicago Manual Pilot: Phase 0 checkpoint

Status: **Phase 0 policy and isolated tests only.** Not live, not deployed, no publishing changes.

Repository: `jtl6713/SM-Pipeline-V2`. Branch: `feature/rendering-review-chicago-phase0-20261027`, forked from `main` at `8e47db502126b6c3d5b1206256f511e24d189256`.

## Confirmed code and authoritative data

- `PROJECT_RULES.md` requires bounded, reversible operations, exact record scopes, no public-post canary by default, and verified deploy before claims.
- Worker route entry is `apps/studio-api/worker.js`; implementation is split across `worker-functions-01.mjs`–`04.mjs`. Changes to one module must remain compatible with Worker imports and Wrangler bundling.
- `apps/studio-api/producer-conversation.mjs` persists Script-a-Short/Factory messages inside the Airtable Production Request `Production_Notes` field, with an approximately 9750-character guard. Its current proposal interpretation is conservative and does **not** constitute autonomous producer reasoning.
- `conversational-producer-plan.mjs` validates asset IDs, profile scope, selective rework stages, and stale revision dispatch. It does not commit live render attempts.
- `worker-functions-04.mjs` has existing `approveOutputRecordForPublishing`: shared per-output R2 approval lock, authoritative Airtable read, `Do_Not_Publish` check and scheduling through existing reservation authority. `worker.js` exposes Pipeline and Factory approval routes. **Do not replace the scheduler.**
- Existing Factory producer revision advancement is `factoryAdvanceProducerRevision`, and post-render check is `factoryVerifyProducerRevisions` in `worker-functions-04.mjs`; the latter may clear `Do_Not_Publish` upon its own quality success. This is an explicit conflict to resolve before using that boolean as a review hold.
- `worker-functions-03.mjs` exports `studioPublishDispatchTarget` and uses `Do_Not_Publish` to select Instagram Reel dispatch `AP1_IG_WEBHOOK_URL`; there are more writer/continuation paths. A review hold must also be checked by the irreversible provider dispatch owner and must survive all unrelated repair and producer paths.
- Airtable base `appe33zkZn35yirTL` contains `Content Profiles` `tblNYg2QB0BmmVACy`, `Platform Outputs` `tblrlPeboBthkplH0`, `Production Requests` `tbl75nxNi6PMUjBQE`, `Media Assets` `tblSITCujCsJTNcDe` and `Pipeline Settings` `tblpHPWeEkyJaF7ql`.
- Confirmed Chicago Content Profile record `recT2rbKX3MF7cVFU`; timezone America/Chicago. The Output schema has `Platform_Output_Type`, `Final_File_ID`, `Final_File_URL`, `Publish_Started_At`, `Publish_Locked_At`, `Do_Not_Publish`, `Review_Status` and existing `Replace_*` transaction fields. Existing records are not review-attempt versioned.
- Google Drive remains canonical durable media. Existing R2 transient preview/lock storage is not authorized to become a new media or approval source of truth.

## Code added by this PR

`apps/studio-api/rendering-review-policy.mjs` is a pure policy module, with pilot off by default. It defines:
- Strict Chicago + Instagram Reel manual admission eligibility.
- Caller-verified authoritative-hold prerequisite before a new session can exist.
- Isolated, serializable review messages, frozen plans, explicit/conditional authorization, dependencies, monotonic creative versions and numbered attempts.
- Same-attempt render job retries, callback ownership fencing, stale callback audit, latest-only attempted approval, verified-scheduler receipt prerequisite for hold release, and safe reference-aware deletion candidate selection.
- Additional dispatch gate that blocks held, stale, nonapproved or wrong-artifact attempts. **It is not wired into production and must never be described as an active publishing hold.**
- `apps/studio-api/rendering-review-policy.test.mjs` tests fixtures without creating live Airtable records, side effects, or public posts.
- `.github/workflows/rendering-review-phase0-ci.yml` checks syntax, Phase 0 fixtures, and existing producer/approval-lock regression contracts.

## Required next integration (not completed by this PR)

1. Choose an authoritative, durable storage model for review sessions/messages/plan/attempts with bounded, indexed reads and a real atomic coordinator. Prefer additive Airtable records for durable business state and existing R2 CAS only as a lease/fence, not a second approval authority. Review the actual Airtable write/atomicity limitations.
2. Specify a separate review-owned hold that cannot be accidentally cleared by `factoryVerifyProducerRevisions`, unrelated recovery, schedule regeneration or a stale saved Factory approval. Install an authoritative read before dispatch and teach all relevant provider dispatch paths, including direct make/webhook/runner paths, to fail closed on hold or unknown gate read.
3. Acquire the same per-output approval/dispatch lock **before** checking current dispatch ownership and enrolling. Serialize schedule removal and hold placement, verify both authoritative readbacks, then return success. Existing scheduled output enrollment is only by explicit manual pre-dispatch selection; old scheduling must never be silently restored.
4. Implement authenticated APIs with server-generated idempotency fingerprints, expected versions, scoped permissions, verified asset manifests, persisted model-produced reasoning, and independent facts/sources. Do not accept user-provided `role=producer`, `validation_passed`, `scheduler_receipt_verified` or `hold.verified` as trusted assertions.
5. Connect plan-to-render operations to the existing pipeline runner; create immutable attempt media identity, verify actual output script/graphics/audio and safely promote only the matching active job. Handle physical cleanup only after reference-aware proof.
6. Build the gated, responsive Rendering Review tab and Factory/Pipeline entry links only after the hold is end-to-end enforceable. Leave unrelated existing outputs fully unchanged.
7. Complete race, duplicate request, reload, stale approval, render-only canary, CI and production deploy verification. Keep sampling 0%; no public posting during tests.

## Safety and rollback

This Phase 0 PR changes no Worker route, UI, deployment trigger, Airtable schema, production data, media, schedule, runner, or publishing worker. Merging is code-only; pilot remains inaccessible. Do not enable feature from a UI toggle or `Do_Not_Publish` mutation while dispatch and hold integration remains incomplete.

For the complete desired product, refer to the user's October 27, 2026 Rendering Review and Conversational Producer implementation handoff.
