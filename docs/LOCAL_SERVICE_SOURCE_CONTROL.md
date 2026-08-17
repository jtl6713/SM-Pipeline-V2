# Local Service Source-Control Review — 2026-08-17

## Repository structure review

The existing top level is broadly sound:

- `apps/` — cloud/application components (Studio API, Studio web, R2 Worker, repair bridge)
- `services/` — local Windows-hosted daemons and renderer source
- `docs/` — architecture/runbooks/source-control records
- `scripts/` — reusable operational utilities
- `repair/` — 21-item hardening ledger and durable repair evidence
- `deploy/` — intentional deployment trigger files
- `.github/workflows/` — active CI/deployment workflows

Local services should **not** be mixed into `apps/`; they have different runtime/dependency/deployment characteristics.

## Phase 2 service source baseline

The following live sources are approved for Git source control once seeded from the authoritative Windows host:

### Frame Extractor

Git path: `services/frame-extractor/`

Source files intentionally tracked:

- `app.py`
- `requirements.txt`
- `start-frame-extractor.bat`
- service README

Intentionally excluded:

- `.venv/`
- `public/frames/`
- `work/`
- 41 historical frame-job directories / 205 generated JPEGs from the supplied live-folder archive
- legacy duplicate `app1.py`
- obsolete Quick Tunnel launcher (production uses the permanent frame-extractor route)

### Remotion Renderer

Git path: `services/remotion-renderer/`

The source baseline is the authoritative `Services\Remotion_Renderer` snapshot plus the accepted Item 3 native-overlap patch. It includes the exact `@remotion/transitions` 4.0.484 dependency and service version `2026-08-17-native-overlap-transitions`.

Generated output, source-capture manifests, old backup copies, render assets, props, logs and media are intentionally excluded.

## Services still requiring authoritative capture

Do not infer authority from old handoff ZIPs or File Library snapshots. Before source-control onboarding, capture the live Windows source for:

- Watermark service (3011)
- Voiceover Normalizer (3012)
- YouTube Uploader (3340; exclude `.env`)

## Workflow cleanup finding

`.github/workflows/` currently contains many repair-specific diagnostic/probe/trigger workflows accumulated during production hardening. Some legacy workflows still respond to ordinary pushes and can create unrelated failing Actions on harmless repository changes.

Recommended cleanup is **inventory-first**, not mass deletion:

1. Classify workflows as production deploy, permanent validation, reusable repair utility, or one-time historical diagnostic.
2. Keep production deploy/validation workflows active.
3. Convert retained repair utilities to `workflow_dispatch` where automatic push execution is not required.
4. Move historical one-time workflow definitions outside `.github/workflows/` into an archive/reference location before deleting them from the active workflow directory.
5. Consolidate deployment trigger files and document the remaining trigger contract.
6. Prove the normal push baseline has no unrelated failing workflows.

## Future local deployment design

The desired GitHub -> local update path should be guarded and reversible:

- exact commit SHA input
- service allowlist
- source-hash precondition
- automatic source backup
- no secret/runtime-data overwrite
- dependency-manifest-aware install
- one-service restart only
- local + permanent route health verification
- rollback on failure
- deployed-SHA marker/audit log

Preferred future transport: a Windows self-hosted GitHub Actions runner protected by manual dispatch/environment approval. A scheduled local pull agent is a fallback, but should not be implemented until the complete service source inventory and secret boundaries are verified.
