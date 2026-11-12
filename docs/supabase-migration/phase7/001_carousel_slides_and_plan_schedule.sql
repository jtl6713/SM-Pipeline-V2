-- Carousel slide records and Production Request Output schedule fields.
-- Airtable remains the write source of truth. These columns are a read copy.
-- Record deletion is not started. Airtable is a frozen archive.

create table if not exists carousel_slides (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,
  current_order integer,
  deleted_from_carousel boolean not null default false,
  ig_child_container_id text,
  voiceover jsonb not null default '{}'::jsonb,
  creative_directives jsonb not null default '{}'::jsonb,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carousel_slides_order_idx
  on carousel_slides (current_order);

alter table production_request_outputs
  add column if not exists scheduled_at timestamptz,
  add column if not exists enabled boolean,
  add column if not exists brand_airtable_id text,
  add column if not exists brand_airtable_ids jsonb not null default '[]'::jsonb,
  add column if not exists production_request_airtable_id text,
  add column if not exists production_request_airtable_ids jsonb not null default '[]'::jsonb;

create index if not exists production_request_outputs_schedule_idx
  on production_request_outputs (scheduled_at)
  where enabled is true;
