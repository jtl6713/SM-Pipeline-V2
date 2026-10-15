# Phase 3 — Pipeline reads from Supabase

## Behavior

- Default: `STUDIO_READ_SOURCE=airtable` (unchanged production behavior).
- When `STUDIO_READ_SOURCE=supabase` **and** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set on the Worker:
  - `GET /api/outputs` (+ `mode=latest`)
  - `GET /api/outputs/schedule-grid`
  read from Supabase (Airtable fallback on error).
- Heavy cron syncs active profiles into Supabase (`studioSyncSupabasePipelineReads`).
- Manual: `POST /api/ops/supabase/sync` (tenant_admin).

## Enable in production

1. Cloudflare Worker `chicagoshining-studio-api` → Settings → Variables:
   - `SUPABASE_URL=https://vkwvscgisqsbuwagdvtb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<secret>`
   - `STUDIO_READ_SOURCE=supabase`
2. Hard-refresh Studio; `/api/health` should show `studio_read_source: "supabase"`.
3. Call `POST /api/ops/supabase/sync` once so LA/NYC/Miami join Chicago in Supabase.
4. Confirm Pipeline `read_source` in responses (optional).

Writes (approve, schedule, produce, publish) stay on Airtable.
