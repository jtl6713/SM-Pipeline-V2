-- #3094 additive schema proposal; NOT a deployment instruction.
-- Apply only via the reviewed migration path after live schema verification.
-- Null intentionally represents unreconciled legacy rows. No backfill, no
-- default and no trigger that starts work. New writers must explicitly stamp
-- automatic or manual after authorization; old writers must preserve fields.
begin;
alter table public.idea_candidates
  add column if not exists production_mode text
  check (production_mode in ('automatic','manual'));
alter table public.production_requests
  add column if not exists production_mode text
  check (production_mode in ('automatic','manual'));
comment on column public.idea_candidates.production_mode is
  'Explicit per-idea Production mode; NULL denotes legacy unreconciled intent.';
comment on column public.production_requests.production_mode is
  'Canonical request mode; NULL denotes legacy unreconciled intent. Not publication authority.';
commit;
-- Before enabling either route, inventory via bounded, read-only pages of
-- idea_candidates and production_requests (join on idea_candidate_id).
-- Do not infer explicit manual intent from a Draft/Ready status or origin.
-- Reconcile active leases and dedicated-origin markers before writing mode.
-- Do not run a full historical scan during peak workload.
