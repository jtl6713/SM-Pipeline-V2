-- Phase 5: Home read-path index preparation ONLY.
-- Airtable remains the write source; no read flag or write authority changes.
-- Run each statement separately in the designated SM-Pipeline Supabase project,
-- outside an explicit transaction. CONCURRENTLY avoids write-blocking table locks.
-- Inspect pg_stat_activity and existing index names first; rollback with
-- DROP INDEX CONCURRENTLY IF EXISTS <name> if the new index is not beneficial.
--
-- Existing schema already has indexes on (content_profile_id, output_number),
-- (content_profile_id, scheduled_post_date), and a partial approval index.
-- These are complementary for status aggregates and incrementally changed rows.

CREATE INDEX CONCURRENTLY IF NOT EXISTS platform_outputs_home_status_idx
  ON public.platform_outputs (content_profile_id, output_status, review_status, publish_status)
  INCLUDE (platform, scheduled_post_date, updated_at)
  WHERE do_not_publish = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS platform_outputs_home_updated_idx
  ON public.platform_outputs (updated_at, content_profile_id)
  WHERE do_not_publish = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idea_candidates_home_profile_updated_idx
  ON public.idea_candidates (content_profile_id, updated_at);

-- Read-only smoke plan (run separately AFTER indexes exist):
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT content_profile_id, platform, output_status, review_status, publish_status, count(*)
-- FROM public.platform_outputs
-- WHERE content_profile_id IN (SELECT id FROM public.content_profiles WHERE active)
--   AND do_not_publish = false
-- GROUP BY content_profile_id, platform, output_status, review_status, publish_status;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT content_profile_id, count(*)
-- FROM public.idea_candidates
-- WHERE content_profile_id IN (SELECT id FROM public.content_profiles WHERE active)
-- GROUP BY content_profile_id;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT airtable_record_id, content_profile_id, updated_at
-- FROM public.platform_outputs
-- WHERE updated_at >= now() - interval '15 seconds'
--   AND do_not_publish = false
-- ORDER BY updated_at DESC LIMIT 250;
--
-- Even when these plans are fast, never enable Home Supabase reads without
-- three completed Phase-5 half-hour syncs, mirror parity, and healthy pool
-- metrics. Existing Studio read wall and 15-minute circuit remain active.
