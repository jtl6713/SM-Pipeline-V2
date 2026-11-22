-- #2735: central, tamper-evident publishing-hold metadata and event history.
-- Deploy this schema before enabling the Administration publishing-holds UI.
alter table public.platform_outputs
  add column if not exists publish_hold_reason text,
  add column if not exists publish_hold_source text,
  add column if not exists publish_hold_actor text,
  add column if not exists publish_hold_set_at timestamptz,
  add column if not exists publish_hold_release_note text,
  add column if not exists publish_hold_release_actor text,
  add column if not exists publish_hold_released_at timestamptz;

create table if not exists public.platform_output_hold_events (
  id bigint generated always as identity primary key,
  output_uuid uuid not null,
  output_record_id text,
  operation text not null check (operation in ('held','released')),
  reason text not null,
  source text not null,
  actor text not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_platform_output_hold_events_record
  on public.platform_output_hold_events (output_record_id,occurred_at desc);
alter table public.platform_output_hold_events enable row level security;
revoke all on public.platform_output_hold_events from public, anon, authenticated;
grant select, insert on public.platform_output_hold_events to service_role;
grant usage, select on sequence public.platform_output_hold_events_id_seq to service_role;

create or replace function public.stamp_platform_output_publish_hold()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  was_held boolean := false;
  previous_reason text;
  previous_source text;
  previous_actor text;
  supplied_reason text;
begin
  if tg_op = 'UPDATE' then
    was_held := old.do_not_publish is true;
    previous_reason := old.publish_hold_reason;
    previous_source := old.publish_hold_source;
    previous_actor := old.publish_hold_actor;
  end if;
  if new.do_not_publish is true and not was_held then
    supplied_reason := nullif(btrim(new.publish_hold_reason),'');
    if supplied_reason is not distinct from nullif(btrim(previous_reason),'') then
      supplied_reason := null;
    end if;
    new.publish_hold_reason := coalesce(
      supplied_reason,
      nullif(btrim(new.error_messages->>'Publish_Hold_Reason'),''),
      nullif(btrim(new.error_messages->>'Studio_Hold_Reason'),''),
      case
        when lower(coalesce(new.error_messages->>'Studio_Render_Review_Hold_Active','')) in ('true','1')
          or coalesce(new.error_messages->>'Studio_Render_Review_Hold_ID','') <> ''
          then 'Creative review-owned publishing hold'
        when coalesce(new.error_messages->>'Factory_Review_Handoff_Safety_Hold_At','') <> ''
          then 'Factory review handoff safety hold'
        when coalesce(new.error_messages->>'Asset_Selection_Notes','') <> ''
          then left(new.error_messages->>'Asset_Selection_Notes',500)
        when lower(coalesce(new.render_status,'')) in ('blocked','failed')
          then 'Media or rendering blocked: ' || new.render_status
        when lower(coalesce(new.output_status,'')) in ('cancelled','skipped')
          then 'Output was cancelled or skipped'
        else 'System hold: creator did not provide a detailed reason'
      end
    );
    new.publish_hold_source := coalesce(
       case when new.publish_hold_source is distinct from previous_source
         then nullif(btrim(new.publish_hold_source),'') end,
       nullif(btrim(new.error_messages->>'Publish_Hold_Source'),''),'pipeline');
    new.publish_hold_actor := coalesce(
       case when new.publish_hold_actor is distinct from previous_actor
         then nullif(btrim(new.publish_hold_actor),'') end,'system');
    new.publish_hold_set_at := clock_timestamp();
    new.publish_hold_released_at := null;
    new.publish_hold_release_note := null;
    new.publish_hold_release_actor := null;
  elsif tg_op = 'UPDATE' and was_held and new.do_not_publish is distinct from true then
    new.publish_hold_released_at := clock_timestamp();
    new.publish_hold_release_note := coalesce(nullif(btrim(new.publish_hold_release_note),''),
       'Legacy/system release: no explicit note recorded');
    new.publish_hold_release_actor := coalesce(nullif(btrim(new.publish_hold_release_actor),''),'system');
  end if;
  return new;
end $$;

drop trigger if exists stamp_platform_output_publish_hold on public.platform_outputs;
create trigger stamp_platform_output_publish_hold
  before insert or update of do_not_publish on public.platform_outputs
  for each row execute function public.stamp_platform_output_publish_hold();

create or replace function public.audit_platform_output_publish_hold()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  was_held boolean := false;
begin
  if tg_op = 'UPDATE' then
    was_held := old.do_not_publish is true;
  end if;
  if new.do_not_publish is true and not was_held then
    insert into public.platform_output_hold_events
      (output_uuid,output_record_id,operation,reason,source,actor)
    values (new.id,new.airtable_record_id,'held',
      new.publish_hold_reason,new.publish_hold_source,new.publish_hold_actor);
  elsif tg_op = 'UPDATE' and was_held and new.do_not_publish is distinct from true then
    insert into public.platform_output_hold_events
      (output_uuid,output_record_id,operation,reason,source,actor)
    values (new.id,new.airtable_record_id,'released',
      new.publish_hold_release_note,'administration_or_pipeline',new.publish_hold_release_actor);
  end if;
  return null;
end $$;

drop trigger if exists audit_platform_output_publish_hold on public.platform_outputs;
create trigger audit_platform_output_publish_hold
  after insert or update of do_not_publish on public.platform_outputs
  for each row execute function public.audit_platform_output_publish_hold();

comment on table public.platform_output_hold_events is
  'Append-only publishing hold and release events. Read via authenticated Studio Worker only.';
