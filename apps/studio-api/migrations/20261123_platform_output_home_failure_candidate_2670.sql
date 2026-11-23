-- #2670: exact, indexed Quality Agent home failure candidates.
-- PostgREST's previous multi-field ILIKE OR (including 9 JSON errors)
-- returned PostgreSQL 57014 on three 100-row page GETs 03:02:39-44 UTC.
-- Baseline: 10,269 canonical outputs, 247 matching rows on 2026-11-23.
-- STORED expression recomputes on both old and future rows without an
-- unreliable async cache or any Airtable/Make write. No publishing fields
-- or Do_Not_Publish flags change. Test_run_id is checked in the query/index.
ALTER TABLE public.platform_outputs
  ADD COLUMN IF NOT EXISTS home_failure_candidate boolean
  GENERATED ALWAYS AS (
    (lower(coalesce(output_status, '')) LIKE '%failed%' OR lower(coalesce(output_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(render_status, '')) LIKE '%failed%' OR lower(coalesce(render_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(publish_status, '')) LIKE '%failed%' OR lower(coalesce(publish_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(ig_carousel_status, '')) LIKE '%failed%' OR lower(coalesce(ig_carousel_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(tiktok_draft_status, '')) LIKE '%failed%' OR lower(coalesce(tiktok_draft_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(fb_publish_status, '')) LIKE '%failed%' OR lower(coalesce(fb_publish_status, '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'Asset_Selection_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'Asset_Selection_Status', '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'IG_Carousel_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'IG_Carousel_Status', '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'FB_Slideshow_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'FB_Slideshow_Status', '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'YouTube_Package_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'YouTube_Package_Status', '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'YouTube_Upload_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'YouTube_Upload_Status', '')) LIKE '%error%')
    OR
    (lower(coalesce(error_messages->>'YouTube_Processing_Status', '')) LIKE '%failed%' OR lower(coalesce(error_messages->>'YouTube_Processing_Status', '')) LIKE '%error%')
    OR
    nullif(btrim(coalesce(error_messages->>'Publish_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'Remotion_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'Final_File_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'IG_Carousel_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'Music_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'FB_Slideshow_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'YouTube_Error_Message', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'YouTube_Processing_Failure_Reason', '')), '') IS NOT NULL
    OR
    nullif(btrim(coalesce(error_messages->>'YouTube_Rejection_Reason', '')), '') IS NOT NULL
  ) STORED;

-- The QA display orders by output number, then canonical record ID. The
-- narrow partial index excludes irrelevant 10k nonfailure rows and test runs.
CREATE INDEX IF NOT EXISTS platform_outputs_home_failure_candidates_2670_idx
  ON public.platform_outputs (output_number ASC NULLS LAST, airtable_record_id ASC)
  WHERE home_failure_candidate = TRUE AND test_run_id IS NULL;

COMMENT ON COLUMN public.platform_outputs.home_failure_candidate IS
  'QA Home failure predicate: six typed statuses, six JSONB statuses, nine JSONB errors. Auto maintained, avoids 57014 multicolumn ILIKE OR; do not use as publishing authorization.';
