-- READ-ONLY / single live production Supabase QA ledger acceptance.
-- Safe to execute BEFORE migration (returns ready=false), and AFTER migration.
-- No schema/data mutations, no role creation, no transactions or secrets.
-- A green result validates table shape/security only; never release approval.
with target(table_name, id_constraint, event_table) as (
  values
    ('studio_qa_runs'::text, 'studio_qa_runs_run_id_key'::text, false),
    ('studio_qa_events'::text, 'studio_qa_events_execution_id_key'::text, true)
), discovered as (
  select
    t.*, c.oid as table_oid, c.relrowsecurity as rls_enabled,
    (c.relpersistence = 'p' and c.relkind in ('r','p')) as permanent_table
  from target t
  left join pg_class c
    on c.oid = to_regclass('public.' || t.table_name)
), assertions as (
  select d.*,
    coalesce(has_table_privilege('anon', d.table_oid, 'SELECT'),false) as anon_select,
    coalesce(has_table_privilege('anon', d.table_oid, 'INSERT'),false) as anon_insert,
    coalesce(has_table_privilege('anon', d.table_oid, 'UPDATE'),false) as anon_update,
    coalesce(has_table_privilege('anon', d.table_oid, 'DELETE'),false) as anon_delete,
    coalesce(has_table_privilege('authenticated', d.table_oid, 'SELECT'),false) as authenticated_select,
    coalesce(has_table_privilege('authenticated', d.table_oid, 'INSERT'),false) as authenticated_insert,
    coalesce(has_table_privilege('authenticated', d.table_oid, 'UPDATE'),false) as authenticated_update,
    coalesce(has_table_privilege('authenticated', d.table_oid, 'DELETE'),false) as authenticated_delete,
    coalesce(has_table_privilege('service_role', d.table_oid, 'SELECT'),false) as service_select,
    coalesce(has_table_privilege('service_role', d.table_oid, 'INSERT'),false) as service_insert,
    coalesce(has_table_privilege('service_role', d.table_oid, 'UPDATE'),false) as service_update,
    coalesce(has_table_privilege('service_role', d.table_oid, 'DELETE'),false) as service_delete,
    exists(
      select 1 from pg_constraint k
      where k.conrelid = d.table_oid and k.contype='u'
      and k.conname=d.id_constraint
    ) as unique_identity,
    exists(
      select 1 from pg_constraint k
      where k.conrelid=d.table_oid and k.contype='u'
      and k.conname=d.table_name || '_idempotency_key_key'
    ) as unique_idempotency,
    exists(
      select 1 from pg_constraint k
      where k.conrelid=d.table_oid and k.contype='u'
      and k.conname=d.table_name || '_legacy_record_id_key'
    ) as unique_legacy_source_identity,
    (not d.event_table or exists(
      select 1 from pg_constraint k
      where k.conrelid=d.table_oid and k.contype='f'
        and k.confrelid=to_regclass('public.studio_qa_runs')
        and k.conname='studio_qa_events_run_id_fkey'
    )) as event_references_runs,
    exists(
      select 1 from pg_trigger tr
      where tr.tgrelid=d.table_oid and not tr.tgisinternal
        and tr.tgenabled='O'
        and (tr.tgtype & 1)=1 -- row
        and (tr.tgtype & 2)=2 -- before
        and (tr.tgtype & 24)=24 -- both UPDATE and DELETE
        and tr.tgfoid=to_regprocedure('public.studio_qa_reject_mutation()')
    ) as append_only_trigger,
    exists(
      select 1 from pg_constraint k
      where k.conrelid=d.table_oid and k.contype='c'
        and k.conname=case when d.event_table
          then 'studio_qa_event_legacy_triple'
          else 'studio_qa_run_legacy_triple' end
    ) as legacy_provenance_atomic,
    exists(
      select 1 from pg_constraint k
      where k.conrelid=d.table_oid and k.contype='c'
        and k.conname=case when d.event_table
          then 'studio_qa_event_hash'
          else 'studio_qa_run_hash' end
    ) as hash_rule,
    (
      select count(*) from pg_policy p
      where p.polrelid=d.table_oid
    ) as direct_rls_policy_count
  from discovered d
)
select
  table_name,
  table_oid is not null as exists,
  coalesce(permanent_table,false) as permanent_table,
  coalesce(rls_enabled,false) as rls_enabled,
  not (anon_select or anon_insert or anon_update or anon_delete) as anon_denied,
  not (authenticated_select or authenticated_insert or authenticated_update or authenticated_delete) as authenticated_denied,
  (service_select and service_insert and not service_update and not service_delete) as service_insert_select_only,
  unique_identity, unique_idempotency, unique_legacy_source_identity,
  event_references_runs, append_only_trigger,
  legacy_provenance_atomic, hash_rule,
  direct_rls_policy_count=0 as no_direct_browser_rls_policy,
  (
    table_oid is not null and coalesce(permanent_table,false)
    and coalesce(rls_enabled,false)
    and not (anon_select or anon_insert or anon_update or anon_delete)
    and not (authenticated_select or authenticated_insert or authenticated_update or authenticated_delete)
    and service_select and service_insert and not service_update and not service_delete
    and unique_identity and unique_idempotency and unique_legacy_source_identity
    and event_references_runs and append_only_trigger
    and legacy_provenance_atomic and hash_rule
    and direct_rls_policy_count=0
  ) as qa_table_ready
from assertions order by table_name;
