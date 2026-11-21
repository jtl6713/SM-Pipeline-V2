-- Supabase-only media catalog claim. Roll out to production only after
-- checking duplicate ngv2 identities and confirming the active environment.
-- Legacy transfer IDs are NOT globally unique; only new ngv2_ keys are.
create unique index if not exists media_assets_ngv2_transfer_uidx
on public.media_assets ((metadata ->> 'studio_transfer_id'))
where left(coalesce(metadata ->> 'studio_transfer_id', ''), 5) = 'ngv2_';

create or replace function public.sm_pipeline_upsert_media_asset(
  p_merge_field text,
  p_merge_value text,
  p_record_id text,
  p_asset jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  existing public.media_assets%rowtype;
  created boolean := false;
  incoming_metadata jsonb;
begin
  if p_merge_field not in ('Google Drive File ID', 'Studio_Transfer_ID') then
    raise exception 'Unsupported media merge field' using errcode = '22023';
  end if;
  if p_merge_value is null or btrim(p_merge_value) = '' or
     p_record_id !~ '^rec[A-Za-z0-9]{14}$' or
     jsonb_typeof(p_asset) is distinct from 'object' or
     nullif(btrim(p_asset ->> 'asset_name'), '') is null then
    raise exception 'Invalid media claim input' using errcode = '22023';
  end if;
  -- Existing legacy transfer IDs repeat. Enforce uniqueness only on
  -- deterministic native-gallery keys with a dedicated partial index.
  if p_merge_field = 'Studio_Transfer_ID' and
     (left(p_merge_value, 5) <> 'ngv2_' or
      p_asset #>> '{metadata,studio_transfer_id}' is distinct from p_merge_value) then
    raise exception 'Native-gallery transfer identity mismatch' using errcode = '22023';
  end if;
  if p_merge_field = 'Google Drive File ID' and
     p_asset ->> 'google_drive_file_id' is distinct from p_merge_value then
    raise exception 'Google Drive file identity mismatch' using errcode = '22023';
  end if;
  incoming_metadata := coalesce(p_asset -> 'metadata', '{}'::jsonb);
  if jsonb_typeof(incoming_metadata) <> 'object' then
    raise exception 'Invalid media metadata' using errcode = '22023';
  end if;

  -- Transactional lock serializes matching callers even when a file is
  -- registered concurrently. Both indexed identities also enforce this
  -- against non-RPC writers.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sm-pipeline/media/' || p_merge_field || '/' || p_merge_value, 0)
  );

  if p_merge_field = 'Google Drive File ID' then
    select * into existing from public.media_assets
      where google_drive_file_id = p_merge_value for update;
  else
    select * into existing from public.media_assets
      where metadata ->> 'studio_transfer_id' = p_merge_value for update;
  end if;

  if not found then
    insert into public.media_assets (
      airtable_record_id, asset_name, media_class, asset_role, asset_status,
      active, do_not_use, studio_favorite, google_drive_file_id,
      google_drive_url, mime_type, file_extension, file_size_bytes, metadata
    ) values (
      p_record_id, p_asset ->> 'asset_name',
      p_asset ->> 'media_class', p_asset ->> 'asset_role', p_asset ->> 'asset_status',
      coalesce((p_asset ->> 'active')::boolean, true),
      coalesce((p_asset ->> 'do_not_use')::boolean, false),
      coalesce((p_asset ->> 'studio_favorite')::boolean, false),
      p_asset ->> 'google_drive_file_id', p_asset ->> 'google_drive_url',
      p_asset ->> 'mime_type', p_asset ->> 'file_extension',
      (p_asset ->> 'file_size_bytes')::bigint, incoming_metadata
    )
    on conflict do nothing returning * into existing;
    created := found;
    if not found then
      -- A conflicting insert by another writer may have won the race.
      -- If its merge identity cannot be located, the conflict is on another
      -- key (e.g. duplicate minted ID or Drive ID) and must not be hidden.
      if p_merge_field = 'Google Drive File ID' then
        select * into existing from public.media_assets
          where google_drive_file_id = p_merge_value for update;
      else
        select * into existing from public.media_assets
          where metadata ->> 'studio_transfer_id' = p_merge_value for update;
      end if;
      if not found then
        raise exception 'Media identity conflict requires reconciliation' using errcode = '23505';
      end if;
    end if;
  end if;

  if not created then
    -- Guard immutable file identity on native-gallery claims.
    if p_merge_field = 'Studio_Transfer_ID' and
       nullif(existing.google_drive_file_id, '') is distinct from
       nullif(p_asset ->> 'google_drive_file_id', '') then
      raise exception 'Native-gallery key claimed by another Drive file' using errcode = '23505';
    end if;

    update public.media_assets set
      asset_name = case when p_asset ? 'asset_name' then p_asset ->> 'asset_name' else existing.asset_name end,
      media_class = case when p_asset ? 'media_class' then p_asset ->> 'media_class' else existing.media_class end,
      asset_role = case when p_asset ? 'asset_role' then p_asset ->> 'asset_role' else existing.asset_role end,
      asset_status = case when p_asset ? 'asset_status' then p_asset ->> 'asset_status' else existing.asset_status end,
      active = case when p_asset ? 'active' then (p_asset ->> 'active')::boolean else existing.active end,
      do_not_use = case when p_asset ? 'do_not_use' then (p_asset ->> 'do_not_use')::boolean else existing.do_not_use end,
      studio_favorite = case when p_asset ? 'studio_favorite' then (p_asset ->> 'studio_favorite')::boolean else existing.studio_favorite end,
      google_drive_file_id = case when p_asset ? 'google_drive_file_id' then p_asset ->> 'google_drive_file_id' else existing.google_drive_file_id end,
      google_drive_url = case when p_asset ? 'google_drive_url' then p_asset ->> 'google_drive_url' else existing.google_drive_url end,
      mime_type = case when p_asset ? 'mime_type' then p_asset ->> 'mime_type' else existing.mime_type end,
      file_extension = case when p_asset ? 'file_extension' then p_asset ->> 'file_extension' else existing.file_extension end,
      file_size_bytes = case when p_asset ? 'file_size_bytes' then (p_asset ->> 'file_size_bytes')::bigint else existing.file_size_bytes end,
      metadata = coalesce(existing.metadata, '{}'::jsonb) || incoming_metadata,
      updated_at = now()
    where id = existing.id
    returning * into existing;
    if not found then
      raise exception 'Media update not confirmed' using errcode = 'P0001';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', existing.airtable_record_id,
    'created', created,
    'google_drive_file_id', existing.google_drive_file_id,
    'studio_transfer_id', existing.metadata ->> 'studio_transfer_id'
  );
end
$function$;

-- Public functions default to PUBLIC EXECUTE. This RPC is server-only.
revoke all on function public.sm_pipeline_upsert_media_asset(text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.sm_pipeline_upsert_media_asset(text,text,text,jsonb)
  to service_role;
