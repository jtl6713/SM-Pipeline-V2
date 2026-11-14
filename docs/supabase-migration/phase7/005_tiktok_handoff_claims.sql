-- Unique TikTok handoff claims are coordination only; Airtable remains output write authority.
create table if not exists public.tiktok_handoff_claims (
  claim_key text primary key,
  output_record_id text not null,
  publish_id text not null,
  claimed_at timestamptz not null default now()
);
alter table public.tiktok_handoff_claims enable row level security;
revoke all on public.tiktok_handoff_claims from anon, authenticated;
create or replace function public.claim_tiktok_handoff(
  p_claim_key text, p_output_record_id text, p_publish_id text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare inserted integer;
begin
  if length(coalesce(p_claim_key,'')) < 10
     or length(coalesce(p_output_record_id,'')) < 10
     or length(coalesce(p_publish_id,'')) < 1 then
    raise exception 'invalid TikTok handoff claim';
  end if;
  insert into public.tiktok_handoff_claims(claim_key,output_record_id,publish_id)
  values (p_claim_key,p_output_record_id,p_publish_id)
  on conflict (claim_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end $$;
revoke all on function public.claim_tiktok_handoff(text,text,text) from public, anon, authenticated;
grant execute on function public.claim_tiktok_handoff(text,text,text) to service_role;
