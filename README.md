# SM Pipeline V2

Private source-control repository for the ChicagoShining social-media production pipeline.

## Source-control authority

**GitHub is the authoritative source for application code, infrastructure scripts, automation blueprints, and deployment configuration.**

Cloudflare is a deployment/runtime/processing layer. Google Drive remains the authoritative durable media store. Cloudflare R2 may be used for transient staging, previews, delivery, or caching, but not as a parallel permanent digital-asset repository.

## Repository layout

```text
apps/
  studio-web/            Cloudflare Pages Studio/Pipeline Admin frontend
  studio-api/            Cloudflare Worker API
  studio-variant-service/ Cloudflare image-variant Worker
  tiktok-auth/           TikTok auth/draft Worker
services/
  remotion-renderer/
  frame-extractor/
  watermark/
  voiceover-normalizer/
  youtube-uploader/
make/
  blueprints/            Verified Make scenario exports
scripts/
  production-services/   Start / stop / verify and maintenance scripts
docs/
  architecture/
  handoffs/
```

## Production rules

- Do not commit secrets, PATs, OAuth credentials, API tokens, refresh tokens, or populated `.env` files.
- Do not commit `node_modules`, render outputs, temporary media, R2 cache contents, or generated working folders.
- Preserve Google Drive as the durable media authority.
- Preserve known Make webhook IDs, connections, filters, and layout when revising blueprints.
- Do not use `concat()` in Make formulas/mappings.
- Keep one clearly current production blueprint after a replacement is validated; older verified exports may be retained as rollback artifacts.
- Production Cloudflare deployment should not be enabled from GitHub until the imported baseline has been verified against the live deployment.

## Baseline migration status

Repository bootstrap started 2026-08-15. Existing production components are being imported and verified before GitHub-driven Cloudflare deployment is enabled.
