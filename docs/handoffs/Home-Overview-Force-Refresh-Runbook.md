# Home Overview Force Refresh & Cache Accuracy

Implemented and deployed 2026-10-17.

## Scope

The Home `All Profiles` overview now separates normal polling from operator-triggered force refresh.

- Normal `GET /api/profiles/overview` keeps source-aware caching and five-second visible-page polling.
- Manual `POST /api/profiles/overview/refresh` starts a protected authoritative rebuild.
- `GET /api/profiles/overview/refresh-status` exposes durable safe operation state.
- Refresh state and single-flight claims are stored in Cloudflare R2.
- Forced refresh recalculates outputs and Ideas, preserves the last-good snapshot until a complete result is verified, and publishes a new snapshot generation.
- Scheduled counts continue to use the canonical `countPendingPlatformDispatch()` eligibility function.
- The client preserves displayed counts while refreshing, disables repeated clicks, survives navigation/reload, and reloads the exact completed generation using `min_generation`.
- Browser cache age is based on the authoritative snapshot timestamp, never on the browser write time.

## Production deployment evidence

Feature PR: #812 — Home overview: authoritative force refresh and cache accuracy

Merge SHA:

`5015e4c12a444628722f37acdc3a2a0735eba757`

Worker verified deploy commit:

`c18760fe5099c8a5b044310659fe144871ba942c`

GitHub deployment status:

`production/studio-api-worker = success`

The Worker deployment gate only reports success after:

1. preserving and verifying the active Cloudflare binding contract;
2. deploying with the pinned Wrangler version;
3. verifying the active Worker source;
4. reading the pre-refresh overview snapshot;
5. issuing an authenticated production `POST /api/profiles/overview/refresh`;
6. polling the durable refresh status to `completed`;
7. verifying `component_status.outputs == "completed"`;
8. verifying `component_status.ideas == "completed"`;
9. verifying a non-empty snapshot generation different from the prior generation;
10. verifying the new snapshot timestamp is newer than the prior snapshot;
11. retrieving the completed generation through the generation barrier;
12. verifying at least four profile rows and numeric values for every overview column.

Pages verified deploy commit:

`306179f40300c782bd4bbe1d8acf798d3dfb6cf0`

GitHub deployment status:

`production/studio-pages = success`

Pages deployment URL:

`https://81d94c32.chicagoshining-studio.pages.dev`

Operator custom domain:

`https://studio.chicagoshining.com`

Production Pages verification confirmed:

- production branch `main`;
- Pages deployment completed;
- exact cache-busted Home overview asset served;
- force-refresh endpoint reference present in the deployed asset;
- `min_generation` generation barrier present;
- authoritative `Updated just now` status present;
- authenticated custom-domain request returned HTTP 200;
- custom-domain content verification passed.

## Reliability and safety

The force-refresh path provides:

- cross-isolate single-flight claiming;
- simultaneous-click deduplication;
- short server cooldown;
- stale-operation reclamation;
- durable refresh status independent of browser tab;
- complete-scan safety ceilings;
- last-good snapshot preservation;
- generation verification before success;
- source timestamp preservation;
- normal polling that never triggers force refresh.

A failed or incomplete Ideas/output scan cannot replace the last-good snapshot.

## Rollback

### Worker

The production Worker deployment workflow captures the active predeploy Worker version and exact binding contract before deployment.

If any deployment or production verification step fails, the workflow automatically restores the captured version to 100% traffic and verifies that rollback before completing.

For a post-acceptance rollback:

1. revert PR #812 (or revert merge SHA `5015e4c12a444628722f37acdc3a2a0735eba757`);
2. append a new rollback entry to `deploy/cloudflare-worker-production.txt`;
3. allow the controlled Worker production workflow to redeploy the reverted source and re-verify bindings/source;
4. only after the Worker is verified, trigger the Pages rollback.

### Pages

For a post-acceptance UI rollback:

1. revert the PR #812 UI changes on `main`;
2. append a rollback entry to `deploy/cloudflare-pages-production.txt`;
3. allow the controlled Pages workflow to deploy the reverted Studio files;
4. verify the unique `*.pages.dev` deployment and `https://studio.chicagoshining.com`.

Do not roll Pages back ahead of the Worker if the rollback removes client support for the force-refresh API.

## Acceptance result

Production acceptance: **PASS**

- Authoritative manual rebuild: PASS
- Cached automatic polling retained: PASS
- New snapshot generation verified: PASS
- All profile rows present: PASS
- All overview columns numeric and complete: PASS
- Canonical Scheduled eligibility retained: PASS
- Ideas force refresh: PASS
- Previous counts remain visible during refresh: PASS
- Duplicate scans blocked: PASS
- Navigation/reload durability: PASS
- Failure/cooldown UI: PASS
- Authoritative cache age: PASS
- Last-good snapshot protection: PASS
- Targeted CI and hermetic regressions: PASS
- Wrangler dry run: PASS
- Worker production deployment: PASS
- Pages production deployment: PASS
- Rollback safeguards: READY
