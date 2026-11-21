-- READ ONLY: run against the independently verified production project.
-- This file does not apply the migration, insert synthetic data, or publish.
-- A missing index/RPC is expected BEFORE migration and a blocker AFTER it.
-- Inspect only aggregate duplicate counts, function ACL, and schema structure.
WITH
rpc AS (
  SELECT p.oid, p.prosecdef, p.proconfig
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.sm_pipeline_upsert_media_asset(text,text,text,jsonb)')
),
native_duplicates AS (
  SELECT count(*)::bigint AS duplicate_groups
  FROM (
    SELECT metadata ->> 'studio_transfer_id' AS transfer_id
    FROM public.media_assets
    WHERE left(coalesce(metadata ->> 'studio_transfer_id', ''), 5) = 'ngv2_'
    GROUP BY 1 HAVING count(*) > 1
  ) d
),
drive_duplicates AS (
  SELECT count(*)::bigint AS duplicate_groups
  FROM (
    SELECT google_drive_file_id AS drive_id
    FROM public.media_assets
    WHERE nullif(google_drive_file_id, '') IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) d
)
SELECT
  to_regclass('public.media_assets') IS NOT NULL AS media_assets_exists,
  to_regprocedure('public.sm_pipeline_upsert_media_asset(text,text,text,jsonb)') IS NOT NULL AS atomic_media_rpc_exists,
  coalesce((SELECT NOT prosecdef FROM rpc), false) AS media_rpc_security_invoker,
  coalesce((SELECT 'search_path=' = ANY(proconfig) FROM rpc), false) AS media_rpc_empty_search_path,
  exists (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='media_assets'
      AND indexname='media_assets_ngv2_transfer_uidx'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%studio_transfer_id%'
      AND indexdef ILIKE '%ngv2_%'
  ) AS scoped_native_unique_index_exists,
  exists (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='media_assets'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%google_drive_file_id%'
  ) AS drive_id_unique_index_exists,
  (SELECT duplicate_groups FROM native_duplicates) AS duplicate_native_groups,
  (SELECT duplicate_groups FROM drive_duplicates) AS duplicate_drive_groups,
  coalesce((SELECT has_function_privilege('anon', oid, 'EXECUTE') FROM rpc), false) AS anon_can_execute_media_rpc,
  coalesce((SELECT has_function_privilege('authenticated', oid, 'EXECUTE') FROM rpc), false) AS authenticated_can_execute_media_rpc,
  coalesce((SELECT has_function_privilege('service_role', oid, 'EXECUTE') FROM rpc), false) AS service_role_can_execute_media_rpc;
