-- Phase 1 POC benchmark queries for an isolated Supabase project.
-- Compare wall-clock times against equivalent Airtable filterByFormula list calls.
-- Replace :profile_id / date bounds with real UUIDs after import.

-- A) Content items for a profile (newest first)
explain analyze
select id, content_number, content_title, content_status, created_at
from content_items
where content_profile_id = :'profile_id'::uuid
order by created_at desc nulls last
limit 100;

-- B) Platform outputs for one content item
explain analyze
select id, output_number, platform, format, output_status, review_status, publish_status,
       scheduled_post_date, thumbnail_url, final_file_url
from platform_outputs
where content_item_id = :'content_item_id'::uuid
order by output_number;

-- C) Items awaiting approval (Factory / Open Review)
explain analyze
select po.id, po.output_number, po.platform, po.output_status, po.review_status,
       ci.content_number, ci.content_title
from platform_outputs po
left join content_items ci on ci.id = po.content_item_id
where po.content_profile_id = :'profile_id'::uuid
  and po.do_not_publish = false
  and coalesce(po.test_run_id, '') = ''
  and (
    po.output_status = 'Ready for Review'
    or po.review_status = 'Review Sent'
  )
  and po.review_status is distinct from 'Approved'
  and po.output_status is distinct from 'Approved for Publishing'
  and po.output_status is distinct from 'Published'
order by po.output_number desc
limit 80;

-- D) Scheduled outputs in a date range (Pipeline schedule grid)
explain analyze
select po.id, po.output_number, po.platform, po.output_title, po.scheduled_post_date,
       po.publish_status, po.output_status,
       ci.content_number, ci.content_title
from platform_outputs po
left join content_items ci on ci.id = po.content_item_id
where po.content_profile_id = :'profile_id'::uuid
  and po.scheduled_post_date > :'range_start'::timestamptz
  and po.scheduled_post_date < :'range_end'::timestamptz
order by po.scheduled_post_date asc
limit 500;

-- E) Published outputs (insights / archive)
explain analyze
select id, output_number, platform, published_at, platform_post_url
from platform_outputs
where content_profile_id = :'profile_id'::uuid
  and published_at is not null
order by published_at desc
limit 100;

-- F) Lookup by content number
explain analyze
select *
from content_items
where content_number = :content_number;

-- G) Pipeline-style join: newest outputs + parent labels in one query
explain analyze
select
  po.id,
  po.output_number,
  po.platform,
  po.format,
  po.output_status,
  po.render_status,
  po.review_status,
  po.publish_status,
  po.scheduled_post_date,
  po.thumbnail_url,
  po.final_file_url,
  po.selected_clip_count,
  ci.content_number,
  ci.content_title
from platform_outputs po
left join content_items ci on ci.id = po.content_item_id
where po.content_profile_id = :'profile_id'::uuid
order by po.output_number desc nulls last
limit 250;

-- H) Schedule occupancy window (replaces STUDIO_OCCUPIED_LIST_LIMIT=800 / 28d scan)
explain analyze
select platform, scheduled_post_date, youtube_scheduled_publish_at, studio_scheduled_at,
       publish_status, studio_output_type, format
from platform_outputs
where content_profile_id = :'profile_id'::uuid
  and scheduled_post_date is not null
  and scheduled_post_date > (now() - interval '12 hours')
  and scheduled_post_date < (now() + interval '28 days')
order by scheduled_post_date asc
limit 800;

-- I) Unfinished pipeline open pack + siblings (replaces multi-scan open pack)
explain analyze
with open_outputs as (
  select *
  from platform_outputs
  where content_profile_id = :'profile_id'::uuid
    and do_not_publish = false
    and coalesce(test_run_id, '') = ''
    and output_status is distinct from 'Published'
    and output_status is distinct from 'Cancelled'
  order by output_number desc nulls last
  limit 1000
),
open_content as (
  select distinct content_item_id
  from open_outputs
  where content_item_id is not null
)
select po.*, ci.content_number, ci.content_title
from platform_outputs po
join open_content oc on oc.content_item_id = po.content_item_id
left join content_items ci on ci.id = po.content_item_id
where po.content_profile_id = :'profile_id'::uuid
order by po.output_number desc;
