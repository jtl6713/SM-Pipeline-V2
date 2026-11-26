-- #3094 reviewed migration proposal; do not apply until release coordination.
-- Nullable with no default/backfill: old or imported rows confer no new routing
-- authority. The authenticated creation path must explicitly stamp new Ideas.
-- A request derives mode through its existing idea_candidate_id FK, not from
-- a second mutable copy. Dedicated finished-video request origin remains intact.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
alter table public.idea_candidates
  add column if not exists production_mode text,
  add column if not exists production_source text;
-- Intentionally NOT VALID: no broad table scan in this migration. PostgreSQL
-- enforces this constraint on every new or changed row. Validate separately.
alter table public.idea_candidates
  add constraint idea_candidates_production_mode_3094_chk
  check (
    (production_mode is null and production_source is null) or
    (production_mode is not null and production_source is not null and
     production_mode in ('automatic', 'manual') and
     production_source in ('idea', 'script_a_short', 'finished_video') and
     (production_source = 'idea' or production_mode = 'automatic'))
  ) not valid;
comment on column public.idea_candidates.production_mode is
  'Canonical per-Idea mode, NULL = unreconciled. No publishing authority.';
comment on column public.idea_candidates.production_source is
  'Server-established source identity, not a user-editable note.';
commit;
-- No existing Ideas, requests, leases, jobs, holds or provider state rewritten.
-- Rollback: disable capture before any schema rollback. Preserve captured mode
-- rather than dropping columns if any writer has started using them.
