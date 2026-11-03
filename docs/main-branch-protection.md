# Main production branch protection — operational contract

Repository: `jtl6713/SM-Pipeline-V2`. This file documents the owner-admin
configuration, not a claim that the ruleset is currently active.

## Admin configuration (public repository; GitHub Free)

1. GitHub **Settings → Rules → Rulesets → New branch ruleset**.
2. Name: **SM-Pipeline-V2 — Main Production Protection**.
3. Enforcement: **Active** (only after a successful test PR).
4. Target: **Default branch** only (the `~DEFAULT_BRANCH` ref selector, currently `main`).
5. Enable **Restrict deletions** and **Block force pushes**.
6. Enable **Require a pull request before merging**. Set approvals to **0**;
   no code-owner review, last-push approval, or mandatory outside reviewer.
7. Keep squash merging enabled in repository Settings → General.
8. Initially do not require status checks. Once a PR targeting `main` has
   actually completed the **Main PR Safety Gate / pr-safety** job, require
   exactly the check context **pr-safety**, originating from GitHub Actions.
   Avoid path-filtered checks and production deployment statuses here.
9. Initially leave required conversation resolution, signed commits, merge
   queue, linear history, and merge commits restrictions disabled.
10. Use **no bypass actors**. Rulesets enforce against administrators when
    no bypass is granted. Do not add a general GitHub Actions bypass.

## Day-to-day AI workflow

Create a development branch from the latest `main`, edit and commit there,
open a PR targeting `main`, and wait for the `pr-safety` check to succeed.
Merge with squash via the connected GitHub integration. The merge then yields
a normal `push` event on `main`; deployment marker files and existing
path-filtered workflow triggers remain unchanged.

`pr-safety` executes on all main-targeted PRs including docs and workflows;
it reads repository code and runs syntax and automated regression assertions
without any production credentials. Do not require deployment workflows as
pre-merge checks: they run after the merge and/or only on matching paths.

## Airtable credential envelope

The existing files `public.pem`, `private.pem.enc`, and
`airtable_pat.ciphertext.b64` must be preserved together. The former
bootstrap workflow regenerated the RSA key pair and pushed straight to
`main`, potentially invalidating the existing Airtable ciphertext. It now
verifies committed artifacts without changing keys or repository contents,
and uses only read permission.

To rotate the envelope, use an explicitly authorized development PR that
updates the matched public key, encrypted private key, and ciphertext
together. Never commit a plaintext private key or token. Validate decrypt
and key/ciphertext compatibility in a private, access-controlled execution
environment before requesting the squash merge. Do not generate a new key
pair merely because an Actions workflow is manually retried.

## Legacy one-shot workflows

Some old `apply-*`, `capture-*`, and `checkpoint-*` workflows include
`git push origin HEAD:main` or unqualified `git push`. These historical
scripts are **not compatible** with protected main. Do not rerun such an
old one-shot under the protected-branch ruleset. If its operation is needed,
first port the intended changes into a development branch and reviewed PR.
Do not grant a permanent GitHub Actions bypass to keep obsolete scripts
working. This gate does not claim all legacy one-shots have been migrated.

## Deployment preservation

- Worker: `deploy-cloudflare-worker-production.yml` on `main` changes
  to `deploy/cloudflare-worker-production.txt`, or authorized dispatch.
- Pages: `deploy-cloudflare-pages-production.yml` on `main` changes
  to `deploy/cloudflare-pages-production.txt`, or authorized dispatch.
- Pipeline Runner: `deploy-pipeline-runner-via-ops.yml` on `main` changes
  to its workflow file or `deploy/i1-durable-runner-release.txt`.
- Remotion: `deploy-remotion-via-ops.yml` on `main` changes to the
  Remotion service/deploy paths declared by that workflow.

These jobs authenticate to Cloudflare/Ops with existing Actions secrets and
do not need to bypass protected branch writes. A documentation-only or
workflow-only protection PR is not a production deployment proof.

## Emergency recovery / rollback

Preferred emergency fix: regular PR with focused CI and squash merge.
If GitHub CI infrastructure is unavailable or an incorrect required check
blocks all merges, the repository owner can go to Settings → Rules →
Rulesets → this ruleset, change enforcement to **Disabled** (or remove only
the problematic required-check rule), perform the narrowly approved
recovery through a PR, restore enforcement, and audit the resulting
ruleset history and PR/commit history. Do not disable protection for an
ordinary failing test or grant unrelated actors standing bypass permission.

The connected GitHub development integration can edit and merge PRs, but
its available actions may not include ruleset administration. A ruleset
administration outage may therefore require the owner's GitHub Settings
access; this cannot be guaranteed recoverable solely by a code PR.
