-- Incident #2670: durable Supabase authority for Rendering Review workflow rows.
-- These tables intentionally retain the Airtable-shaped fields bag so the
-- existing exact-job safety proofs can be restored without fabricating or
-- lossy-normalizing historical records.

create table if not exists public.rendering_review_sessions (
  id bigint generated always as identity primary key,
  airtable_record_id text not null unique check (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rendering_review_jobs (
  id bigint generated always as identity primary key,
  airtable_record_id text not null unique check (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rendering_review_attempts (
  id bigint generated always as identity primary key,
  airtable_record_id text not null unique check (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rendering_review_plans (
  id bigint generated always as identity primary key,
  airtable_record_id text not null unique check (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists rendering_review_sessions_output_idx
  on public.rendering_review_sessions ((fields->>'Output_Record_ID'));
create index if not exists rendering_review_jobs_job_idx
  on public.rendering_review_jobs ((fields->>'Job_ID'));
create index if not exists rendering_review_jobs_queue_idx
  on public.rendering_review_jobs ((fields->>'Job_State'),(fields->>'Progress_Stage'),created_at);
create index if not exists rendering_review_attempts_attempt_idx
  on public.rendering_review_attempts ((fields->>'Attempt_ID'));
create index if not exists rendering_review_plans_hash_idx
  on public.rendering_review_plans ((fields->>'Plan_Hash'));

alter table public.rendering_review_sessions enable row level security;
alter table public.rendering_review_jobs enable row level security;
alter table public.rendering_review_attempts enable row level security;
alter table public.rendering_review_plans enable row level security;

revoke all on public.rendering_review_sessions from public, anon, authenticated;
revoke all on public.rendering_review_jobs from public, anon, authenticated;
revoke all on public.rendering_review_attempts from public, anon, authenticated;
revoke all on public.rendering_review_plans from public, anon, authenticated;
grant select, insert, update, delete on public.rendering_review_sessions to service_role;
grant select, insert, update, delete on public.rendering_review_jobs to service_role;
grant select, insert, update, delete on public.rendering_review_attempts to service_role;
grant select, insert, update, delete on public.rendering_review_plans to service_role;
grant usage, select on sequence public.rendering_review_sessions_id_seq to service_role;
grant usage, select on sequence public.rendering_review_jobs_id_seq to service_role;
grant usage, select on sequence public.rendering_review_attempts_id_seq to service_role;
grant usage, select on sequence public.rendering_review_plans_id_seq to service_role;

comment on table public.rendering_review_jobs is
  'Supabase-only durable Rendering Review queue. Empty means no eligible jobs; it is not reconstructed history.';
