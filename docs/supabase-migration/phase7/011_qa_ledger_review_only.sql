-- REVIEW-ONLY: Proposed append-only Supabase QA Test Center ledger.
-- THIS MIGRATION HAS NOT BEEN APPLIED TO PRODUCTION.
-- Apply ONLY after an approved, independently counted source export,
-- backup/rollback evidence, migration review and explicit release approval.
-- Airtable source: QA Test Runs tblYwzehVtmyUMzj5,
-- QA Executions tblsg5E1cq8nb240c.
-- Historical values (including non-Open status and legacy non-SHA hashes)
-- are immutable and preserved verbatim in source provenance. New native rows
-- require SHA-256 payload hashes and an Open run status.

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
  constraint studio_qa_run_status check (
    (legacy_record_id is null and status = 'Open')
    or (legacy_record_id is not null and length(btrim(status)) between 1 and 120)
  ),
  constraint studio_qa_run_deployment_object check (jsonb_typeof(deployment) = 'object'),
  constraint studio_qa_run_hash check (
    (legacy_record_id is null and payload_hash ~ '^[0-9a-f]{64}$')
    or (legacy_record_id is not null and length(payload_hash) between 1 and 200)
  ),
  constraint studio_qa_run_legacy_hash check (
    legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint studio_qa_run_legacy_fields check (
    legacy_source_fields is null or jsonb_typeof(legacy_source_fields) = 'object'
  ),
  constraint studio_qa_run_legacy_triple check (
    (legacy_record_id is null and legacy_source_fields is null and legacy_row_sha256 is null)
    or (legacy_record_id is not null and legacy_source_fields is not null
        and legacy_row_sha256 is not null)
  )
);

create table public.studio_qa_events (
  record_id text primary key default ('qa-sb-' || gen_random_uuid()::text),
  run_id text not null references public.studio_qa_runs(run_id) on delete restrict,
  execution_id text not null unique,
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
  constraint studio_qa_event_kind check (
    event_kind in ('ManualResult','AutomatedObservation','HumanApproval','Waiver','RunFinalized')
  ),
  constraint studio_qa_event_payload_object check (jsonb_typeof(payload_json) = 'object'),
  constraint studio_qa_event_hash check (
    (legacy_record_id is null and payload_hash ~ '^[0-9a-f]{64}$')
    or (legacy_record_id is not null and length(payload_hash) between 1 and 200)
  ),
  constraint studio_qa_event_legacy_hash check (
    legacy_row_sha256 is null or legacy_row_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint studio_qa_event_legacy_fields check (
    legacy_source_fields is null or jsonb_typeof(legacy_source_fields) = 'object'
  ),
  constraint studio_qa_event_legacy_triple check (
    (legacy_record_id is null and legacy_source_fields is null and legacy_row_sha256 is null)
    or (legacy_record_id is not null and legacy_source_fields is not null
        and legacy_row_sha256 is not null)
  )
);

create index studio_qa_runs_created_page_idx
  on public.studio_qa_runs (created_at_utc desc, record_id desc);
create index studio_qa_events_run_page_idx
  on public.studio_qa_events (run_id, recorded_at_utc asc, record_id asc);

-- Neither administrator errors nor retries may rewrite signed history.
-- Governance corrections must be new immutable events, not PATCH/DELETE.
create function public.studio_qa_reject_mutation()
returns trigger
language plpgsql security invoker set search_path = ''
as $qa_append_only$
begin
  raise exception 'Studio QA ledger is append-only' using errcode = '55000';
end;
$qa_append_only$;

create trigger studio_qa_runs_append_only
  before update or delete on public.studio_qa_runs
  for each row execute function public.studio_qa_reject_mutation();
create trigger studio_qa_events_append_only
  before update or delete on public.studio_qa_events
  for each row execute function public.studio_qa_reject_mutation();

alter table public.studio_qa_runs enable row level security;
alter table public.studio_qa_events enable row level security;
-- Authenticated Studio admins use the Worker endpoint, never a browser key
-- to these tables. The Worker holds the Supabase service-role credential.
revoke all on public.studio_qa_runs, public.studio_qa_events
  from public, anon, authenticated, service_role;
grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role;
revoke all on function public.studio_qa_reject_mutation()
  from public, anon, authenticated;

comment on table public.studio_qa_runs is
  'Append-only Studio QA runs; Airtable IDs survive solely as preserved provenance.';
comment on table public.studio_qa_events is
  'Append-only Studio QA events; no direct browser access or mutation endpoints.';

commit;

-- PRE-DEPLOY ACCEPTANCE (operator review; not performed by this file):
-- 1. Independently export/count every source QA run and event (no pagination gaps).
-- 2. Confirm production backup, rollback and no active source writers.
-- 3. Verify historical import digests, exact run/event IDs, idempotency,
--    timestamps, actor provenance and non-Open historical run status.
-- 4. Read back all rows from Supabase and reconcile SHA-256 of legacy_source_fields
--    against the private frozen source export using qa_ledger_backfill_preflight.py.
-- 5. Check RLS and grants for anon/authenticated/service_role; test denial of
--    unauthorized reads/writes and update/delete (rollback-only transaction).
-- 6. Verify Worker-only QA history, replay, concurrency, finalization, human
--    approval and release gate with nonpublishing canaries.
-- 7. Only separately authorized operators can proceed to production deployment;
--    a green schema check or source count alone never authorizes it.
