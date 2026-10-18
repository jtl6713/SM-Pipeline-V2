-- Index for DELETE/join by platform_output_id.
-- Without this, deletes against platform_outputs sequential-scan
-- production_request_outputs until statement_timeout (57014) and fill the pool (PGRST003).
--
-- Run outside a transaction (CONCURRENTLY). Verify first that the open-row index
-- from 001_core_schema.sql actually exists in production:
--
--   SELECT indexname
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND tablename IN ('platform_outputs', 'production_request_outputs')
--   ORDER BY 1;
--
-- Expected: platform_outputs_pipeline_open_idx and this new index after apply.

CREATE INDEX CONCURRENTLY IF NOT EXISTS production_request_outputs_platform_output_idx
  ON production_request_outputs (platform_output_id);
