# Phase 4 — Factory / Overview / Content list reads from Supabase

## Behavior

Same flag as Phase 3: `STUDIO_READ_SOURCE=supabase` **and** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

Additional read routes (Airtable fallback on error / empty pack):

| Surface | Route | Notes |
|---|---|---|
| Content list | `GET /api/content` | Content items + open/recent outputs |
| All Profiles overview | `GET /api/profiles/overview` | Outputs from Supabase (paged past PostgREST max-rows); Ideas column still from Airtable until deep idea sync |
| Factory desk | `GET /api/factory/desk` | Via operations-queue pack + photo-wait ideas |
| Ops queue | `GET /api/operations/queue` | Same output/request pack as Factory |

Writes stay on Airtable (approve / schedule / publish / produce / Factory mutations).

## Sync expansions

Heavy cron + `POST /api/ops/supabase/sync` now also upsert:

- **Content** list fields into `content_items.extras`
- **Output** lean `OUTPUT_LIST_FIELDS` extras into `platform_outputs.error_messages` (jsonb projection bag; no schema migrate)
- **Ideas** into `idea_candidates` (+ `payload`)
- **Open Production Requests** once per sync into `production_requests`

## Ops notes (Phase 3 still open)

- Keep `STUDIO_READ_SOURCE=supabase` and use Pipeline for a few days; flip to `airtable` if list/schedule look wrong.
- Consider moving the Supabase project to **Pro** before treating this as a hard dependency.
- Phase 5 write-through for the Worker and the pipeline runner is in `docs/supabase-migration/phase5/`. `STUDIO_WRITE_SOURCE` stays `airtable`. The legacy-export switch stays off while the runner still reads Airtable.

## Health / status

- `/api/health` → `studio_supabase_phase4_reads_v1`, `studio_supabase_read_routes`, `studio_supabase_phase4_read_routes`
- `GET /api/ops/supabase/sync` → `read_routes` includes Phase 4 paths; `phase4_read_routes` listed explicitly

## Explicitly out of scope here

- `resolveAuthorization` → Supabase user/membership tables (still Airtable)
- Write cutover (Phase 5+)
- Production Requests / cron / media metadata as write SoR
