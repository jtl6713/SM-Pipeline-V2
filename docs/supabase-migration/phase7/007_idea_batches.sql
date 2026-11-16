-- Idea generation batches. Supabase is the write source. Airtable is not written.

create table if not exists public.idea_batches (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text not null unique,
  batch_id text,
  status text,
  requested_count integer,
  generated_count integer,
  quality text,
  content_profile_airtable_id text,
  fields jsonb not null default '{}'::jsonb,
  requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idea_batches_profile_status_idx
  on public.idea_batches (content_profile_airtable_id, status);

comment on table public.idea_batches is
  'Manual and daily idea-generation batches. Studio and I1 read and write this table. Airtable is not the source.';
