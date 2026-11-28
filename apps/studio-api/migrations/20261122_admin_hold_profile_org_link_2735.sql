-- Issue #2735. The canonical Supabase profile writer sends null organization_id
-- when importing legacy-shaped profiles. Derive tenant scope from the unique
-- brand-to-organization association instead of permitting nulling an existing
-- authorized profile. Do not guess when brands are missing or ambiguous.
create or replace function public.enrich_content_profile_organization_2735()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  resolved_org uuid;
  org_count integer;
begin
  if new.organization_id is null and nullif(btrim(new.brand_name),'') is not null then
    select min(b.organization_id::text)::uuid, count(distinct b.organization_id)
      into resolved_org, org_count
    from public.brands b
    where b.name = new.brand_name and b.organization_id is not null;
    if org_count = 1 then
      new.organization_id := resolved_org;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enrich_content_profile_organization_2735 on public.content_profiles;
create trigger enrich_content_profile_organization_2735
  before insert or update of organization_id,brand_name on public.content_profiles
  for each row execute function public.enrich_content_profile_organization_2735();

-- Only backfill where an unambiguous canonical brand match exists.
with resolved as (
 select cp.id as profile_uuid,min(b.organization_id::text)::uuid as org_uuid
 from public.content_profiles cp join public.brands b on b.name=cp.brand_name
 where cp.organization_id is null and b.organization_id is not null
 group by cp.id
 having count(distinct b.organization_id)=1
)
update public.content_profiles cp
set organization_id=resolved.org_uuid
from resolved
where cp.id=resolved.profile_uuid and cp.organization_id is null;

comment on function public.enrich_content_profile_organization_2735() is
  'Preserves safe tenant attribution of content profiles when legacy-shaped write-through upserts omit the organization FK; never assigns an ambiguous brand to an organization.';
