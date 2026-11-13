-- Crop/variant attempt stamps, a stored content-item id for link filters,
-- and text copies of output JSON so substring FIND can leave Airtable.
-- Record deletion is not started.

alter table studio_media_transfer_queue
  add column if not exists attempt_count integer,
  add column if not exists last_attempt_at timestamptz;

create index if not exists studio_media_transfer_queue_status_attempt_idx
  on studio_media_transfer_queue (status, attempt_count);

alter table platform_outputs
  add column if not exists content_item_airtable_id text;

update platform_outputs as output_row
set content_item_airtable_id = content_row.airtable_record_id
from content_items as content_row
where output_row.content_item_id = content_row.id
  and output_row.content_item_airtable_id is distinct from content_row.airtable_record_id;

create index if not exists platform_outputs_content_item_airtable_idx
  on platform_outputs (content_item_airtable_id)
  where content_item_airtable_id is not null;

alter table platform_outputs
  add column if not exists selected_assets_text text generated always as (selected_assets::text) stored,
  add column if not exists creative_render_manifest_text text generated always as (creative_render_manifest::text) stored,
  add column if not exists render_clip_list_text text generated always as (render_clip_list::text) stored,
  add column if not exists remotion_props_text text generated always as (remotion_props::text) stored,
  add column if not exists platform_publish_response_text text generated always as (platform_publish_response::text) stored,
  add column if not exists insights_metrics_text text generated always as (insights_metrics::text) stored;
