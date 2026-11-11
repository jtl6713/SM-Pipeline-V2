-- Auth mirror densify for resolveAuthorization cutover (read flip is NOT in this slice).
-- Apply to the isolated Studio Supabase project only (not tasks-api).
-- Safe to re-run. Worker half-hour sync mirrors Airtable auth tables with or without
-- these extras; missing extras columns fall back to phase-1 scalars only.

begin;

alter table organizations
  add column if not exists organization_key text,
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table brands
  add column if not exists brand_key text,
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table studio_users
  add column if not exists user_key text,
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table studio_memberships
  add column if not exists membership_key text,
  add column if not exists is_default boolean not null default false,
  add column if not exists extras jsonb not null default '{}'::jsonb;

commit;
