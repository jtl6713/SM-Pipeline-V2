# SM Pipeline V2 — Airtable to Supabase Phase 1 Assessment

**Date:** 2026-10-15  
**Base:** `appe33zkZn35yirTL` (ChicagoShining AI Content Creator)  
**Repo:** `jtl6713/SM-Pipeline-V2` @ `main`  
**Scope:** Read-only investigation. No production code, Airtable, Cloudflare, or existing Supabase admin DB changes.

---

## 1. Executive summary

**Recommendation: Yes — migrate, but only in a read-first phased cutover, starting with Pipeline list reads.**

Studio’s operational database is Airtable. The Worker already spends significant engineering on rate-limit defense (`AIRTABLE_MIN_GAP_MS = 250`, 429 fail-fast, R2/memory pipeline snapshots, field-projection lean lists, low-burn cron). Those mitigations prove the bottleneck is real; they also show that carrying the same multi-scan access patterns into Postgres would waste the migration.

**What slows Studio today (verified from code + live schema counts):**

1. Airtable’s per-base rate limits + Worker slot serialization collide with UI polling and cron heals.
2. Pipeline warm builds perform **multiple Airtable list scans** (newest page + open-pack up to 1000 + sibling fan-out + content label batches + render-queue candidates), then cache the result.
3. Auth resolution lists entire `Studio Users` and `Studio Memberships` tables and filters in memory on every authorized request path that calls `resolveAuthorization`.
4. Large multiline JSON fields (`Selected_Assets_JSON`, Remotion props/manifests, production job JSON) blow Airtable long-text limits and inflate payloads when not projected away.
5. Cron historically burned credits with oversized list scans; light/heavy cadence was required after hung-cancel storms.

**What Postgres would fix first:** indexed joins for Pipeline (outputs + content labels in one query), true uniqueness on Drive file IDs / output numbers, and Worker access via Supabase HTTP (PostgREST) or pooled SQL without Airtable’s 5 req/s class limits.

**What Postgres alone would not fix:** frontend render cost of large tables, Remotion/Drive latency, or dual-write complexity if write cutover is rushed.

**Proof of concept status:** **Pending / blocked.** No isolated Supabase project credentials are available in this environment. Schema + benchmark SQL are ready under `docs/supabase-migration/phase1/`. The existing tasks-api Supabase project must not host Studio data.

---

## 2. Performance findings (Deliverable A)

Legend: **Code** = verified in repository. **Measured** = live Airtable aggregate via MCP. **Assumption** = not timed in this run.

### 2.1 Studio screens → API → Airtable

| Screen | Primary endpoints | Request pattern | Airtable tables | Notes |
|---|---|---|---|---|
| **Pipeline** | `GET /api/outputs?mode=latest`, `GET /api/outputs?limit=250`, `GET /api/outputs/schedule-grid` | **Concurrent** (latest + full + schedule) | Platform Outputs, Content Items | Full path returns R2/memory snapshot immediately; live rebuild is background. Latest path hits Airtable (~60 rows) + content label lookup. |
| **Factory** | `GET /api/factory/desk` | One Worker call; internally concurrent queue + ideas + R2 controls | Platform Outputs, Idea Candidates (+ ops queue helpers) | Desk partitions Worker ops queue rows; approve/send-back mutate Platform Outputs. |
| **Production** | `GET /api/production-requests`, `GET /api/production-requests/:id`, assets/plan/variants/promote | List + frequent per-record follows | Production Requests, Idea Candidates, Media Assets, Content Items, Platform Outputs, Transfer Queue | Highest write surface; JSON masters/plans/variants. |
| **Scheduling** | Pipeline schedule grid + `/api/operations/outputs/:id/schedule` | Grid read concurrent with Pipeline; writes per output | Platform Outputs | Grid filters by `Scheduled_Post_Date` range then batches content labels (40 IDs/OR). |
| **Content Details** | `/api/content`, `/api/outputs/:id/creative`, preview | Content list coalesced; creative fetches full PO | Content Items, Platform Outputs | Creative routes intentionally load full records (large JSON). |
| **Platforms / Frames** | Production request `plan` / `variants` / assets | Sequential status polls while preparing | Production Requests, Media Assets, Transfer Queue | Variant queue is `Studio Media Transfer Queue` (6,120 rows). |

