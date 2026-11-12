-- Quality Agent recovery-event readback. Airtable remains the write source of truth.
-- Record deletion is not started. Airtable is a frozen archive.

create table if not exists public.quality_agent_recovery_events (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,
  event_key text,
  outcome text,
  output_record_id text,
  output_number integer,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.quality_agent_recovery_events is
  'Copy of Quality Agent Recovery Ledger rows for readback. Airtable remains the write source of truth. Record deletion is not started. Airtable is a frozen archive.';
