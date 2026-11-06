# Stage 1 — Live private C5/C6 acceptance gate (2026-11-04)

**Purpose:** Prove the complete native image correction lifecycle on ONE privately held, author-approved Studio output before broader rollout. This is not permission to publish or enable generation globally.

## Verified, read-only baseline

- Repository: `jtl6713/SM-Pipeline-V2`, Stage 1 guarded code merged via #1521, #1601, #1610, #1614 and #1616. Each code merge alone is **not** a live C5/C6 canary.
- Airtable base `appe33zkZn35yirTL`, authoritative `Studio Native Gallery Revision Jobs` table `tbl5sq9xBrF6bgPph`: **0 records at 2026-11-04 audit**. Do not infer jobs from other rendering queues.
- Authorized temporary universal ChicagoShining watermark: Airtable Media Asset `recTnq3abS2rcsTzK`, Google Drive `1WQyd5W1__HkaEkWyC38IMErW8702Rd4u` (source image rights/bytes/pixels still must pass Runner's exact verification).
- Newly created restricted staging folder: [SM Pipeline V2 — Private Native Gallery C5C6 Staging](https://drive.google.com/drive/folders/1VdULNl85JDoL_EaurRKMPm0tRi8xOawH), exact ID `1VdULNl85JDoL_EaurRKMPm0tRi8xOawH`; parent `1qfQ4SQ88adlgvoGIg0D7xXMtLD9AMoyB`. Google Drive returned owner-only permission, `shared=false`, and empty initial contents. **Runner credential access is NOT thereby established.**

## Release gate A — automated, strictly non-mutating live probe

Protected GitHub Actions workflow `.github/workflows/stage1-native-gallery-readiness.yml` checks live Windows Runner through Ops Dashboard **without** any generation, Airtable mutation, Drive upload, secret disclosure, hold release or public posting. It reports only:
- deployed code / local health version vs exact GitHub Runner version;
- current actual provider/model rights-policy *configuration* match and reviewer metadata presence (does not independently supply legal approval);
- whether Runner Google Drive credentials can inspect the proposed staging folder AND see only user/group permissions;
- whether `NATIVE_GALLERY_STAGING_FOLDER_ID` matches that private folder;
- whether protected Worker URL, shared secret and one-shot consumer ID are configured (booleans only);
- whether auto execution, C5 execution, claim and launch flags remain **OFF** during audit.

The workflow may report blockers; a completed audit is **not** a passing canary. Full results are in sanitized GitHub Actions logs. Never insert invented provider/model clearance or switch any flags to satisfy a check.

## Release gate B — named operator and specific source approval

Before any actual C5 call, a named reviewer must inspect the terms for the **live selected** provider and actual model/deployment (including an Azure/secondary provider if configured), record reviewer, approved provider, model, policy reference URL and commercially applicable basis, and explicitly prohibit unchecked failover. The source output must be a user-approved, unscheduled, unpublished native-image/Photo Set/carousel test, with exact Airtable profile/content/slides and Google Drive source bytes, dimensions, rights and actual watermark pixels checked. No existing published/scheduled output, LA publication reservation or unrelated factory record is a valid canary.

One-shot configuration must be restricted to this held source, with `NATIVE_GALLERY_AUTO_EXECUTE_ENABLED=false`. General production gallery generation and public scheduling/publishing remain disabled. Use the existing Worker-owned immutable output lock, job creation/claim/launch reservation and lease, never direct Airtable writes bypassing the Studio lifecycle.

## Release gate C — genuine non-public C5/C6 execution and evidence

Record and compare:
1. **Before:** output ID, exact profile/content IDs, selected slide(s)/order, content rights, source image SHA-256/dimensions and original manifest hash; owned review hold `Do_Not_Publish=true`; no scheduled/published identities; saved exact explicit Generate instruction and job intent.
2. **Generation:** one Runner claim and one reserved launch; pinned rights-cleared provider/model; C5 result bytes and C6 watermark pixel verification. No second provider attempt, duplicate invoice/generation, or automatic retry of an ambiguous launch/Drive response.
3. **Private Drive:** new PNG `mimeType=image/png`, dimensions for platform, exact staging parent, user/group-only permissions, downloaded SHA-256 and byte count matching Runner receipt.
4. **Airtable:** unique generated Media Asset exact profile, `Rights_Status=Owned`, `Active=false`, `Do_Not_Use=true`, exact Drive file ID/transfer key, revision manifest selected-only changes; original slides, siblings and Production Request unchanged.
5. **Studio:** authenticated private V1 and V2 preview bytes, per-slide order, progress, explicit human creative Accept/Reject recorded with `Job_State=creative_accepted` and exact manifest hash, no implicit Factory approval.
6. **Private Factory review handoff:** second explicit human confirmation, canonical Output lock and readback, `Row_Version=6`, `Progress_Stage=factory_review_pending`, exact immutable receipt; original output remains held/Do_Not_Publish, no public URLs, no schedule, and no normal Factory publish approval.
7. **Negative/replay:** wrong profile, stale hold, permissions changed, invalid hashes, all unselected slides unchanged, ambiguous API receipt/retry and duplicate claims all fail closed. Provider post/MAE job inventory unchanged.

**Accept only if every applicable evidence record is real and cross-checked.** A local test, PR green check, read-only readiness report or metadata-only result is not proof of C5/C6 generation. The private Factory inbox remains separate from any later selected-output native publishing package or human Factory approval.

## Handoff

Open work remains live Runner readiness, operator-approved provider policy, explicit private source selection, one-shot C5/C6 production/staging attempt, Drive/Airtable/Studio evidence, and protected QA across four profiles. Do not close Stage 1 release verification based on this runbook or the audit alone.
