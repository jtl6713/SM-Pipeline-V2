-- SM Pipeline V2 — Phase 1 preliminary PostgreSQL schema (Supabase)
-- Isolated development project only. Do not apply to the tasks-api Supabase project.
-- Preserves Airtable record IDs as airtable_record_id for migration reconciliation.

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy / profiles
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  organization_id uuid not null references organizations(id),
  name text not null,
  brand_voice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_profiles (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  organization_id uuid references organizations(id),
  brand_id uuid references brands(id),
  profile_name text not null,
  brand_name text,
  market_name text,
  active boolean not null default true,
  platform_setup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table studio_users (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  email text,
  display_name text,
  user_status text not null default 'Active',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index studio_users_email_lower_uidx
  on studio_users (lower(email))
  where email is not null;

create table studio_memberships (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  user_id uuid not null references studio_users(id),
  organization_id uuid not null references organizations(id),
  role text not null check (role in ('Owner','Admin','Editor','Reviewer','Viewer')),
  active boolean not null default true,
  membership_status text not null default 'Active',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Media (Drive remains DAM authority; store Drive IDs, not R2 originals)
-- ---------------------------------------------------------------------------

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  asset_name text not null,
  media_class text,
  asset_role text,
  asset_status text,
  active boolean not null default true,
  do_not_use boolean not null default false,
  studio_favorite boolean not null default false,
  google_drive_file_id text,
  google_drive_url text,
  mime_type text,
  file_extension text,
  file_size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historical Airtable duplicates shared Drive IDs. Prefer unique when present.
create unique index media_assets_drive_file_uidx
  on media_assets (google_drive_file_id)
  where google_drive_file_id is not null and google_drive_file_id <> '';

create index media_assets_role_active_idx
  on media_assets (asset_role, active)
  where do_not_use = false;

-- ---------------------------------------------------------------------------
-- Ideas / production requests
-- ---------------------------------------------------------------------------

create table idea_candidates (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  content_profile_id uuid references content_profiles(id),
  candidate_title text,
  idea_summary text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table production_requests (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  production_request_id text,
  organization_id uuid references organizations(id),
  brand_id uuid references brands(id),
  idea_candidate_id uuid references idea_candidates(id),
  created_by_user_id uuid references studio_users(id),
  selected_music_asset_id uuid references media_assets(id),
  request_status text not null,
  requested_title text,
  production_notes text,
  master_asset_status text,
  output_plan_status text,
  variant_status text,
  master_assets jsonb not null default '[]'::jsonb,
  output_plan jsonb not null default '{}'::jsonb,
  variant_manifest jsonb not null default '{}'::jsonb,
  production_job jsonb not null default '{}'::jsonb,
  publish_status jsonb not null default '{}'::jsonb,
  origin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_requests_status_chk check (
    request_status in ('Draft','Ready','Submitted','Promoted','Cancelled')
  )
);

create index production_requests_org_status_idx
  on production_requests (organization_id, request_status);

create index production_requests_origin_idx
  on production_requests (origin)
  where origin is not null;

-- ---------------------------------------------------------------------------
-- Content items + platform outputs (Pipeline core)
-- ---------------------------------------------------------------------------

create table content_items (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  content_number integer,
  content_profile_id uuid references content_profiles(id),
  production_request_id uuid references production_requests(id),
  preferred_music_asset_id uuid references media_assets(id),
  content_title text,
  content_status text,
  primary_location text,
  voiceover_status text,
  thumbnail_url text,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  extras jsonb not null default '{}'::jsonb
);

create unique index content_items_content_number_uidx
  on content_items (content_number)
  where content_number is not null;

create index content_items_profile_created_idx
  on content_items (content_profile_id, created_at desc);

alter table production_requests
  add column promoted_content_item_id uuid references content_items(id);

create table platform_outputs (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  output_number integer,
  content_item_id uuid references content_items(id),
  content_profile_id uuid references content_profiles(id),
  platform text not null,
  format text,
  platform_output_type text,
  studio_output_type text,
  aspect_ratio text,
  output_status text,
  render_status text,
  review_status text,
  publish_status text,
  publish_method text,
  do_not_publish boolean not null default false,
  test_run_id text,
  output_title text,
  output_caption text,
  output_hashtags text,
  thumbnail_url text,
  final_file_url text,
  publish_asset_url text,
  studio_preview_url text,
  platform_post_url text,
  scheduled_post_date timestamptz,
  studio_scheduled_at timestamptz,
  youtube_scheduled_publish_at timestamptz,
  published_at timestamptz,
  remotion_job_id text,
  selected_clip_count integer,
  -- Keep large blobs out of list projections; join only on detail routes.
  selected_assets jsonb,
  remotion_props jsonb,
  render_clip_list jsonb,
  creative_render_manifest jsonb,
  platform_publish_response jsonb,
  insights_metrics jsonb,
  error_messages jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index platform_outputs_output_number_uidx
  on platform_outputs (output_number)
  where output_number is not null;

create index platform_outputs_profile_output_number_idx
  on platform_outputs (content_profile_id, output_number desc nulls last);

create index platform_outputs_content_item_idx
  on platform_outputs (content_item_id);

create index platform_outputs_awaiting_approval_idx
  on platform_outputs (content_profile_id, output_status, review_status)
  where do_not_publish = false
    and (test_run_id is null or test_run_id = '');

create index platform_outputs_scheduled_range_idx
  on platform_outputs (content_profile_id, scheduled_post_date)
  where scheduled_post_date is not null;

create index platform_outputs_published_at_idx
  on platform_outputs (content_profile_id, published_at desc)
  where published_at is not null;

create index platform_outputs_pipeline_open_idx
  on platform_outputs (content_profile_id, output_number desc)
  where do_not_publish = false
    and (test_run_id is null or test_run_id = '')
    and output_status is distinct from 'Published'
    and output_status is distinct from 'Cancelled';

-- ---------------------------------------------------------------------------
-- Production request outputs (fan-out / planning bridge)
-- ---------------------------------------------------------------------------

create table production_request_outputs (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  production_request_id uuid references production_requests(id),
  platform_output_id uuid references platform_outputs(id),
  content_item_id uuid references content_items(id),
  organization_id uuid references organizations(id),
  brand_id uuid references brands(id),
  platform text,
  output_type text,
  aspect_ratio text,
  effective_resolution jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index production_request_outputs_request_idx
  on production_request_outputs (production_request_id);

-- ---------------------------------------------------------------------------
-- Variant / transfer queue
-- ---------------------------------------------------------------------------

create table studio_media_transfer_queue (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  source_media_asset_id uuid references media_assets(id),
  generated_media_asset_id uuid references media_assets(id),
  status text,
  error_message text,
  preview_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table studio_media_transfer_targets (
  transfer_id uuid not null references studio_media_transfer_queue(id) on delete cascade,
  production_request_output_id uuid not null references production_request_outputs(id) on delete cascade,
  primary key (transfer_id, production_request_output_id)
);

-- ---------------------------------------------------------------------------
-- Engagement / ops side tables (lower priority for Phase 2 read cutover)
-- ---------------------------------------------------------------------------

create table engagement_settings (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  payload jsonb not null default '{}'::jsonb
);

create table engagement_targets (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table engagement_actions (
  id uuid primary key default gen_random_uuid(),
  airtable_record_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

commit;
