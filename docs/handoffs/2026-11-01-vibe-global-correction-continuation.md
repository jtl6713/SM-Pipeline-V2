# SM Pipeline V2 — Global Factory Corrections, Vibe Cut continuation

Date: 2026-11-01 (America/Chicago)
Source: user-supplied transition ZIP (HANDOFF.md and ORIGINAL-REQUIREMENTS.txt)
Repository: `jtl6713/SM-Pipeline-V2`
Active work: draft PR #1417, `feat/factory-matching-correction-preflight-20261031`
Previous head before this continuation: `f05fdd1df855c4a89849541a257c1dcfbb13bdee`

## Development performed in this continuation

This session continued **Phase 1 — Vibe Cut only**, without touching production or enabling correction flags. Existing PhotoSequence, Factory, gallery, Worker, and Runner behavior was inspected; no competing implementation was created.

New branch changes (in order):

1. `b1e2b9b`: `services/remotion-renderer/vibe-review-music-policy.js` gates protected Vibe music to an exact canonical Google Drive URL and rejects bogus byte headers.
2. `45d11b8`: tests for private music URL and response types.
3. `be22fb5`: `render-server.js` now retrieves protected Vibe music via the existing internal Runner Drive media endpoint instead of directly from public Drive. Ordinary posts retain their existing path; protected music does not follow redirects.
4. `4e9bca4`: Phase 0 CI covers the music policy.
5. `23896ea`, `21cc223`, `5300b77`: shared exact subsecond Vibe clip duration policy and Node regression tests; normal PhotoSequence retains >=1-second scenes.
6. `d1b17fd`, `ddf8534`: align `Root.tsx` duration metadata and `ChicagoShiningPhotoSequence.tsx` media runtime to the same exact fast-cut frame durations.
7. `1ad3d50`: Phase 0 CI adds timing regressions and Remotion TypeScript check/bundle.
8. `ad256a2`: pure Vibe compiler disables default crossfades so a 6-frame cut is not obscured.
9. `a267025`: exact 0.2-second cut accepts benign floating-point representation error.
10. `9b2aa3c`: Python fixture asserts fast-cut frames and hard cuts.
11. `656d35f`, `790f20a`, `7a8d920`: require ffprobe-confirmed decodable, audio-only music in protected Remotion localization; test rejects video, corrupt and fake audio, too-long tracks.

**Validation established:** GitHub connector readback verified integration anchors in changed files. No exact-head CI test result, actual MP4, approved Vibe attempt, Drive write/readback, Studio playback, Factory approval, or production canary was observed. A previous pre-change head (`1440248905cfbe2e9ffc0b3be0cc816c11adc833`) had a successful old Rendering Review Phase 0 job but failures in legacy Regression functional and Validate Studio Worker Source Split. Those historical results do not establish this head is green.

## External branding audit (read-only)

Airtable production-connected base `appe33zkZn35yirTL` has four active `Content Profiles`:
- Chicago `recT2rbKX3MF7cVFU`
- LA `recF7UAn0LkMZZrWZ`
- NYC `recgtK8Z7eNADNtVy`
- Miami `recpNlNn6U6eq0M9r`

Each associated `Brands.Watermark_File` and `Brands.Logo_File` attachment field is empty. Searching the Airtable `Media Assets` name field for `watermark` found exactly **two** owned, active, available Chicago Watermark PNG Media Assets (`recTnq3abS2rcsTzK` and `recsr3dvswSEJ35om`); no LA, NYC or Miami watermark asset surfaced in that exact search. Connected Google Drive filename searches for city watermarks yielded no additional authorized file. This does not prove that no city logos exist elsewhere, but the current **authoritative owned-assets evidence needed by the protected renderer is missing** for non-Chicago profiles. NEVER fabricate, copy, rebrand or substitute another city's logo. An operator must provision and verify independently owned city logo assets before a multi-city canary.

## Still unimplemented / unverified (required by uploaded directive)

**Phase 1 — Vibe Cut must finish first.** The existing Vibe compiler (`vibe_cut_revision.py`), durable launch wrapper (`vibe_cut_launch.py`) and final MP4 validator (`vibe_owned_video.py`) are unmounted helpers: the current authorized Runner HTTP entrypoint `one_job_http.py` invokes `one_job.py`, which only completes a PhotoSequence-style review. Create a type-scoped Worker/Runner Vibe job enrollment, secure claim, durable one-shot intent and live launch wiring, real output status poll, full MP4 download, independently verified media/music/source cuts/profile watermark, separately staged Google Drive MP4 with exact hash/size readback, immutable attempt+session completion, Studio preview/reject/approve, Factory exact-output handoff, and per-platform scheduler reentry. Preserve V1 and siblings, manual human approval and distinct per-output publish hold. No automated public publish.

**Phase 2:** unmounted native single-image/gallery runner needs profile watermark and job/attempt ledger adapters, read-only owned source and edit manifests, private Drive artifact staging with rights, ordered 1:1/4:5/9:16/16:9 output proofs, Worker status/preview/approval and platform-specific manifest publishing. Do not silently treat video MP4 as a gallery.

**Phase 3:** provision/verify exact owned logo files for all city profiles, with media asset record/profile/rights/Drive MIME/hash/dimensions and renderer mapping. Fail closed on missing brand.

**Phase 4:** complete Factory correction batch and Producer roundtrip with independent selected-output media, holds, approvals, scheduling and idempotent publish gateway; preserve Airtable write authority, Supabase mirror, Drive media authority, current post IDs and original assets.

**Phase 5:** execute exact-head Node/Python tests, `node --check services/remotion-renderer/render-server.js`, `node --test services/remotion-renderer/vibe-review-music-policy.test.js services/remotion-renderer/vibe-review-timing.test.js`, `PYTHONPATH=services/pipeline-runner python -m unittest discover -s services/pipeline-runner/tests -p 'test_rendering_review_vibe_cut_*.py' -v` (or enumerate individual matching tests), `cd services/remotion-renderer && npm ci --ignore-scripts && npx tsc --noEmit && npm run build`; Phase 0/Phase 1/publish/Factory suites and broad regression. Rebase/merge `main` divergence cautiously with exact-branch preservation and resolve old failing static assertions without disabling CI. There are no current-head GitHub Actions workflow runs available via the connector. Do not treat a static readback as a test pass.

**Phase 6:** after genuinely green tests, run an isolated **non-public** user-authorized Vibe correction canary including revised MP4 playable evidence, independent watermark and music checks, V1 intact, no unwanted public upload or duplicate, and rollback; only then stage gallery. Keep global write flags **off** until certified for every supported media kind. Check actual Cloudflare Pages/Worker/Runner versions; any Studio UI runtime edit requires a strictly higher UI build/cache key/BUILD_ID than current `main` and deployed custom domain. Merge and deploy via GitHub workflows with verified runtime readback. Do not merge the current unmergeable draft, claim release, or flip global flags now.

### Exact next action

Mount the existing protected Vibe job ledger and renderer runner path behind dedicated per-media-kind authorization, then run the above exact-head tests; before attempting a non-Chicago Vibe canary, provision official profile-owned Drive PNG watermark receipts and corresponding server-controlled renderer mapping. Release scope cannot progress without verified branding and CI. The user has explicitly requested implementation without mode-switch prompts; do not ask them to switch modes.
