-- Stored columns for the P3 "no platform outputs" view, content-number
-- lookups, and Production Request Output lookups. Record deletion is not started.

alter table content_items
  add column if not exists platform_output_count integer;

alter table platform_outputs
  add column if not exists content_number integer;

alter table platform_outputs
  add column if not exists production_request_output_text text
  generated always as (
    case
      when error_messages is null then ''
      when jsonb_typeof(error_messages->'Production_Request_Output') = 'array'
        then (error_messages->'Production_Request_Output')::text
      else coalesce(error_messages->>'Production_Request_Output', '')
    end
  ) stored;

update platform_outputs as output_row
set content_number = content_row.content_number
from content_items as content_row
where output_row.content_item_id = content_row.id
  and output_row.content_number is distinct from content_row.content_number;

update content_items as content_row
set platform_output_count = coalesce(counted.output_count, 0)
from (
  select content_item_id, count(*)::integer as output_count
  from platform_outputs
  where content_item_id is not null
  group by content_item_id
) as counted
where content_row.id = counted.content_item_id
  and content_row.platform_output_count is distinct from counted.output_count;

update content_items
set platform_output_count = 0
where platform_output_count is null;

create index if not exists content_items_platform_output_count_idx
  on content_items (platform_output_count);

create index if not exists platform_outputs_content_number_idx
  on platform_outputs (content_number)
  where content_number is not null;

create or replace function public.platform_outputs_set_content_number()
returns trigger
language plpgsql
as $$
begin
  if new.content_item_id is null then
    new.content_number := null;
  else
    select content_number into new.content_number
    from content_items
    where id = new.content_item_id;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_platform_output_count(target uuid)
returns void
language plpgsql
as $$
begin
  if target is null then
    return;
  end if;
  update content_items
  set platform_output_count = (
    select count(*)::integer
    from platform_outputs
    where content_item_id = target
  )
  where id = target;
end;
$$;

create or replace function public.platform_outputs_refresh_parent_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_platform_output_count(old.content_item_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and old.content_item_id is distinct from new.content_item_id then
    perform public.refresh_platform_output_count(old.content_item_id);
  end if;
  perform public.refresh_platform_output_count(new.content_item_id);
  return new;
end;
$$;

create or replace function public.content_items_refresh_output_numbers()
returns trigger
language plpgsql
as $$
begin
  if new.content_number is distinct from old.content_number then
    update platform_outputs
    set content_number = new.content_number
    where content_item_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_outputs_set_content_number on platform_outputs;
create trigger platform_outputs_set_content_number
  before insert or update of content_item_id on platform_outputs
  for each row execute function public.platform_outputs_set_content_number();

drop trigger if exists platform_outputs_refresh_parent_count on platform_outputs;
create trigger platform_outputs_refresh_parent_count
  after insert or update of content_item_id or delete on platform_outputs
  for each row execute function public.platform_outputs_refresh_parent_count();

drop trigger if exists content_items_refresh_output_numbers on content_items;
create trigger content_items_refresh_output_numbers
  after update of content_number on content_items
  for each row execute function public.content_items_refresh_output_numbers();