Evidence (frontend concurrency):

```21466:21468:apps/studio-web/assets/app-item4-1008.js
      const latestPromise = settled(api("/api/outputs?mode=latest", { timeoutMs: 14000, retries: 1 }));
      const fullPromise = settled(api("/api/outputs?limit=250", { timeoutMs: 8000, retries: 1 }));
      const schedulePromise = settled(api(schedulePath, { timeoutMs: 15000, retries: 1 }));
```

Evidence (Pipeline warm build multi-scan):

```26141:26160:apps/studio-api/worker.js
    const [newest, openPack] = await Promise.all([
      listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        ...listOpts,
        limit,
        filterFormula: contentProfileFilterFormula(profile),
      }),
      loadOpenPipelineOutputPack(env, profile),
    ]);
    // ...
    pipelineContentLabelsById(env, profile, studioPipelineContentIdsFromOutputs(records)),
```

`loadOpenPipelineOutputPack` lists up to `STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT = 1000` open outputs, then another list for siblings by content IDs (`apps/studio-api/worker.js`).

### 2.2 Top five bottlenecks

| # | Bottleneck | Evidence | Class |
|---|---|---|---|
| 1 | **Airtable rate limit + 250ms slot queue** | `airtableRequestSlot`, fail-fast 429 after 8s cooldown wait; cron skips when cooling | Code + ops history in comments (603 hung-cancels / 3h on 2026-10-11) |
| 2 | **Pipeline warm path = many list scans** | newest + open(≤1000) + siblings + labels + jobs + render-queue candidates | Code |
| 3 | **Auth lists full user/membership tables** | `resolveAuthorization` → `listRecords(Studio Users)` + `listRecords(Studio Memberships)` then `.find`/`.filter` | Code |
| 4 | **Large JSON long-text fields** | `Selected_Assets_JSON` can exceed Airtable 100k char limit (desk incident class `produce_stamp_422`); Pipeline deliberately omits it from `OUTPUT_LIST_FIELDS` | Code + prior production incidents |
| 5 | **Background heal/cron competing with UI** | Low-burn cron redesign; insights scan capped after “top Airtable credit burner” comment | Code |

### 2.3 Caching already present (important for migration design)

- In-memory coalesce (`studioReadCoalesce`) with TTLs (~7–60s depending on key).
- R2 snapshots for Pipeline mapped lists (`studio/state/pipeline-list-*.json`) — UI paints snapshot first.
- Field projection on Pipeline lists (`OUTPUT_LIST_FIELDS`) to avoid multi-KB JSON per row.

**Implication:** end-to-end “Pipeline feels slow” is often **snapshot miss / refresh / 429**, not pure JSON transform. Postgres should replace the *warm builder*, not only the cache layer. Keeping an HTTP response cache remains useful under Cloudflare Workers.

### 2.4 Timings

Runtime Worker/Airtable latency was **not measured in this session** (no production Worker log pull required for Phase 1 completeness when blocked). Do not invent ms numbers. Phase 2 POC must record:

- Airtable: wall time for `listRecords` newest-250 + open-pack for one profile.
- Postgres: `EXPLAIN ANALYZE` for queries in `002_benchmark_queries.sql`.
- End-to-end: Worker handler time with Supabase HTTP vs Airtable for the same payload shape.

---

## 3. Airtable dependency inventory (Deliverable B)

### 3.1 Scale of integration

| Location | Approx. `airtableFetch` / `listRecords` call sites |
|---|---|
| `apps/studio-api/worker.js` | **706** |
| `apps/studio-api/profile-onboarding.mjs` | 10 |
| `apps/studio-api/engagement-service.mjs` | 5 |

Studio Web talks to Airtable **only through the Worker** (no direct PAT in browser).

### 3.2 Active tables (32 in base)

