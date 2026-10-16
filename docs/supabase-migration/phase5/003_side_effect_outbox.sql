-- Phase 5 best-effort outbox. Not applied by the Worker.
-- Apply on sm-pipeline-v2-dev when a consumer (Make / platform side effects)
-- is ready to read it. Until then the Worker skips inserts with PGRST205.
-- Airtable remains the write source of truth. This is not the legacy-export cutover.

create table if not exists studio_side_effect_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  airtable_table text not null,
  airtable_record_id text not null,
  mutation text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  constraint studio_side_effect_outbox_status_chk check (
    status in ('pending', 'delivered', 'skipped')
  )
);

create index if not exists studio_side_effect_outbox_pending_idx
  on studio_side_effect_outbox (created_at)
  where status = 'pending';
