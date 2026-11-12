-- Publish-queue inputs copied out of platform_outputs.error_messages.
-- Due-now flags stay computed at read time because they depend on now().
-- Record deletion is not started. Airtable is a frozen archive.

alter table platform_outputs
  add column if not exists publish_next_retry_at timestamptz,
  add column if not exists youtube_stage text,
  add column if not exists tiktok_draft_status text,
  add column if not exists auto_publish_enabled boolean,
  add column if not exists tiktok_draft_type text,
  add column if not exists asset_aspect_family text,
  add column if not exists image_count integer,
  add column if not exists image_output_selected boolean,
  add column if not exists fb_publish_status text,
  add column if not exists fb_image_publish_mode text,
  add column if not exists studio_effective_voiceover_mode text,
  add column if not exists studio_effective_background_music_mode text,
  add column if not exists publish_retry_eligible boolean,
  add column if not exists ig_carousel_status text,
  add column if not exists ig_carousel_next_retry_at timestamptz,
  add column if not exists ig_carousel_child_count integer,
  add column if not exists ig_carousel_children_ready_count integer,
  add column if not exists assets_ready_count integer,
  add column if not exists asset_set_revision text,
  add column if not exists tiktok_9x16_ready_count integer,
  add column if not exists fb_resolved_publish_mode text;

update platform_outputs set
  publish_next_retry_at = case
    when error_messages->>'Publish_Next_Retry_At' ~ '^[0-9]{4}-'
      then (error_messages->>'Publish_Next_Retry_At')::timestamptz else publish_next_retry_at end,
  youtube_stage = coalesce(nullif(error_messages->>'YouTube_Stage', ''), youtube_stage),
  tiktok_draft_status = coalesce(nullif(error_messages->>'TikTok_Draft_Status', ''), tiktok_draft_status),
  auto_publish_enabled = case lower(error_messages->>'Auto_Publish_Enabled')
    when 'true' then true when 'false' then false when '1' then true when '0' then false
    else auto_publish_enabled end,
  tiktok_draft_type = coalesce(nullif(error_messages->>'TikTok_Draft_Type', ''), tiktok_draft_type),
  asset_aspect_family = coalesce(nullif(error_messages->>'Asset_Aspect_Family', ''), asset_aspect_family),
  image_count = case when error_messages->>'Image_Count' ~ '^-?[0-9]+$'
    then (error_messages->>'Image_Count')::integer else image_count end,
  image_output_selected = case lower(error_messages->>'Image_Output_Selected')
    when 'true' then true when 'false' then false when '1' then true when '0' then false
    else image_output_selected end,
  fb_publish_status = coalesce(nullif(error_messages->>'FB_Publish_Status', ''), fb_publish_status),
  fb_image_publish_mode = coalesce(nullif(error_messages->>'FB_Image_Publish_Mode', ''), fb_image_publish_mode),
  studio_effective_voiceover_mode = coalesce(nullif(error_messages->>'Studio_Effective_Voiceover_Mode', ''), studio_effective_voiceover_mode),
  studio_effective_background_music_mode = coalesce(nullif(error_messages->>'Studio_Effective_Background_Music_Mode', ''), studio_effective_background_music_mode),
  publish_retry_eligible = case lower(error_messages->>'Publish_Retry_Eligible')
    when 'true' then true when 'false' then false when '1' then true when '0' then false
    else publish_retry_eligible end,
  ig_carousel_status = coalesce(nullif(error_messages->>'IG_Carousel_Status', ''), ig_carousel_status),
  ig_carousel_next_retry_at = case
    when error_messages->>'IG_Carousel_Next_Retry_At' ~ '^[0-9]{4}-'
      then (error_messages->>'IG_Carousel_Next_Retry_At')::timestamptz else ig_carousel_next_retry_at end,
  ig_carousel_child_count = case when error_messages->>'IG_Carousel_Child_Count' ~ '^-?[0-9]+$'
    then (error_messages->>'IG_Carousel_Child_Count')::integer else ig_carousel_child_count end,
  ig_carousel_children_ready_count = case when error_messages->>'IG_Carousel_Children_Ready_Count' ~ '^-?[0-9]+$'
    then (error_messages->>'IG_Carousel_Children_Ready_Count')::integer else ig_carousel_children_ready_count end,
  assets_ready_count = case when error_messages->>'Assets_Ready_Count' ~ '^-?[0-9]+$'
    then (error_messages->>'Assets_Ready_Count')::integer else assets_ready_count end,
  asset_set_revision = coalesce(nullif(error_messages->>'Asset_Set_Revision', ''), asset_set_revision),
  tiktok_9x16_ready_count = case when error_messages->>'TikTok_9x16_Ready_Count' ~ '^-?[0-9]+$'
    then (error_messages->>'TikTok_9x16_Ready_Count')::integer else tiktok_9x16_ready_count end,
  fb_resolved_publish_mode = coalesce(nullif(error_messages->>'FB_Resolved_Publish_Mode', ''), fb_resolved_publish_mode)
where error_messages is not null;
