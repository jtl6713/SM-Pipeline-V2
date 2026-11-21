-- REVIEW-ONLY migration candidate for Studio QA Test Center.
-- This file is NOT applied by CI and must not be run before an approved,
-- independently reconciled Airtable historical export and rollback plan.
-- Canonical source tables: tblYwzehVtmyUMzj5, tblsg5E1cq8nb240c.
-- Verified historical snapshot contains non-Open legacy status and 33-character
-- legacy payload-hash tokens. Preserve these verbatim for source reconciliation;
-- new Supabase writes must use SHA-256 hex and Open run status.
-- Enforce append-only, service-role-only access and historical provenance.

begin;

create table public.studio_qa_runs (
  record_id text primary key default ('qa-sb-' || gen_random_uuid()::text),
  run_id text not null unique,
  catalog_revision text not null,
  environment text not null,
  deployment jsonb not null,
  created_by text not null,
  created_at_utc timestamptz not null,
  status text not null default 'Open',
  idempotency_key text not null unique,
  payload_hash text not null,
  legacy_record_id text unique,
  legacy_source_fields jsonb,
  legacy_row_sha256 text,
  inserted_at_utc timestamptz not null default now(),
  constraint studio_qa_run_id_format check (run_id ~ '^qa-[0-9a-f-]{36}$'),
  constraint studio_qa_run_environment check (environment in ('production','staging','development')),
  constraint studio_qa_run_status check (length(btrim(status)) between 1 and 120),
  constraint studio_qa_run_deployment_object check (jsonb_typeof(deployment)='object'),
  constraint studio_qa_run_hash check (payload_hash ~ '^[0-9a-f]{64}
  constraint studio_qa_run_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_run_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_run_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

create table public.studio_qa_events (
  record_id text primary key default ('qa-sb-' || gen_random_uuid()::text),
  run_id text not null references public.studio_qa_runs(run_id) on delete restrict,
  execution_id text not null,
  test_id text not null,
  event_kind text not null,
  actor_id text not null,
  recorded_at_utc timestamptz not null,
  payload_json jsonb not null,
  idempotency_key text not null unique,
  payload_hash text not null,
  legacy_record_id text unique,
  legacy_source_fields jsonb,
  legacy_row_sha256 text,
  inserted_at_utc timestamptz not null default now(),
  constraint studio_qa_event_run_id_format check (run_id ~ '^qa-[0-9a-f-]{36}$'),
  constraint studio_qa_event_execution_id_format check (execution_id ~ '^qaex-[0-9a-f-]{36}$'),
  constraint studio_qa_event_kind check (event_kind in ('ManualResult','AutomatedObservation','HumanApproval','Waiver','RunFinalized')),
  constraint studio_qa_event_payload_object check (jsonb_typeof(payload_json)='object'),
  constraint studio_qa_event_hash check (payload_hash ~ '^[0-9a-f]{64}
  constraint studio_qa_event_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_event_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

-- Stable, bounded pagination for run list and full run-event history.
create index studio_qa_runs_created_page_idx
  on public.studio_qa_runs (created_at_utc desc, record_id desc);
create index studio_qa_events_run_page_idx
  on public.studio_qa_events (run_id, recorded_at_utc asc, record_id asc);

-- Direct updates or deletes (including service-role calls) are never valid.
-- Corrections must be new, append-only governance events.
create function public.studio_qa_reject_mutation() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Studio QA ledger is append-only'
    using errcode = '55000';
end;
$$;
create trigger studio_qa_runs_append_only
  before update or delete on public.studio_qa_runs
  for each row execute function public.studio_qa_reject_mutation();
create trigger studio_qa_events_append_only
  before update or delete on public.studio_qa_events
  for each row execute function public.studio_qa_reject_mutation();

alter table public.studio_qa_runs enable row level security;
alter table public.studio_qa_events enable row level security;
-- No anon/authenticated RLS policies. The Worker authenticates administrators
-- before using the server-held service-role key; never send that key to the UI.
revoke all on public.studio_qa_runs, public.studio_qa_events from public, anon, authenticated, service_role;
grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role;
revoke all on function public.studio_qa_reject_mutation() from public, anon, authenticated;

comment on table public.studio_qa_runs is 'Append-only Studio QA runs; legacy Airtable record IDs are provenance only.';
comment on table public.studio_qa_events is 'Append-only Studio QA events; no update/delete or client direct access.';

commit;

-- PRE-PRODUCTION ACCEPTANCE (read-only, separate operator-run queries):
-- 1. Check pg_class.relrowsecurity and table privileges for both tables.
-- 2. Compare one-time source export counts and per-record SHA256 checksums.
-- 3. Verify each event's run_id references an imported exact run.
-- 4. Attempt update/delete inside a ROLLBACK-only transaction to assert
--    55000 (never commit these test statements).
-- 5. Test authenticated HTTP read/write DENIAL and authorized service-role
--    read/insert with server-only key; no UI or publish access.
-- 6. Reconcile GET /api/admin/qa/runs and /runs/:id history exactly, including
--    replay, immutability, actor/time provenance and release gate.
 or (legacy_record_id is not null and length(payload_hash) between 1 and 200)),
  constraint studio_qa_run_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_run_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_run_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

create table public.studio_qa_events (
  record_id text primary key default ('qa-sb-' || gen_random_uuid()::text),
  run_id text not null references public.studio_qa_runs(run_id) on delete restrict,
  execution_id text not null,
  test_id text not null,
  event_kind text not null,
  actor_id text not null,
  recorded_at_utc timestamptz not null,
  payload_json jsonb not null,
  idempotency_key text not null unique,
  payload_hash text not null,
  legacy_record_id text unique,
  legacy_source_fields jsonb,
  legacy_row_sha256 text,
  inserted_at_utc timestamptz not null default now(),
  constraint studio_qa_event_run_id_format check (run_id ~ '^qa-[0-9a-f-]{36}$'),
  constraint studio_qa_event_execution_id_format check (execution_id ~ '^qaex-[0-9a-f-]{36}$'),
  constraint studio_qa_event_kind check (event_kind in ('ManualResult','AutomatedObservation','HumanApproval','Waiver','RunFinalized')),
  constraint studio_qa_event_payload_object check (jsonb_typeof(payload_json)='object'),
  constraint studio_qa_event_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_event_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

-- Stable, bounded pagination for run list and full run-event history.
create index studio_qa_runs_created_page_idx
  on public.studio_qa_runs (created_at_utc desc, record_id desc);
create index studio_qa_events_run_page_idx
  on public.studio_qa_events (run_id, recorded_at_utc asc, record_id asc);

-- Direct updates or deletes (including service-role calls) are never valid.
-- Corrections must be new, append-only governance events.
create function public.studio_qa_reject_mutation() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Studio QA ledger is append-only'
    using errcode = '55000';
end;
$$;
create trigger studio_qa_runs_append_only
  before update or delete on public.studio_qa_runs
  for each row execute function public.studio_qa_reject_mutation();
create trigger studio_qa_events_append_only
  before update or delete on public.studio_qa_events
  for each row execute function public.studio_qa_reject_mutation();

alter table public.studio_qa_runs enable row level security;
alter table public.studio_qa_events enable row level security;
-- No anon/authenticated RLS policies. The Worker authenticates administrators
-- before using the server-held service-role key; never send that key to the UI.
revoke all on public.studio_qa_runs, public.studio_qa_events from public, anon, authenticated, service_role;
grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role;
revoke all on function public.studio_qa_reject_mutation() from public, anon, authenticated;

comment on table public.studio_qa_runs is 'Append-only Studio QA runs; legacy Airtable record IDs are provenance only.';
comment on table public.studio_qa_events is 'Append-only Studio QA events; no update/delete or client direct access.';

commit;

-- PRE-PRODUCTION ACCEPTANCE (read-only, separate operator-run queries):
-- 1. Check pg_class.relrowsecurity and table privileges for both tables.
-- 2. Compare one-time source export counts and per-record SHA256 checksums.
-- 3. Verify each event's run_id references an imported exact run.
-- 4. Attempt update/delete inside a ROLLBACK-only transaction to assert
--    55000 (never commit these test statements).
-- 5. Test authenticated HTTP read/write DENIAL and authorized service-role
--    read/insert with server-only key; no UI or publish access.
-- 6. Reconcile GET /api/admin/qa/runs and /runs/:id history exactly, including
--    replay, immutability, actor/time provenance and release gate.
 or (legacy_record_id is not null and length(payload_hash) between 1 and 200)),
  constraint studio_qa_event_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_event_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

-- Stable, bounded pagination for run list and full run-event history.
create index studio_qa_runs_created_page_idx
  on public.studio_qa_runs (created_at_utc desc, record_id desc);
create index studio_qa_events_run_page_idx
  on public.studio_qa_events (run_id, recorded_at_utc asc, record_id asc);

-- Direct updates or deletes (including service-role calls) are never valid.
-- Corrections must be new, append-only governance events.
create function public.studio_qa_reject_mutation() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Studio QA ledger is append-only'
    using errcode = '55000';
end;
$$;
create trigger studio_qa_runs_append_only
  before update or delete on public.studio_qa_runs
  for each row execute function public.studio_qa_reject_mutation();
create trigger studio_qa_events_append_only
  before update or delete on public.studio_qa_events
  for each row execute function public.studio_qa_reject_mutation();

alter table public.studio_qa_runs enable row level security;
alter table public.studio_qa_events enable row level security;
-- No anon/authenticated RLS policies. The Worker authenticates administrators
-- before using the server-held service-role key; never send that key to the UI.
revoke all on public.studio_qa_runs, public.studio_qa_events from public, anon, authenticated, service_role;
grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role;
revoke all on function public.studio_qa_reject_mutation() from public, anon, authenticated;

comment on table public.studio_qa_runs is 'Append-only Studio QA runs; legacy Airtable record IDs are provenance only.';
comment on table public.studio_qa_events is 'Append-only Studio QA events; no update/delete or client direct access.';

commit;

-- PRE-PRODUCTION ACCEPTANCE (read-only, separate operator-run queries):
-- 1. Check pg_class.relrowsecurity and table privileges for both tables.
-- 2. Compare one-time source export counts and per-record SHA256 checksums.
-- 3. Verify each event's run_id references an imported exact run.
-- 4. Attempt update/delete inside a ROLLBACK-only transaction to assert
--    55000 (never commit these test statements).
-- 5. Test authenticated HTTP read/write DENIAL and authorized service-role
--    read/insert with server-only key; no UI or publish access.
-- 6. Reconcile GET /api/admin/qa/runs and /runs/:id history exactly, including
--    replay, immutability, actor/time provenance and release gate.
 or (legacy_record_id is not null and length(payload_hash) between 1 and 200)),
  constraint studio_qa_run_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_run_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_run_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

create table public.studio_qa_events (
  record_id text primary key default ('qa-sb-' || gen_random_uuid()::text),
  run_id text not null references public.studio_qa_runs(run_id) on delete restrict,
  execution_id text not null,
  test_id text not null,
  event_kind text not null,
  actor_id text not null,
  recorded_at_utc timestamptz not null,
  payload_json jsonb not null,
  idempotency_key text not null unique,
  payload_hash text not null,
  legacy_record_id text unique,
  legacy_source_fields jsonb,
  legacy_row_sha256 text,
  inserted_at_utc timestamptz not null default now(),
  constraint studio_qa_event_run_id_format check (run_id ~ '^qa-[0-9a-f-]{36}$'),
  constraint studio_qa_event_execution_id_format check (execution_id ~ '^qaex-[0-9a-f-]{36}$'),
  constraint studio_qa_event_kind check (event_kind in ('ManualResult','AutomatedObservation','HumanApproval','Waiver','RunFinalized')),
  constraint studio_qa_event_payload_object check (jsonb_typeof(payload_json)='object'),
  constraint studio_qa_event_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_hash check (legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint studio_qa_event_legacy_fields check (legacy_source_fields is null or jsonb_typeof(legacy_source_fields)='object'),
  constraint studio_qa_event_legacy_pair check ((legacy_record_id is null)=(legacy_source_fields is null))
);

-- Stable, bounded pagination for run list and full run-event history.
create index studio_qa_runs_created_page_idx
  on public.studio_qa_runs (created_at_utc desc, record_id desc);
create index studio_qa_events_run_page_idx
  on public.studio_qa_events (run_id, recorded_at_utc asc, record_id asc);

-- Direct updates or deletes (including service-role calls) are never valid.
-- Corrections must be new, append-only governance events.
create function public.studio_qa_reject_mutation() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Studio QA ledger is append-only'
    using errcode = '55000';
end;
$$;
create trigger studio_qa_runs_append_only
  before update or delete on public.studio_qa_runs
  for each row execute function public.studio_qa_reject_mutation();
create trigger studio_qa_events_append_only
  before update or delete on public.studio_qa_events
  for each row execute function public.studio_qa_reject_mutation();

alter table public.studio_qa_runs enable row level security;
alter table public.studio_qa_events enable row level security;
-- No anon/authenticated RLS policies. The Worker authenticates administrators
-- before using the server-held service-role key; never send that key to the UI.
revoke all on public.studio_qa_runs, public.studio_qa_events from public, anon, authenticated, service_role;
grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role;
revoke all on function public.studio_qa_reject_mutation() from public, anon, authenticated;

comment on table public.studio_qa_runs is 'Append-only Studio QA runs; legacy Airtable record IDs are provenance only.';
comment on table public.studio_qa_events is 'Append-only Studio QA events; no update/delete or client direct access.';

commit;

-- PRE-PRODUCTION ACCEPTANCE (read-only, separate operator-run queries):
-- 1. Check pg_class.relrowsecurity and table privileges for both tables.
-- 2. Compare one-time source export counts and per-record SHA256 checksums.
-- 3. Verify each event's run_id references an imported exact run.
-- 4. Attempt update/delete inside a ROLLBACK-only transaction to assert
--    55000 (never commit these test statements).
-- 5. Test authenticated HTTP read/write DENIAL and authorized service-role
--    read/insert with server-only key; no UI or publish access.
-- 6. Reconcile GET /api/admin/qa/runs and /runs/:id history exactly, including
--    replay, immutability, actor/time provenance and release gate.
