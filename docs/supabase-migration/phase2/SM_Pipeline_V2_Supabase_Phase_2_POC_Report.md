# SM Pipeline V2 — Supabase Phase 2 POC Report

**Date:** 2026-10-15  
**Project:** `sm-pipeline-v2-dev` (`vkwvscgisqsbuwagdvtb`) — isolated Free tier, East US  
**Slice:** Chicago profile `recT2rbKX3MF7cVFU`  
**Constraint:** Read-only Airtable export; no Studio/Worker production changes; not the tasks-api Supabase DB.

---

## Verdict

**POC passed.** Chicago Content Items and Platform Outputs imported 1:1, joins use indexes, and Postgres query execution is sub-millisecond for Pipeline-shaped reads. End-to-end HTTP (PostgREST) for the same payloads is ~40–110 ms from this agent host — dominated by network, not SQL.

This unblocks **Phase 3 design**: feature-flag Pipeline **read** routes against Supabase while Airtable remains write SoR.

---

## Reconciliation

| Entity | Airtable (Chicago filter) | Supabase after import | Match |
|---|---:|---:|---|
| Content Profiles (all 4 stubbed) | 4 | 4 | Yes |
| Content Items | 166 | 166 | Yes |
| Platform Outputs | 916 | 916 | Yes |
| Outputs missing `content_item_id` | — | **0** | Yes |

Chicago `Output_Status` in Supabase:

| Status | Count |
|---|---:|
| Published | 485 |
| Approved for Publishing | 409 |
| Ready for Review | 22 |

Importer: `scripts/supabase-poc/import-chicago.mjs`  
Export staging: `/tmp/supabase-poc-export/` (local only; not committed).

---

## Benchmarks

### A. Direct SQL (`EXPLAIN ANALYZE` via pooler)

Source: `docs/supabase-migration/phase2/benchmarks/explain-analyze.txt`

| Query | Execution time | Notes |
|---|---:|---|
| Pipeline join (outputs + content labels), limit 250 | **0.70 ms** | Uses `platform_outputs_profile_output_number_idx` + PK join |
| Awaiting approval | **0.52 ms** | 18 rows after filters |
| Occupancy window (12h lookback / 28d horizon), limit 800 | **0.39 ms** | Uses `platform_outputs_scheduled_range_idx` (429 rows) |

### B. PostgREST HTTP (service_role), 3 runs

Source: `docs/supabase-migration/phase2/benchmarks/rest-run*.jsonl`

| Label | Run1 ms | Run2 ms | Run3 ms |
|---|---:|---:|---:|
| `pipeline_outputs_250` | 75 | 107 | 78 |
| `pipeline_join_style` (embed content_items) | 56 | 49 | 47 |
| `awaiting_approval` | 47 | 66 | 75 |
| `content_items_100` | 36 | 40 | 40 |
| `published_100` | 80 | 44 | 79 |

**Interpretation:** SQL proves the bottleneck class Airtable cannot match (multi-scan open-pack + sibling fan-out). HTTP times are acceptable for Pipeline warm builders; production Worker should still keep a short coalesce/R2 snapshot for UX, but the Airtable 250 ms slot + 429 fail-fast path can leave Pipeline reads.

### C. Airtable comparison (not re-timed this session)

Phase 1 documented Pipeline warm builds as multiple Airtable list scans (newest + open≤1000 + siblings + labels), serialized behind `AIRTABLE_MIN_GAP_MS = 250`. A single Postgres join replaces that fan-out. Exact Airtable wall-clock for this slice was not re-measured in Phase 2; the structural comparison is the primary evidence.

---

## Ops notes discovered during POC

1. **Correct project URL:** `https://vkwvscgisqsbuwagdvtb.supabase.co` (screenshot OCR sometimes added an extra `v`).
2. **Schema:** Applied via SQL Editor (`001_core_schema.sql`), **Run without RLS** for POC.
3. **Grants required:** With “Automatically expose new tables” off, PostgREST returned `42501 permission denied` until:
   ```sql
   grant all on all tables in schema public to service_role;
   ```
   Documented in `scripts/supabase-poc/grant-service-role.sql`.
4. **Connections:** Direct `db.*.supabase.co:5432` was IPv6-unreachable from this agent; **pooler** `aws-0-us-east-1.pooler.supabase.com:6543` worked.
5. **Secrets:** Never committed. Local only in `/tmp/sm-pipeline-v2-dev.supabase.env`.

---

## Phase 3 recommendation (next engineering)

1. Add Worker feature flag `STUDIO_READ_SOURCE=airtable|supabase` for:
   - `GET /api/outputs` (+ `mode=latest`)
   - `GET /api/outputs/schedule-grid`
2. Keep Airtable as write SoR; sync Chicago→all profiles into Supabase on a short interval **or** write-through upsert after successful Airtable PATCH (prefer interval first to avoid dual-write bugs).
3. Map `OUTPUT_LIST_FIELDS` projection onto Supabase `select=` columns (already lean in import).
4. Do **not** cut over Factory multi-list or produce/cron writes yet.
5. Move to Supabase **Pro** before any production read traffic (backups / support).

---

## Pass / fail checklist

| Criterion | Status |
|---|---|
| Isolated project (not tasks-api) | Pass |
| Schema applied | Pass |
| Chicago CI + PO counts match | Pass |
| Zero orphan outputs | Pass |
| Indexed Pipeline join &lt; 5 ms SQL | Pass (0.7 ms) |
| PostgREST Pipeline-shaped read works | Pass |
| No production Studio deploy | Pass |
