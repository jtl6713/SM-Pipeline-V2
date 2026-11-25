# #3094 — Production mode rollout contract (checkpoint 1)

## Status

Policy and shadow QA evidence contracts only. This checkpoint does not activate
automatic routing, hide requests, change Ideas, alter the Supabase schema,
dispatch jobs, change workload limits, or authorize a publishing action.
Existing Finished Video behavior is an explicit owner-approved exception.

## Source audit

At main baseline 151bc8ae173b4a2f089104ff796b25d6cf798b03:

- Supabase `idea_candidates` has a typed owner/profile FK and JSONB payload;
  `production_requests` has a typed Idea FK, origin, notes, plan and job.
  Neither currently has a typed Production mode.
- Worker manual creation: worker-functions-01.mjs createIdea, updateIdea,
  mapIdea. Canonical compatibility writer: supabase-pipeline-reads.mjs
  studioSideTableCommit / commitIdeaRecords. Runner I1 generation:
  services/pipeline-runner/i1/processor.py _candidate_fields and
  supabase_pipeline.py commit_idea_candidates. Worker autonomous generation:
  worker-functions-04.mjs createAutonomousIdea.
- Production creation and normal list/detail/update:
  worker-functions-02.mjs createDraftForIdea,
  getOrCreateProductionRequestForIdea, createProductionRequestFromBody,
  listOpenProductionRequests, listProductionRequests, getProductionRequest,
  updateProductionRequest. The current list caps before visibility filtering;
  filtering after that cap will starve manual Ideas and is NOT sufficient.
- Worker cron paths: readyProductionIdeaEligible,
  readyProductionExistingDraftEligible, studioReadyProductionCronResume,
  studioIdeaStartPhotoListening, adoptNextReadyDailyIdea and the photo
  matcher in worker-functions-03.mjs. Exact canonical mode must be checked
  at discovery, claim and every entry that can advance production. Preserve
  Explore acceptance, source/rights, active claim, admission and idempotency.
- UI: apps/studio-web/assets/app-item4-1008.js contains creation,
  Manage Idea, openProductionRequestForIdea, prepare-to-review, EZ wizard,
  and ordinary Production navigation. story-first-workspace.js owns the
  dedicated Script a Short workflow. Dedicated request/asset operations and
  Factory progress polling share existing APIs; distinguish those authorized
  operations from ordinary editor access rather than breaking their transport.
- Existing Finished Video worker: azAutoApproveIfReady in
  worker-functions-01.mjs calls finishedPublishMode; approval mode waits
  for human review, legacy/immediate follow their existing authorized
  approval/scheduling paths. Preserve az-finished-video.mjs and tests;
  never equate the new production mode with publishing authority.
- QA: quality-factory-handoff.mjs and quality-factory-handoff-cron.mjs are
  existing read-only end-to-end diagnosis and bounded exact recovery.
  The new creative-alignment-shadow.mjs is a proposed evidence contract for
  a semantic reviewer; not yet wired to that scan, not a model, and not
  calibrated. Existing technical, rights, audio and creative authority
  checks remain untouched.

## Read-only database inventory (2026-11-25)

The connected sm-pipeline-v2-dev project returned these aggregates from a
single SELECT against Draft/Ready/Submitted requests. These are physical
request rows, not an active backlog, and marker classification is a
heuristic, not authorization. Do not backfill modes from these buckets.

| Status | Detected notes marker | Count |
| --- | --- | ---: |
| Draft | autonomous | 35 |
| Draft | az-finished-video | 1 |
| Draft | prepare-to-review | 598 |
| Draft | story-first/scripted-short | 1 |
| Draft | other/legacy | 346 |
| Ready | other/legacy | 4 |

Total 985. No row writes or mode changes performed.

Reproduce as a read-only aggregate:

```sql
select request_status, case
  when production_notes ~* '(^|[;[:space:]])origin=az-finished-video([;[:space:]]|$)' then 'finished_video'
  when production_notes like '%[story-first-production.1]%'
    or production_notes ~* '(^|[;[:space:]])scripted-short=' then 'script_a_short'
  when production_notes ~* '(^|[;[:space:]])origin=autonomous([;[:space:]]|$)' then 'autonomous'
  when production_notes ~* '(^|[;[:space:]])origin=prepare-to-review([;[:space:]]|$)' then 'prepare_to_review'
  else 'legacy_or_other' end as detected_origin, count(*)
from production_requests where request_status in ('Draft','Ready','Submitted')
group by 1,2 order by 1,2;
```

## Next implementation gates (no release from checkpoint 1 alone)

1. Add a backward-compatible typed nullable mode/source authority on canonical
   Idea records (or prove an equivalent atomic canonical storage contract).
   Never set an automatic default on existing rows during migration.
   Validate both Worker and Runner write/read paths, including retry/full
   snapshot preservation and readback. Mode is not a creative-notes token;
   do not accept user-supplied origin strings as authority. Inventory active
   requests and reconcile legacy owner intent before activation.
2. Wire authorized new Idea create/edit, AI generation, dedicated storyboard
   and Finished Video handoffs. Mode changes require an exact owner and
   compare-and-set at a safe claim boundary; preserve prior mode on stale
   clients. Audit prior/new mode, actor, revision and time. Unrelated Vibe
   Cut behavior is out of scope and must not be accidentally changed.
3. Wire server-side manual-only request list and count before cap/search/
   pagination using canonical Idea FK, tenant/profile and mode; do not reuse
   this filter for Home or operational/QA backlog. Enforce editor-specific
   detail and mutation boundaries. Internal, dedicated and Factory
   progress endpoints must retain their independent authorization.
4. Wire mode guards into each automatic producer/dispatcher entry and
   durable claim recheck. Auto remains subordinate to existing Idea
   acceptance and workload/technical gates. Use existing production-to-
   Factory continuation. Existing active jobs must not disappear or
   be requeued merely because mode is absent.
5. UI: explicit per-Idea mode choice; default automatic, manual only on
   intentional opt-in. Remove ordinary Production navigation/actions for
   automatic items; dedicated source controls stay within own workflows.
   Release version must be greater than both main and deployed Studio UI
   (AGENTS.md). Validate desktop/mobile/deep-link/stale-client behavior.
6. QA shadow: collect exact actual selected assets with profile, title,
   caption, approved scene/brief, format, classifications and visual
   evidence; run a semantic reviewer with a structured assessment and
   bounded sampling. Compare human-labeled fixtures across all four
   profiles, broad/landmark themes, day/night, mixed B-roll, missing
   classifications and confirmed wrong-location cases. Count false
   blocks, misses, warnings, proposed repairs, time-to-Factory and DB
   health. Only independently corroborated material mismatches can
   become bounded repair candidates; no new holds for uncertain findings.
7. Protected releases: check overlapping PRs and exact head, merge only
   after required checks pass, deploy Worker/Pages/Runner through existing
   GitHub release paths, verify actual release IDs and flags. Do not
   increase producer concurrency or start a historical mass rerender.
   Prove live exact canaries for each source and manual opt-in, with exact
   output identities, no duplicate fanout, preserved storyboard, visible
  /selectable Factory cards and human Factory approval. Finished Video:
   preserve existing mode-specific scheduling, verify without provider
   publishing in tests. Keep #3094 open until those conditions are met.

## Rollback

Checkpoint 1 adds only standalone code/tests and this document; it has no
runtime side effects. Later rollout must use a separate tested enablement
flag, roll back admission/visibility together, preserve stored mode and
leases, and keep operations diagnostics available. Never roll back by
releasing publishing holds or enabling public publishing.
