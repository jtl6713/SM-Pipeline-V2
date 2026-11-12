-- Render-heal columns copied from Airtable. Airtable remains the write source of truth.
-- These columns are patched on their own. They do not mark a lean cron row complete.
-- Phase 7 retirement is not started.

alter table public.platform_outputs
  add column if not exists output_filename text,
  add column if not exists render_total_frames integer,
  add column if not exists final_file_storage_status text,
  add column if not exists render_heal_fields jsonb;

comment on column public.platform_outputs.render_clip_list is
  'Copy of Airtable Render_Clip_List_JSON for render heals. Not a lean-row completion marker.';
comment on column public.platform_outputs.remotion_props is
  'Copy of Airtable Remotion_Props_JSON for render heals. Not a lean-row completion marker.';
comment on column public.platform_outputs.render_heal_fields is
  'Timing and voiceover fields the render queue heal reads. Not a lean-row completion marker.';
