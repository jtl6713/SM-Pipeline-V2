# ChatGPT: Ship Studio Pages + footer version (do this every time)

Repo: `jtl6713/SM-Pipeline-V2`  
Live site: `https://studio.chicagoshining.com`  
Pages project: `chicagoshining-studio`  
Trigger file (Pages only): `deploy/cloudflare-pages-production.txt`  
Workflow: **Deploy Studio Pages Production** (pushes to `main` that touch that file)

Joseph’s rule: **never** tell him to hard-refresh for a version until you have proven it is live on the custom domain.

---

## What the footer actually shows

| Source | What it must contain | What Joseph sees |
|---|---|---|
| `apps/studio-web/index.html` | `<span id="uiBuildLabel">UI build X.Y.Z</span>` | Overwritten at runtime |
| Same HTML, every `/assets/*.js` and `/assets/*.css` | `?v=X.Y.Z-<slug>` cache buster | Network tab |
| `apps/studio-web/assets/app-item4-1008.js` | `const BUILD_ID = "item4-X.Y.Z-<slug>";` | Footer becomes **`UI X.Y.Z`** (no “build”) |

**Authoritative UI version = the number inside `BUILD_ID`.**  
Bumping only `index.html` leaves the footer on the old JS. That has bitten production before.

Worker footer is separate: `apps/studio-api/worker.js` → `version: "0.10.N-<slug>"` plus `deploy/cloudflare-worker-production.txt`.

---

## Mandatory checklist (Pages UI change)

Do **all** of these in one commit (or one PR that merges as one unit). Missing any step = “deployed” but footer stuck.

### 1. Pick one new pin
Example: `0.6.601-my-fix` (semver patch + short kebab slug).

### 2. Bump every UI pin together
- `apps/studio-web/assets/app-item4-1008.js`  
  `BUILD_ID = "item4-0.6.601-my-fix"`
- `apps/studio-web/index.html`  
  - `UI build 0.6.601`  
  - **every** `?v=` on stylesheets and scripts → `0.6.601-my-fix`
- Update hermetic tests that hardcode the previous pin (search the repo for the old `0.6.NNN` / old slug).

### 3. Fire the Pages deploy (or it never ships)
Append a **new line** to `deploy/cloudflare-pages-production.txt`, e.g.

```text
2026-10-11: <one-line reason> (UI 0.6.601).
```

A merge to `main` **without** this file change does **not** run Pages production.

### 4. If you also changed the Worker
- Bump `version:` in `apps/studio-api/worker.js`
- Append a line to `deploy/cloudflare-worker-production.txt`
- Expect footer **Worker 0.10.N** only after **Deploy Studio API Worker Production** succeeds

Theme-only / HTML-only work does **not** move the Worker version.

### 5. Merge to `main` (not draft)
- PR must be **ready for review** (not draft) before merge.
- Squash/merge to `main`.
- Confirm Actions started:
  - `Deploy Studio Pages Production`
  - (if Worker touched) `Deploy Studio API Worker Production`

### 6. Wait for verify PASS — then, and only then, ask for refresh
In the Pages workflow logs, require:

- `pages_content_verify=PASS`
- `custom_domain_content_verify=PASS`
- Expected UI matches your pin (`UI build 0.6.601` in HTML, `item4-0.6.601-my-fix` in live JS)

**Do not** tell Joseph “hard-refresh for 0.6.601” while the PR is draft, unmerged, or deploy still running.

After custom-domain verify PASS, tell him to look for footer **`UI 0.6.601`** (and Worker if you shipped it).

---

## Known production gotcha (why ChatGPT “deploys” and the browser lies)

Zone **Cache Purge** on `CLOUDFLARE_API_TOKEN` currently fails (`Authentication error`). Deploys still succeed; edge can serve stale JS for tens of seconds (sometimes longer).

Mitigations already in the pipeline:

1. Change the `?v=` query on every asset every ship (required).
2. If the edge is sticky after a failed purge, **rename** the physical app file (e.g. `app-item4-1008.js` → new name) and update `index.html` — that is the hard bust when purge auth is broken.
3. Retry reading `https://studio.chicagoshining.com/assets/app-item4-….js?v=…` until `BUILD_ID` matches before declaring live.

Optional diagnostic workflow: `diagnose-studio-pages-domain.yml` / `deploy/diagnose-studio-pages-domain.txt`.

---

## Commands ChatGPT should run

```bash
# After committing UI + trigger file on a feature branch:
git push -u origin HEAD

# After CI green: mark ready, merge to main
gh pr ready <n>          # if it was draft
gh pr merge <n> --squash --delete-branch=false

# Watch the only deploys that matter
gh run list --workflow 'Deploy Studio Pages Production' --branch main --limit 3
gh run watch <pages-run-id> --exit-status

# Confirm verify lines
gh run view <pages-run-id> --log | rg 'pages_content_verify|custom_domain_content_verify|Expected UI|purge|BUILD_ID|0\.6\.'
```

If `custom_domain_content_verify=PASS` is missing, **stop**. Do not ask Joseph to refresh.

---

## Failure patterns to avoid

1. **HTML label bump without `BUILD_ID` bump** → footer stays old.
2. **Code on `main` without appending `cloudflare-pages-production.txt`** → no Pages deploy.
3. **“Hard-refresh for X” while PR is draft / deploy in progress** → Joseph loses trust; you were wrong.
4. **Expecting Worker version to move on a Pages-only theme PR** → it will not.
5. **Assuming GitHub “success” on unrelated patch workflows** → ignore those; only Pages/Worker production workflows count for the footer.

---

## Minimal “done” statement (copy this shape)

> Merged #<n> to main. Deploy Studio Pages Production run \<id\> finished success. Logs show `custom_domain_content_verify=PASS` for UI build **0.6.601** / BUILD_ID **item4-0.6.601-my-fix**. Hard-refresh Studio; footer should read **UI 0.6.601**.

If Worker also shipped: include the Worker run id and **Worker 0.10.N**.
