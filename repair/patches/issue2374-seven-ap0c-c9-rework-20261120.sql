-- Issue #2374: source mirror for seven already-applied production Supabase
-- corrections, 2026-11-20 CST. DO NOT replay against a changed cohort.
-- Original cohort remains auditable; this is NOT a post, successful
-- publication receipt, or authorization to regenerate/publish without review.
--
-- Precisely these seven Instagram carousels had:
--   * review Approved + Approved for Publishing with expired schedule
--   * AP0C Asset Preparation failed: no C9 final slides
--   * zero linked carousel_slides and no parent/published provider ID
--   * no active Publish_Locked_By
-- They were moved to protected Changes Requested with original schedules
-- and status snapshots stored under Studio_Overdue_Preflight_Repair_20261120.
--
-- The following transaction is the exact pre-state-guarded correction. It
-- fails if it cannot update all seven, and does not edit any other output.
BEGIN;
DO $exact_rework$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.platform_outputs po
  WHERE po.output_number IN (10635,10678,10700,10734,10762,10813,10821)
    AND po.platform='Instagram'
    AND po.platform_output_type='Instagram Carousel'
    AND po.review_status='Approved'
    AND po.output_status='Approved for Publishing'
    AND po.published_at IS NULL
    AND nullif(trim(po.platform_post_url),'') IS NULL
    AND po.error_messages->>'IG_Carousel_Error_Stage'='AP0C Asset Preparation'
    AND po.error_messages->>'IG_Carousel_Error_Message'='AP0C found no C9 final slides for this output.'
    AND po.error_messages->>'IG_Carousel_Last_Completed_Stage'='None'
    AND nullif(po.error_messages->>'IG_Carousel_Parent_Container_ID','') IS NULL
    AND nullif(po.error_messages->>'IG_Carousel_Published_Media_ID','') IS NULL
    AND nullif(po.error_messages->>'Publish_Locked_By','') IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.carousel_slides cs
      WHERE jsonb_typeof(cs.fields->'Platform Output')='array'
        AND cs.fields->'Platform Output' @> to_jsonb(ARRAY[po.airtable_record_id])
    );
  IF n <> 7 THEN RAISE EXCEPTION
    'Issue 2374 exact C9 rework pre-state changed: %',n; END IF;

  UPDATE public.platform_outputs po SET
    error_messages=coalesce(po.error_messages,'{}'::jsonb) ||
      jsonb_build_object('Studio_Overdue_Preflight_Repair_20261120',
        jsonb_build_object(
          'action','Rebuild C9 final 4:5 gallery slides, confirm media location and branding, preview and obtain fresh Factory approval; new MAE schedule only after approval',
          'reason','AP0C failed before provider creation: zero C9 carousel_slides records for original approved output',
          'stage','AP0C Asset Preparation',
          'prior_schedule',po.scheduled_post_date,
          'prior_publish_status',po.publish_status,
          'prior_review_status',po.review_status,
          'prior_output_status',po.output_status,
          'audited_at',now(),
          'provider_publication_unverified',true,
          'no_external_creation_identity_found',true,
          'publish_retry_authorized',false
        )),
    output_status='Changes Requested',
    review_status='Changes Requested',
    publish_status='Not Ready',
    scheduled_post_date=NULL,
    do_not_publish=true,
    auto_publish_enabled=false,
    publish_retry_eligible=false,
    publish_next_retry_at=NULL
  WHERE po.output_number IN (10635,10678,10700,10734,10762,10813,10821)
    AND po.platform='Instagram'
    AND po.platform_output_type='Instagram Carousel'
    AND po.review_status='Approved'
    AND po.output_status='Approved for Publishing'
    AND po.published_at IS NULL
    AND nullif(trim(po.platform_post_url),'') IS NULL
    AND po.error_messages->>'IG_Carousel_Error_Stage'='AP0C Asset Preparation'
    AND po.error_messages->>'IG_Carousel_Error_Message'='AP0C found no C9 final slides for this output.'
    AND po.error_messages->>'IG_Carousel_Last_Completed_Stage'='None'
    AND nullif(po.error_messages->>'IG_Carousel_Parent_Container_ID','') IS NULL
    AND nullif(po.error_messages->>'IG_Carousel_Published_Media_ID','') IS NULL
    AND nullif(po.error_messages->>'Publish_Locked_By','') IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.carousel_slides cs
      WHERE jsonb_typeof(cs.fields->'Platform Output')='array'
        AND cs.fields->'Platform Output' @> to_jsonb(ARRAY[po.airtable_record_id])
    );
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION
    'Issue 2374 C9 rework update mismatch: %',n; END IF;
END $exact_rework$;
COMMIT;

-- Current live verification, safe to rerun:
SELECT output_number, output_status, review_status, publish_status,
       scheduled_post_date, do_not_publish, auto_publish_enabled,
       publish_retry_eligible,
       (error_messages ? 'Studio_Overdue_Preflight_Repair_20261120') AS rework_marker
FROM public.platform_outputs
WHERE output_number IN (10635,10678,10700,10734,10762,10813,10821)
ORDER BY output_number;
