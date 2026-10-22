# Branch consolidation — October 22, 2026

**Goal:** one live branch (`main`), no open PRs. Preserve all prior unmerged or superseded branch heads as immutable SHAs reachable through archival git tags before deleting branch refs.

- Latest merged PR: #1070 — safer bounded FB3 existing-post finalization, CI 7/7.
- Superseded PR #1067 closed; #1068 merged and Pages deployed.
- Superseded PR #1028 closed in favor of #1064; #1049 closed in favor of #1065. No pending code conflicts.
- Workflow refuses unfamiliar branches, protected or moved heads, and any open PR. It also requires an archive-tag readback for every exact branch SHA before *any* branch deletion and uses `git push --force-with-lease` to prevent racing other work.
- Older feature branches include work not present on main. The archive tags preserve those commits and do **not** imply all changes were merged or deployed.
- GitHub's auto-delete-branch-on-merge is enabled; this workflow guards and removes its own merge branch if needed.
- No production publish, secrets, source-of-truth or Cloudflare deployment is changed by this cleanup.

## Exact branch inventory and archive tags

- `cleanup/stray-battery-park-preview-r2-20261022` @ `2ecaa2b9c2ec6c5b22ec093afd0deb31ff78dfdd` → `archive/branch-consolidation-20261022/cleanup--stray-battery-park-preview-r2-20261022`
- `feature/qa-approved-past-due-reconcile-20261021` @ `daefeee5950dfbdac7226af2661e58a3c449bc65` → `archive/branch-consolidation-20261022/feature--qa-approved-past-due-reconcile-20261021`
- `feature/quality-autonomous-verification-recovery-v1` @ `2fa9d7c787dec2b343bc3cfd349f8e6754d99811` → `archive/branch-consolidation-20261022/feature--quality-autonomous-verification-recovery-v1`
- `fix/factory-content-parent-grouping-20261021` @ `b5522322e158c18cc9b75d9b1d226d95c9e8a7db` → `archive/branch-consolidation-20261022/fix--factory-content-parent-grouping-20261021`
- `fix/quality-agent-all-failed-outputs-20261020` @ `b4e2dfd5bebfc7ff57721129852fa85a9d563561` → `archive/branch-consolidation-20261022/fix--quality-agent-all-failed-outputs-20261020`
- `fix/scripted-short-proposal-500` @ `fd9a28a8214acb7cca5289213db238f1267ffe00` → `archive/branch-consolidation-20261022/fix--scripted-short-proposal-500`
- `release/qa-publish-ui-0745-20261022` @ `fc490cd4cb4cb72f134f670dbd8abed716478d7a` → `archive/branch-consolidation-20261022/release--qa-publish-ui-0745-20261022`
- `tmp/qa-publish-1028-rebase-20261021` @ `b31a6661bad420ef17b165ce5485818899a1e55a` → `archive/branch-consolidation-20261022/tmp--qa-publish-1028-rebase-20261021`

- `release/fb3-light-finalize-worker-20261022` @ `2b19e4b728fd6d67209c7e413446a63939cd9a0d` → `archive/branch-consolidation-20261022/release--fb3-light-finalize-worker-20261022` (at main SHA; refuses deletion if it advances)

## Verification

Require Workflow `Archive and consolidate superseded branches to main (2026-10-22)` to finish SUCCESS and emit `ONE_BRANCH_VERIFIED`, then independently GET the remote branches and open PRs. If a contributor creates a new active branch, the workflow refuses deletion pending review.