# Phase 3 — Pipeline reads from Supabase

## Behavior

- Default: `STUDIO_READ_SOURCE=airtable` (unchanged production behavior).
- When `STUDIO_READ_SOURCE=supabase` **and** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set on the Worker:
  - `GET /api/outputs` (+ `mode=latest`, `mode=review`)
  - `GET /api/outputs/schedule-grid`
  read from Supabase (Airtable fallback on error).
- Heavy cron (`:00` / `:30` UTC) syncs active profiles into Supabase (`studioSyncSupabasePipelineReads`).
  Sync merges **newest-N** + **open Pipeline pack** so unfinished rows do not age out of Supabase.
- Manual: `POST /api/ops/supabase/sync` (tenant_admin).
- Status: `GET /api/ops/supabase/sync` returns last sync stamp + which routes read Supabase.
- `/api/health` exposes `studio_read_source`, `studio_supabase_configured`, `studio_supabase_read_routes`, and last sync fields.

## What currently relies on Supabase

| Surface | Uses Supabase? | Notes |
|---|---|---|
| Pipeline list (`/api/outputs`) | **Yes** (when flag on) | Falls back to Airtable on error / missing profile |
| Pipeline latest (`mode=latest`) | **Yes** | Same |
| Pipeline review lean (`mode=review`) | **Yes** | Same |
| Schedule grid | **Yes** | Same |
| Cron Airtable→Supabase upsert | **Yes** (when secrets set) | Independent of `STUDIO_READ_SOURCE` |
| Manual / status sync ops | **Yes** | tenant_admin |
| Schedule Save write-through | **Yes** (upsert after Airtable PATCH) | Keeps calendar drag-drop from snapping back |
| Approve / Approve All write-through | **Yes** (upsert after Airtable PATCH) | Keeps Pipeline from showing stale Ready for Review |
| Factory desk | **No** (Airtable live) | Why Factory can look “approved” while Pipeline lags |
| All Profiles overview | No | Airtable (+ R2 snapshot) |
| Ideas / Production Requests | No | Airtable |
| Approve / schedule / publish / produce | **Writes stay Airtable**; schedule also upserts Supabase | Airtable write SoR |
| Asset / music library | No | Drive + Airtable |
| Make / Remotion / platform publish | No | unchanged |

Project: isolated `sm-pipeline-v2-dev` (`vkwvscgisqsbuwagdvtb`) — **not** the tasks-api Supabase DB.

## Enable in production

1. Cloudflare Worker `chicagoshining-studio-api` → Settings → Variables:
   - `SUPABASE_URL=https://vkwvscgisqsbuwagdvtb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<secret>`
   - `STUDIO_READ_SOURCE=supabase`
2. Hard-refresh Studio; `/api/health` should show `studio_read_source: "supabase"`.
3. Call `POST /api/ops/supabase/sync` once so LA/NYC/Miami join Chicago in Supabase.
4. Confirm Pipeline responses include `read_source: "supabase"` (optional).
5. Check `GET /api/ops/supabase/sync` after cron or a manual sync for per-profile counts.

## Stabilize checklist

- [x] Feature-flagged Pipeline reads with Airtable fallback
- [x] Sync allowlisted through Phase 2A gate
- [x] Binding contract allows Supabase vars
- [x] Sync includes open Pipeline pack (not only newest-N)
- [x] Last sync stamp on R2 + health / GET status
- [ ] Operator: use Pipeline for a few days; flip `STUDIO_READ_SOURCE=airtable` if drift appears
- [ ] Ops: move project to Supabase Pro before treating this as hard production dependency

Writes (approve, schedule, produce, publish) stay on Airtable.
