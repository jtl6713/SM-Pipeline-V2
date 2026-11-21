-- Live Supabase migration: guard_la_rework_review_consistency_20261120
-- Applied to project vkwvscgisqsbuwagdvtb on 2026-11-20 CST.
-- Addresses worker/runner status regression on *explicitly identified* LA
-- wrong-media and missing-gallery outputs. The guard never authorizes publishing.
-- A proper re-render/re-review flow must first transition review_status out of
-- 'Changes Requested' and obtain a new human approval.
CREATE OR REPLACE FUNCTION public.guard_la_rework_review_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.do_not_publish IS TRUE
     AND NEW.review_status = 'Changes Requested'
     AND (COALESCE(NEW.error_messages,'{}'::jsonb) ? 'Studio_LA_Media_Mismatch_Repair'
          OR COALESCE(NEW.error_messages,'{}'::jsonb) ? 'Studio_LA_Gallery_Preflight_Repair')
     AND NEW.output_status = 'Ready for Review'
  THEN
    NEW.output_status := 'Changes Requested';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_la_rework_review_consistency ON public.platform_outputs;
CREATE TRIGGER guard_la_rework_review_consistency
BEFORE INSERT OR UPDATE OF output_status, review_status, do_not_publish, error_messages
ON public.platform_outputs FOR EACH ROW
EXECUTE FUNCTION public.guard_la_rework_review_consistency();

-- Read-only verification of scope and current consistency.
SELECT p.output_number,p.content_number,p.output_status,p.review_status,p.do_not_publish,
 p.error_messages ? 'Studio_LA_Media_Mismatch_Repair' AS wrong_media,
 p.error_messages ? 'Studio_LA_Gallery_Preflight_Repair' AS gallery_incomplete
FROM public.platform_outputs p
WHERE p.error_messages ? 'Studio_LA_Media_Mismatch_Repair'
   OR p.error_messages ? 'Studio_LA_Gallery_Preflight_Repair'
ORDER BY p.output_number;
