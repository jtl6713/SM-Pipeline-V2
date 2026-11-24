# SM Pipeline V2 — Agent execution rules

These rules apply to every change made in this repository, including handoff/resumption chats.

## Non-negotiable Studio Pages release version rule

**Every production Studio UI deploy containing a changed UI runtime asset MUST use a new, strictly higher UI release version than both the current `main` baseline and the actual deployed custom-domain version.** Do not consider a PR, merge, or feature complete if the UI release cannot deploy. This has repeatedly caused preventable deployment failures.

Before merging a change to `apps/studio-web/index.html` or any JavaScript/CSS runtime asset under `apps/studio-web/assets/`:

1. Inspect the current `main` UI version and, when releasing, the deployed `https://studio.chicagoshining.com` UI version using the existing protected GitHub Actions deployment checks. Pick a new **strictly higher** `X.Y.Z` version; do not reuse the previous version even if only one asset changes.
2. In `apps/studio-web/index.html`, update `<span id="uiBuildLabel">UI build X.Y.Z</span>` and the **shared** `?v=X.Y.Z-<release-suffix>` cache key on ALL versioned JavaScript/CSS asset references.
3. In `apps/studio-web/assets/app-item4-1008.js`, update `BUILD_ID` to `item4-X.Y.Z-<release-suffix>`, **exactly matching** the shared cache key.
4. Run `node apps/studio-web/ui-release-contract.mjs` and `node --test apps/studio-web/ui-release-contract.test.mjs apps/studio-web/pages-production-deploy-contract.test.mjs` before merging. The Studio Pages Release Version Regression GitHub PR workflow also checks that changed UI runtime assets have a **higher version than the PR's base branch**, not merely matching versions within the PR.
5. Trigger Studio Pages deployment **through GitHub** by updating `deploy/cloudflare-pages-production.txt` only after the release version is bumped. Inspect the GitHub Actions result and confirm production custom-domain `BUILD_ID`/asset version matches. If deployment fails, fix and redeploy; never report the pilot as user-test-ready on a merge alone.

No same-version exception for changed UI runtime assets. Do not "fix" a version failure by disabling or weakening the production deployment guard. This step is mandatory, not optional hardening, and should be completed in the SAME implementation PR as the UI changes.

## Deployment and pilot completion

Cloudflare Workers and Pages are deployed through GitHub workflows. Do not claim Cloudflare access is unavailable merely because a direct Cloudflare connector is not present. Distinguish code merged, deployed, runtime flags enabled, and user-test-ready; those are separate statuses. A user-test MVP is finished only when the actual user can perform the intended workflow; producing a test render on the user's behalf is not a prerequisite when the user explicitly wants to test the rendering themselves.

Preserve publisher authorization, exact-output pilot scoping, durable media source ownership, and existing scheduling/publication safeguards.

## Autonomous release operations — owner direction 2026-11-24 (#2972)

Routine authorized engineering releases are the agent's responsibility, not the owner's. Use the authenticated GitHub integration to inspect the exact PR head, conflict status and all relevant checks, merge a reviewed in-scope PR with the expected head SHA when the checks pass and GitHub permits it, then inspect the actual production deployment workflow. Do not ask the owner to click Merge, run PowerShell, restart services, supply secrets, or relay logs when an existing protected path can do the work. Never bypass branch protections, reviewer requirements, failed checks, deployment safeguards or publisher authorization. If a genuine access/approval blocker persists, record the exact attempted operation and failure instead of assuming a missing capability.

- Runner, Timing Engine, Remotion and Ops Dashboard releases use their existing GitHub-to-Ops deployment workflows. Cloudflare services use their existing protected release workflows. Verify the actual release identity and runtime evidence, not just workflow success or an unchanged version label.
- For an authorized bounded production recovery, prefer an existing exact allowlisted action or protected workflow over owner-local scripts. Keep credentials within the existing trusted execution environment. If an exact recovery workflow is necessary, require reviewed fixed scope, read-only identity and governor checks, no publishing/approval/schedule side effects, immutable action evidence and no retry after ambiguous or accepted mutation. Run the SAME hermetic preflight on the PR, without Ops secrets or production access; only execute the protected step after merge on main.
- Check other agents' active PRs and production jobs before merging or dispatching. Do not duplicate or supersede their work silently. Keep the main deployment and recovery workflow serialized as appropriate.
- A failed or skipped gate is not a successful release. Investigate test failures without weakening assertions or removing safety checks. A successful merge is not evidence of deployment, and deployment is not evidence of actual user functionality. Require the end-to-end evidence defined by #2972; pending validation must be labeled pending. Preserve deliberate silence and creative-only advisories, human Factory approval, and all workload/publishing safety constraints.
