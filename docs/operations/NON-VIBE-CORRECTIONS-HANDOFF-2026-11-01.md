# Non-Vibe Studio corrections — verified continuation handoff (2026-11-01)

**Branch:** `feat/non-vibe-native-gallery-20261101` (draft PR #1462)  
**Source:** non-Vibe-only extraction from mixed draft PR #1417  
**Main baseline:** `8c74f7c3a052ef70fb3e27e05ca2e379a78aa123` (may since have advanced)  
**Safety:** No Vibe Cut composition, generation, audio, approval, or publishing changes. No deployment, no production flags enabled, no public posts and no Airtable production writes.

## Completed and committed

1. Isolated image/gallery revision attempt builder that validates original slide order, content profile, Drive ownership/rights evidence and exact launch ledger; unchanged slides are retained; duplicate/ambiguous attempts require reconciliation.
2. Profile-specific watermark resolver and C5/C6 image pipeline with independent staged Google Drive readback, MIME, SHA256, size and pixel-change validations. No Chicago logo fallback for other cities.
3. Immutable original manifest extraction and revised gallery evidence contract with Node tests.
4. Factory matching authority, format-capability denial (native images and Vibe remain not enabled), scoped selection, idempotent batch receipt/fanout core, and Node tests. Batch POST remains **unmounted**.
5. Authenticated, read-only `GET /api/factory/outputs/:recordId/correction-matches?production_request_id=:recordId` mounted into Worker, strictly profile scoped through live Airtable Content Item, configured Production Request mappings and watermark Media Assets. Response is always `batch_enabled:false`; unsupported content is visibly reported. No write operation reachable through this route.
6. Dedicated CI `.github/workflows/non-vibe-native-gallery-ci.yml` verifies Node gallery artifacts, original source, Factory matching/ledger, and Python image/Drive/branding contracts. First CI failure was missing `requests`; fixed by installing Runner requirements. CI on `0cff56b817d2` passed. This file tracks intended new behavior, not evidence of end-to-end completion.

## Live authoritative branding audit

Airtable base `appe33zkZn35yirTL`: Brands table `tblUV8Cd7C2UCyuJ9`. All four Brand records (Chicago, LA, NYC, Miami) have blank `Watermark_File` and `Logo_File` columns at audit. Media Assets table `tblSITCujCsJTNcDe` has two Watermark-role/Owned/Available/Active records, both linked to **Chicago** only. The small Chicago PNG's file metadata was independently read from Google Drive (file ID `1WQyd5W1__HkaEkWyC38IMErW8702Rd4u`; MIME image/png; size 2,075,758 bytes). The Drive branding folder contains two Chicago watermarks and an official Chicago logo. No approved LA, NYC, or Miami watermark was identified in the searchable Media Assets records. A metadata read is **not** independent decoded-byte/pixel evidence. **Keep other profiles blocked; do not synthesize a logo or substitute Chicago branding.** Approved media and explicit provenance/rights evidence must be supplied for each missing city.

## Unfinished work — required for genuine Studio availability

1. **Gallery lifecycle end-to-end:** wire a read-only verified existing gallery retrieval into Studio; create a genuine user-directed per-slide change proposal; require explicit generation; persist one authoritative Airtable attempt/job receipt *before* external side effects; Runner uses exact claimed lease and staging Drive writer; commit immutable manifest with readback and reconciliation-only retry after ambiguity.
2. **UI:** add single-image, Photo Set and carousel preview, multi-selection, correction instructions, in-progress status, before/after, full revision history, accept/reject/revise, mobile-friendly controls. Never refresh the page without persistent operation receipt/progress. Distinguish creative acceptance from Factory approval.
3. **Branding:** identify official LA/NYC/Miami assets and create/validate authoritative profile-linked Media Assets; implement safe content-admin replacement with no code deploy; fail closed on absent or cross-profile watermark.
4. **Factory:** show profile/filter state and eligible/ineligible destinations; fully integrate authorized selected-output fanout from the currently unmounted batch core without selecting unrequested outputs; preserve individual identities and partial-failure recovery. Current GET preview is not a write authorization.
5. **Publishing/MAE:** verify native image packages and actual adapters by platform, revised manifests, manual published-URL repair with audit and provider restrictions, ordinary Factory approval, time zone/lanes, no duplicate send, Airtable authoritative write-through and Supabase mirror reconciliation. No corrected content may auto-publish.
6. **Admin QA Test Center:** PR #1429 (separate draft) owns the foundation. Integrate non-Vibe tests only after coordinating with that workstream. Store real evidence and release gate failures, not mocked pass statuses.
7. **Integration/release:** rebase against moving main without overwriting PR #1461, #1429 or the independent Vibe workstream; run all required CI; conduct genuine staging non-public canaries for each supported content type and brand; merge, deploy Worker/Pages/Runner only after approvals and gates, verify versions and user operation.
8. **Update/compare CI:** check latest branch workflow runs for exact final head; the first read-only Worker route commit `e0755fd` failed broad syntax jobs because its regex was escaped twice; immediate follow-up commit `835038c` corrected the regular expression. Do not interpret older workflow failures as current-head failures. Validate current-head workflows before proceeding.

## Precise next engineering action

Inspect newest `main` and **check CI at head `835038c34c8d9d7fcfeff1515f486b140eaa7989`**. If CI passes, keep GET preview guarded and write-disabled; then implement an authoritative exact-output gallery inventory/Drive verifier, wire it into the existing Rendering Review read model, and integrate strict durable attempt operation receipts before opening any generation or Factory POST path. Use a controlled unpublished test output; ensure no Vibe paths changed. For branding, obtain actual approved assets for LA, NYC and Miami rather than guessing.

## Release declaration

**NOT COMPLETE; NOT LIVE; NOT DEPLOYED; NOT SAFE TO ENABLE.** Draft PR #1462 is a recoverable implementation foundation. No end-to-end gallery, Factory approval, native media publishing or real staging canary has been performed. Airtable remains authoritative, Supabase remains non-authoritative, Drive remains media authority and Vibe Cut was not modified in this branch.