| Table | ID | Records (Measured 2026-10-15) | Primary consumers | Ops | Migration risk |
|---|---|---:|---|---|---|
| Platform Outputs | `tblrlPeboBthkplH0` | **3,145** | Pipeline, Factory, publish, schedule, insights, heals | R/W | **High** |
| Content Items | `tblwzN9AXWvmKVKPs` | **553** | Pipeline labels, produce, content list | R/W | **High** |
| Media Assets | `tblSITCujCsJTNcDe` | **8,147** | Library, music, variants, Drive IDs | R/W | **High** |
| Production Request Outputs | `tblSC7kFiweeE9C8i` | **3,464** | Item4 plan/bridge | R/W | High |
| Studio Media Transfer Queue | `tblBZLXPd1p2NRWRK` | **6,120** | Variant crops | R/W | High |
| Production Requests | `tbl75nxNi6PMUjBQE` | **706** | Production, autonomous, produce jobs | R/W | **High** |
| Idea Candidates | `tblTQapddqD47GOIG` | **555** | Ideas, Factory, promote | R/W | Medium |
| Carousel Slides | `tblcnQDBvUngpjDED` | **1,042** | Carousel publish | R/W | Medium |
| Make Admin Queue | `tbltuSt9UibYzxpah` | **2,863** | Legacy Make bridge still referenced | R/W | Medium (legacy) |
| Content Profiles | `tblNYg2QB0BmmVACy` | **4** | Every scoped read | R | Low |
| Studio Users / Memberships / Orgs / Brands | various | small | AuthZ | R/(W onboarding) | Medium |
| Engagement Settings/Targets/Actions | various | small | Engagement | R/W | Low |
| Asset Requests / Shots | various | 0 / n/a | Legacy planning | R | Low |
| AI Personas, Prompts, Markets, Verticals, Voices, Insights*, Pipeline Settings, Mappings | various | smaller | Config / insights | R/W | Low–Medium |

### 3.3 Critical integration map (representative)

| Component | Function / route | Table(s) | Operation | Frequency | Complexity | Risk |
|---|---|---|---|---|---|---|
| Worker | `listOutputs` / `buildPipelineOutputsPayload` | Platform Outputs, Content Items, Production Requests | Read (multi-scan) | UI poll + cron warm | High | High |
| Worker | `listOutputScheduleGrid` | Platform Outputs, Content Items | Read | Pipeline open | Medium | Medium |
| Worker | `listContent` | Content Items, Platform Outputs | Read | Content screens | Medium | Medium |
| Worker | `listProductionRequests` | Production Requests, Ideas | Read | Production home | Medium | High |
| Worker | `resolveAuthorization` | Studio Users, Memberships, Orgs, Brands | Read full lists | Every authed API | Medium | Medium |
| Worker | `getFactoryDesk` | Ops queue → Outputs, Ideas | Read | Factory | Medium | High |
| Worker | Approve / publish / schedule routes | Platform Outputs (+ parent Content) | Update | Operator + cron | High | High |
| Worker | `scheduled` cron heals | Outputs, Production Requests | Read/Update | Every 5 min / heavy half-hour | High | High |
| Worker | Autonomous produce | Ideas, PRs, Outputs, Media | R/W | Top of hour heavy | High | High |
| Worker | Asset library / music | Media Assets | R/W | Operator | Medium | Medium |
| Worker | Item4 variants | Transfer Queue, Media, PR | R/W | During prepare | High | High |
| `engagement-service.mjs` | Engagement CRUD | Engagement_* | R/W | Engagement UI | Low | Low |
| `profile-onboarding.mjs` | New profile | Profiles, Brands, Markets | R/W | Rare | Medium | Medium |
| `tasks-api` | Agent events | **Supabase `events`** (separate) | R/W | Desk | n/a | Do not reuse |

### 3.4 Full-table / poorly selective patterns to replace with indexes

| Pattern | Location | Postgres replacement |
|---|---|---|
| List all Studio Users then find by email | `resolveAuthorization` | `unique(lower(email))` lookup |
| List memberships then filter by user | same | `where user_id = $1` |
| Open-pack scan ≤1000 + sibling re-list | `loadOpenPipelineOutputPack` | Partial index on unfinished outputs + `WHERE content_item_id IN (...)` join |
| Content labels via batched `OR(RECORD_ID()=...)` | `pipelineContentLabelsById` / `scheduleGridContentById` | `JOIN content_items` |
| Music/library formula scans | `listMusic`, asset library | Indexes on `asset_role`, `media_class`, Drive ID |

