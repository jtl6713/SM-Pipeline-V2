# Branch reconciliation — 2026-11-05

## Scope and decision
At review time this repository had nine live branches, including protected `main`, and exactly two open draft PRs (#1429, #1465). All eight non-main heads are divergent from `main`: no unique commit is deleted without an exact-SHA archive tag.

This maintenance change **does not merge old runtime/deployment changes**. Re-applying superseded Stage 3 or Worker release markers could regress the already merged fixes. The original branch commits remain recoverable from the verified archive tags.

## Archive before deletion (4)
| Branch | Exact SHA | Reason to retire |
|---|---|---|
| `deploy/worker-ig-legacy-qa-20261104` | `8f21043966549aeb5664ad1628f20264c729cdcb` | PR #1628 closed as a duplicate; equivalent protected Worker deployment completed through merged PR #1629 |
| `fix/stage3-failclosed-live-audit-20261103` | `776261ef9b02cc19fbe09bcbbe6e5fa70fe0a67a` | Closed PR #1603 explicitly superseded by merged PR #1605 |
| `fix/stage3-ig-stalled-progress-truth-20261104` | `4dfea71b160eaf3fb26c3e3c79445ea85bc0b474` | Closed PR #1633 explicitly superseded by merged PR #1635 |
| `fix/factory-server-timeouts-20261104` | `3af6934db2f00cb4b9cc6c54b02aa9cbdd547950` | PR #1608 merged; extra branch-head diagnostic only pins the now historical Worker `0.10.747` and should not be reapplied to production |

The workflow archives these heads under `archive/branch-cleanup-20261105/<branch-with-slashes-as-->` and verifies each tag before any deletion. It uses exact-head checks, protected-main enforcement, expected open PR heads, supersession evidence, GitHub Actions activity checks, and a Git force-with-lease to delete only a reviewed SHA. Changed inventory, missing archive tag, new PR or moving branch aborts.

## Retained active branches (4)
- `feat/qa-test-center-foundation-20261031` — draft #1429 explicitly declares unfinished QA Test Center work. Do not merge as complete.
- `feat/vibe-cut-isolated-contracts-20261101` — draft #1465 is unmounted preservation material awaiting a separate validated workstream.
- `diag/r4-last-launch-receipt-20261103` — read-only diagnostic branch previously retained by the November 3 cleanup; hold until R4 issue is closed or explicitly superseded.
- `repair/drifter-watermark-v2` — recent operator-requested watermark repair workflow not yet independently reviewed/merged.

## Completion evidence
The cleanup is considered complete only after the post-merge GitHub Action reports `CLEANUP_COMPLETE`, four `TAG_VERIFIED` entries, four `LEASE_DELETED` entries, and a fresh GitHub branch inventory showing `main` and the four kept branches. A green PR alone is not deletion evidence.

No production rendering, approval, scheduling, publication, Airtable or Supabase mutations are part of this cleanup.
