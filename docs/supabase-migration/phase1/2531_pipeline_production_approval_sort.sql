-- #2531: indexed Production approval ordering before LIMIT/OFFSET.
-- Production approval is Production Request Submitted_At, not Factory review.
alter table public.platform_outputs add column if not exists production_approved_at timestamptz;

create or replace function public.pipeline_production_approved_stamp(raw text)
returns timestamptz language plpgsql immutable as $$
begin
  if raw is null or raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return null; end if;
  return raw::timestamptz;
exception when others then return null;
end $$;

create or replace function public.pipeline_sync_production_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.platform_outputs po
     set production_approved_at = public.pipeline_production_approved_stamp(new.publish_status->>'Submitted_At')
    from public.content_items ci
   where ci.id = po.content_item_id and ci.production_request_id = new.id
     and po.production_approved_at is distinct from public.pipeline_production_approved_stamp(new.publish_status->>'Submitted_At');
  return new;
end $$;

drop trigger if exists pipeline_sync_production_approval on public.production_requests;
create trigger pipeline_sync_production_approval
after update of publish_status on public.production_requests
for each row execute function public.pipeline_sync_production_approval();

update public.platform_outputs po
   set production_approved_at = public.pipeline_production_approved_stamp(pr.publish_status->>'Submitted_At')
  from public.content_items ci
  join public.production_requests pr on pr.id = ci.production_request_id
 where po.content_item_id = ci.id
   and po.production_approved_at is distinct from public.pipeline_production_approved_stamp(pr.publish_status->>'Submitted_At');

create index if not exists platform_outputs_profile_production_approved_idx
on public.platform_outputs (content_profile_id, production_approved_at desc nulls last, created_at desc, output_number desc, id desc)
where test_run_id is null;