---

## 4. Database assessment (Deliverable C)

### 4.1 Logical relationships (current)

```
Organizations ─┬─ Brands ─┬─ Content Profiles ─┬─ Content Items ── Platform Outputs
               │          │                    ├─ Idea Candidates
               │          │                    └─ Media Assets (library scope)
               ├─ Studio Memberships ── Studio Users
               └─ Production Requests ─┬─ Production Request Outputs ── Platform Outputs
                                       ├─ Promoted Content Item
                                       └─ Studio Media Transfer Queue ── Media Assets
```

Airtable encodes FKs as **linked record arrays** (often single-element). Application code uses `studioFirstLinkedId`. Postgres should use real FK columns (`prefersSingleRecordLink` is already true for `Platform Outputs.Content_Item` → Content Items).

### 4.2 Status distributions (Measured)

**Platform Outputs `Output_Status`:**

| Status | Count |
|---|---:|
| Published | 1,652 |
| Approved for Publishing | 1,439 |
| Ready for Review | 44 |
| Changes Requested | 6 |
| In Production | 3 |
| Cancelled | 1 |
| **Total** | **3,145** |

**Production Requests `Request_Status`:**

| Status | Count |
|---|---:|
| Promoted | 542 |
| Draft | 115 |
| Cancelled | 36 |
| Ready | 13 |
| **Total** | **706** |

### 4.3 Data-quality findings

| Finding | Evidence | Postgres control |
|---|---|---|
| Historical duplicate Media Assets on same Drive file | Prior audit: 642 video rows → 16 unique Drive files (cleaned). Current: **8,147** media rows vs **8,125** distinct Drive file IDs (~22 collisions / blanks) | `UNIQUE (google_drive_file_id) WHERE not null` |
| Oversized JSON on Platform Outputs | `Selected_Assets_JSON` / dual-embedded Fast Vibe payloads → Airtable 422 | `jsonb` + normalize clip lists; size checks in app |
| Wide denormalized Platform Outputs | **335 fields** including many platform-specific status columns | Keep core columns; park rare platform payloads in `jsonb` |
| Lookup vs link inconsistency | `Content_Profile` on Outputs is lookup; Worker often filters via formula | Store `content_profile_id` FK denormalized for index filters |
| Transfer queue growth | 6,120 rows | Archive completed transfers; index by status |
| Make Admin Queue still large | 2,863 rows | Exclude from Phase 2 unless still on hot path |
| No DB-level uniqueness on Output_ID/Content_ID beyond Airtable autoNumber | App assumes monotonic IDs | `UNIQUE(output_number)`, `UNIQUE(content_number)` |
| URLs vs durable IDs | Drive URLs + File IDs coexist; R2 publish URLs for covers | Keep Drive file id as authority; URLs derived |

### 4.4 Integrity notes

- Do **not** treat Google Drive as migratable blob storage; Drive remains DAM (workspace rule).
- Publishing requires public HTTP covers on `media.chicagoshining.com` — unrelated to DB choice but must stay out of Media Asset authority fields.

---

## 5. Preliminary PostgreSQL design (Deliverable D)

Files:

- [`001_core_schema.sql`](./001_core_schema.sql) — tables, FKs, unique/partial indexes  
- [`002_benchmark_queries.sql`](./002_benchmark_queries.sql) — Pipeline-shaped benchmarks  

### 5.1 Design decisions

1. **UUID PKs + `airtable_record_id text unique`** for reconciliation and dual-read.
2. **Preserve autoNumbers** as `content_number` / `output_number` (unique) for operator-facing IDs.
3. **Single FK columns** replace linked-record arrays for primary relationships.
4. **Large JSON stays `jsonb`** initially (`selected_assets`, manifests, job JSON) — normalize later only where queried.
5. **List projections omit jsonb** (match today’s `OUTPUT_LIST_FIELDS` discipline).
6. **Partial indexes** for awaiting-approval, scheduled range, pipeline-open, published.
7. **Workers connection model:** prefer **Supabase PostgREST / JS client over HTTP** from Cloudflare Workers (no sticky TCP). If using SQL, use Supabase **pooler (transaction mode)** + short-lived clients. Do not open unbounded connections from isolates.
8. **Separate Supabase project** from tasks-api `events` database.

