# Source-Control Baseline

Baseline migration started: 2026-08-15.

## Immediate objective

Use GitHub as the editable source authority for the two Cloudflare components that are routinely changed during Studio hardening:

- Cloudflare Worker: `chicagoshining-studio-api`
- Cloudflare Pages: `chicagoshining-studio`

Local rendering/services and Make blueprint source-control migration are not prerequisites for this Cloudflare deployment capability.

## Authority model

- **GitHub:** editable Worker and Pages source plus controlled deployment workflows.
- **Cloudflare:** production runtime/deployment target.
- **Google Drive:** authoritative durable media / DAM.
- **Cloudflare R2:** transient processing, preview, delivery or cache only; not a parallel durable media authority.

## Verified live Cloudflare baseline

### Studio API Worker

The Worker was read directly from Cloudflare using the Workers Scripts Content API on 2026-08-15 and committed to:

`apps/studio-api/worker.js`

Captured live health version:

`0.10.7-p3-direct-diagnostic`

This direct Cloudflare capture supersedes older recovered File Library copies such as v0.10.4, v0.10.3 and v0.9.x for source-control purposes.

### Studio Pages

The currently served Pages deployment was read directly from:

`https://chicagoshining-studio.pages.dev`

and committed under:

`apps/studio-web/`

Captured live UI build:

`0.6.19`

Captured production assets include:

- `index.html`
- `assets/app-item4-0619.js`
- `assets/config.js`
- `assets/styles-phase7-0617.css`

The older v0.6.17 FULL_DEPLOYMENT package remains useful as a rollback/reference artifact, but it is not the current live Pages baseline.

## GitHub → Cloudflare control path

GitHub repository secrets are configured for Cloudflare API authentication. A read-only connection test passed for both the Worker and Pages project.

Source validation workflow:

`.github/workflows/cloudflare-source-validation.yml`

Worker production deployment workflow:

`.github/workflows/deploy-cloudflare-worker-production.yml`

Pages production deployment workflow:

`.github/workflows/deploy-cloudflare-pages-production.yml`

Production deployments are intentionally separated from normal source edits. Editing Worker or Pages source runs validation only. Production deployment requires an intentional update to the matching trigger file under `deploy/` (or an explicit workflow dispatch).

### Worker safety model

Worker deployment uses Cloudflare's Workers Scripts Content API so code can be replaced **without changing existing Worker bindings or configuration**. The workflow saves the pre-deploy Worker source as a temporary GitHub Actions artifact and verifies that Cloudflare's post-deploy source exactly matches GitHub.

### Pages safety model

Pages deployment reads the existing project's production branch from Cloudflare, stages only `index.html` and `assets/`, and deploys those files to the existing `chicagoshining-studio` Direct Upload project with Wrangler. Repository documentation and deployment-control files are never included in the Pages upload directory.

## Operational rule

For future Cloudflare changes:

1. Modify the source in `apps/studio-api/worker.js` and/or `apps/studio-web/`.
2. Confirm GitHub source validation passes.
3. Intentionally update the appropriate `deploy/cloudflare-*-production.txt` trigger.
4. Inspect the deployment run and verify Cloudflare accepted the exact intended source.

This is the production source-control path for routine Studio Worker/Pages modifications.
