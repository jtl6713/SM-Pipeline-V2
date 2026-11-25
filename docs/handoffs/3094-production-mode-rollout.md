# #3094 staged implementation and activation gates

Phase 1 introduces a pure routing policy, executable fixtures and an additive
schema proposal. It intentionally has no callers or production migration yet.
Do not deploy this as a completed workflow.

## Repository findings
- The phase1 core schema has idea_candidates and production_requests with a
  typed idea_candidate_id foreign key; requests also carry origin.
- worker-functions-04.mjs readyProductionIdeaEligible and discovery/backfill
  can admit eligible photo-ready ideas; explicit manual opt-in must be
  respected at discovery AND exact claim/readback, including stale R2 jobs.
  Preserve Explore initial approval and existing admission caps.
- worker.js exposes Production request collection, detail, edit, promote,
  conversation, and media/plan routes. Internal producers share these
  primitives. Separate authenticated ordinary-editor authorization from
  internal production execution; query manual-only before pagination/count.
- idea-first-storyboard.mjs stores story-first.1 data in notes; exact
  script/scene/media/timing authority must survive handoff.
- az-finished-video.mjs supports approval, immediate and legacy modes;
  azAutoApproveIfReady and Quality Agent ORIGIN_TERMINALS still describe
  auto-approval/scheduling for finished video. The new ordinary automated
  workflow must stop at human Factory review, including stale-client requests.
  Existing approved/scheduled/published records must not be rewritten.
  Do not use the former Publish Now path as implicit Production authority.
- quality-factory-handoff.mjs and its bounded cron already assess plan,
  fanout, media and Factory visibility. Reuse them rather than introducing
  another producer.

## Remaining activation work
1. Verify live schema and writer behavior, inventory in-flight/legacy rows
   using bounded read-only pages; apply additive schema only through the
   protected migration path. Add canonical create/edit and request handoff
   persistence, sparse update preservation and exact readback across Worker
   and runner. Mode transitions require authorization, audit and lease
   fencing. Unknown/legacy mode is never auto-promotion permission.
2. Wire ordinary Production list/search/count and direct editor endpoints
   to explicit manual ideas only, including stale clients; keep operational
   inventory independent. Guard automatic claim/retry paths against manual
   mode. Preserve current job ownership, idempotency and initial idea gate.
3. Wire dedicated workflows and idea defaults, then remove ordinary
   Production navigation for automatic content. Preserve storyboard authority,
   selected output directives, revisions, and human Factory approval.
   Release UI with a strictly higher shared build version per AGENTS.md.
4. Semantic QA: design read-only evidence adapter for profile, title, caption,
   script, scene instructions, platform and actual selected/rendered assets.
   Calibrate across all four profiles before enforcement. A Chicago nighttime
   montage featuring Buckingham Fountain at night passes; an unrelated Chicago
   landmark as primary Zoo Miami imagery is a material mismatch. Sparse,
   ambiguous or plausible B-roll evidence is advisory, never a publishing hold.
   Distinguish verified technical/rights defects from creative uncertainty.
   No uncalibrated score cutoff or blanket rerender. Reuse bounded repairs.
5. Test full flow and actual Factory-selectable outputs for AI idea, user
   idea, explicit manual idea, scripted short and finished upload. No provider
   publishing, scheduling or automatic Factory approval. Confirm count parity,
   no duplicate jobs, no automatic rows in Production, throughput and DB
   health at unchanged workload limits. Keep #3094 open until live proof.