### 5.2 Transaction boundaries (write phase later)

| Operation | Today (Airtable) | Target |
|---|---|---|
| Approve for publishing | Multi PATCH + schedule side effects | Single TX: output status + schedule stamps; side effects outbox |
| Promote production request | PR + Content Item + Outputs fanout | TX for rows; enqueue produce job after commit |
| Schedule update | PATCH output dates | TX + invalidate Pipeline snapshot cache |
| Variant complete | Transfer queue + media + PR JSON | TX; keep Drive upload outside TX |

---

## 6. Proof of concept (Deliverable E)

### 6.1 Status: **Pending — blocked**

| Requirement | Status |
|---|---|
| Isolated Supabase project (not tasks-api) | **Missing in this environment** |
| Export representative Airtable rows | Feasible via Airtable MCP / API (read-only) — not executed to avoid large dumps without destination |
| Import + index + reconcile | Blocked on project |
| Benchmark run | Blocked; SQL ready |

**Explicit non-actions:** Did not create dual-write, did not modify existing Supabase admin/tasks DB, did not change Worker routing.

### 6.2 Executable POC plan (Phase 1.5 / start of Phase 2)

1. Create Supabase project `sm-pipeline-v2-dev` (Free is enough for POC; Pro if needing larger egress or PITR later).
2. Apply `001_core_schema.sql`.
3. Export from Airtable (read-only) for one profile, e.g. Chicago:
   - All Content Profiles (4)
   - Content Items for profile
   - Platform Outputs for those content items (or profile filter)
   - Linked Media Assets referenced by those rows
4. Map `rec…` IDs → UUIDs; store both.
5. Run `002_benchmark_queries.sql`; save `EXPLAIN ANALYZE` outputs.
6. Build a **throwaway** Worker route or script that returns the same JSON shape as `mapOutput` list fields from Supabase; compare record counts and key fields to Airtable for N=250.
7. Pass criteria:
   - Row counts match for the exported slice
   - Spot-check 20 outputs: platform, statuses, schedule, content_number
   - Postgres query p95 ≪ Airtable list wall time for same slice (**measure both**)

---

## 7. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Dual-write drift during cutover | High | Read-only replica phase first; no dual-write until reconciliation harness is green |
| Missing field coverage (335 PO fields) | High | Migrate hot columns first; rest in `extras`/`jsonb` |
| Worker timeout / CPU on large joins | Medium | Keep list column sets lean; paginate |
| Cron + UI stampede on new DB | Medium | Retain coalesce/cache; remove Airtable slot only after cutover |
| Auth email lookup bugs | Medium | Unique index + tests before switching `resolveAuthorization` |
| Accidental use of tasks Supabase | High | Separate project; separate secrets; document in wrangler |
| Rollback | Medium | Feature flag `STUDIO_READ_SOURCE=airtable|supabase` per route; Airtable remains SoR until Phase 3 writes |
| Drive/media confusion | High | Schema stores Drive IDs only; no R2 originals as authority |

---

## 8. Cost comparison

| Item | Airtable (current) | Supabase |
|---|---|---|
| Operational model | Rows + API rate limits dominate pain | DB size + egress + MAU |
| Studio hot data (order of magnitude) | ~3k outputs, ~8k media metadata rows, ~6k transfer rows | Well within Free/Pro for metadata-only |
| Free tier fit | Airtable free insufficient for this base | **Free OK for POC**; production should use **Pro** for daily backups, larger limits, support |
| Hidden cost today | Engineering time on rate-limit shields + incident heals | Migration + dual-run engineering |
| Media storage | Drive + R2 staging (unchanged) | Unchanged |

**Assumption (not a quote):** Pro is the right production tier once Pipeline reads move; Free is fine for the isolated POC project.

---

## 9. Migration roadmap (Deliverable F)

### Phase 2 — Isolated POC + reconciliation (next)

- Create `sm-pipeline-v2-dev` Supabase project  
- Load snapshot; run benchmarks  
- Add read-only comparison harness  
- **Gate:** benchmarks + row reconciliation signed off  

### Phase 3 — Pipeline **read** cutover (preferred first production slice)

- Feature-flag `/api/outputs`, `/api/outputs?mode=latest`, `/api/outputs/schedule-grid`  
- Keep Airtable writes as source of truth; async replicate or nightly refresh **or** short-term poll Airtable→Supabase for changed records  
- Prefer **CDC-lite**: on Airtable PATCH success, also upsert Supabase (optional later). Initial: periodic sync to avoid dual-write bugs  
- **Gate:** Pipeline UI matches Airtable for 1 week; 429 rate from Pipeline reads drops  

### Phase 4 — Factory / Overview / Content list reads

- `/api/factory/desk`, `/api/profiles/overview`, `/api/content`  
- Move `resolveAuthorization` to indexed user/membership tables  

### Phase 5 — Write cutover for Outputs + Content Items

- Approve, schedule, publish status updates  
- Transactional outbox for Make/platform side effects  
- **Gate:** no dual-write; Airtable becomes legacy export  

### Phase 6 — Production Requests, Media metadata, Transfer Queue, autonomous/cron

- Highest complexity; keep Drive authority  
- Decommission Airtable when heal/cron paths are clean  

**Do not** migrate writes before Phase 3 read validation.  
**Do not** put Studio into the tasks-api Supabase project.

---

## 10. Next steps — exact Phase 2 execution plan

1. **Joseph:** create isolated Supabase project; store URL + service role in a **dev-only** secret namespace (not production Worker yet).  
2. **Agent:** apply `001_core_schema.sql`; add a small `scripts/supabase-poc/` importer (Airtable PAT → Supabase) behind local env only.  
3. **Agent:** import Chicago (+ optionally all 4 profiles) Outputs + Content Items + Profiles.  
4. **Agent:** run `002_benchmark_queries.sql`; attach `EXPLAIN ANALYZE` to this folder as `benchmarks/`.  
5. **Agent:** implement comparison script: for profile P, diff Airtable `OUTPUT_LIST_FIELDS` vs Supabase projection (counts + hash of sorted ids/statuses).  
6. **Decision meeting:** if p95 join query and reconciliation pass, open Phase 3 flag PR for Pipeline reads only.  
7. **Explicitly out of scope until then:** production Worker deploy, dual-write, Airtable record deletes, Drive changes.

---

## Appendix A — Verified vs assumption

| Statement | Class |
|---|---|
| Record counts and status breakdowns above | **Verified (Airtable MCP)** |
| Multi-scan Pipeline builder and caching | **Verified (code)** |
| Frontend concurrent Pipeline fetches | **Verified (code)** |
| Auth full-table list | **Verified (code)** |
| 250ms Airtable slot + 429 fail-fast | **Verified (code)** |
| Historical 642→16 Drive duplicates | **Historical (handoff doc); current distinct≈8125/8147 verified** |
| End-to-end latency numbers | **Not measured this run** |
| Dollar cost of Airtable vs Supabase Pro | **Assumption — confirm on invoices** |
| Free tier sufficient for production | **Not recommended — Assumption** |

## Appendix B — Key code references

- Airtable slotting: `apps/studio-api/worker.js` (`AIRTABLE_MIN_GAP_MS`, `airtableRequestSlot`)  
- Pipeline list + snapshots: `listOutputs`, `buildPipelineOutputsPayload`, `respondStudioMappedList`  
- Lean fields: `OUTPUT_LIST_FIELDS`  
- Auth: `resolveAuthorization`  
- Factory: `getFactoryDesk`  
- Cron burn control: `scheduled` handler comments (~2026-10-11)  
- Existing unrelated Supabase: `apps/tasks-api/worker.js` (`events` table only)

## Appendix C — Phase 1 completion checklist

| Criterion | Status |
|---|---|
| Active Airtable dependencies inventoried | **Done** |
| Major bottlenecks identified with evidence | **Done** |
| Schema + relationships documented | **Done** |
| Preliminary PostgreSQL schema designed | **Done** (`001_core_schema.sql`) |
| POC executed **or** blockers + executable plan | **Blocked + plan documented** |
| Risks + rollback assessed | **Done** |
| Phase 2 roadmap produced | **Done** |

Phase 1 assessment work product is complete under the handoff rule that POC may be pending when access is unavailable.
