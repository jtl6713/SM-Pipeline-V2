-- Issue #2374, 2026-11-20 CST: deployed fail-closed holds and
-- recovery-stage regression guards for EXACT previously audited outputs.
-- The source mirrors the already-applied live Supabase migrations.
--
-- 14 overdue Instagram Stories have existing creation containers, not
-- verified published media; 12 have terminal failed stages and 2 have
-- eight prior dispatches. A retry could create duplicate public posts.
CREATE OR REPLACE FUNCTION public.guard_overdue_saved_instagram_container_retry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (COALESCE(OLD.error_messages,'{}'::jsonb) ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120'
      OR COALESCE(OLD.error_messages,'{}'::jsonb) ? 'Studio_Overdue_Existing_IG_Container_Fence_20261120')
     AND NEW.published_at IS NULL
     AND NULLIF(NEW.platform_post_url,'') IS NULL
  THEN
    NEW.do_not_publish := TRUE;
    NEW.auto_publish_enabled := FALSE;
    NEW.publish_retry_eligible := FALSE;
    NEW.error_messages := COALESCE(NEW.error_messages,'{}'::jsonb);
    IF OLD.error_messages ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120' THEN
      NEW.error_messages := NEW.error_messages ||
        jsonb_build_object('Studio_Overdue_Failed_IG_Story_Fence_20261120',
          OLD.error_messages->'Studio_Overdue_Failed_IG_Story_Fence_20261120');
    END IF;
    IF OLD.error_messages ? 'Studio_Overdue_Existing_IG_Container_Fence_20261120' THEN
      NEW.error_messages := NEW.error_messages ||
        jsonb_build_object('Studio_Overdue_Existing_IG_Container_Fence_20261120',
          OLD.error_messages->'Studio_Overdue_Existing_IG_Container_Fence_20261120');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_overdue_saved_instagram_container_retry ON public.platform_outputs;
CREATE TRIGGER guard_overdue_saved_instagram_container_retry
BEFORE UPDATE OF auto_publish_enabled,do_not_publish,publish_retry_eligible,error_messages,published_at,platform_post_url
ON public.platform_outputs FOR EACH ROW
EXECUTE FUNCTION public.guard_overdue_saved_instagram_container_retry();

-- 11 overdue/no-dispatch creative packages had missing captions (7),
-- or invalid Facebook photo-set media/slide preparation (4).
-- They are held as Changes Requested, with original dates and reasons in
-- error_messages.Studio_Overdue_Preflight_Repair_20261120.
CREATE OR REPLACE FUNCTION public.guard_overdue_preflight_rework_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.do_not_publish IS TRUE
     AND NEW.review_status = 'Changes Requested'
     AND COALESCE(NEW.error_messages,'{}'::jsonb) ? 'Studio_Overdue_Preflight_Repair_20261120'
     AND NEW.output_status='Ready for Review'
  THEN
    NEW.output_status := 'Changes Requested';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_overdue_preflight_rework_consistency ON public.platform_outputs;
CREATE TRIGGER guard_overdue_preflight_rework_consistency
BEFORE INSERT OR UPDATE OF output_status,review_status,do_not_publish,error_messages
ON public.platform_outputs
FOR EACH ROW EXECUTE FUNCTION public.guard_overdue_preflight_rework_consistency();

-- Non-mutating verification. No platform publication, retry, or state
-- correction is implied by these counts or by a saved remote container.
SELECT
 count(*) FILTER (WHERE error_messages ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120'
   AND do_not_publish=true AND auto_publish_enabled=false AND publish_retry_eligible=false) AS terminal_story_fences,
 count(*) FILTER (WHERE error_messages ? 'Studio_Overdue_Existing_IG_Container_Fence_20261120'
   AND do_not_publish=true AND auto_publish_enabled=false AND publish_retry_eligible=false) AS existing_story_fences,
 count(*) FILTER (WHERE error_messages ? 'Studio_Overdue_Preflight_Repair_20261120'
   AND output_status='Changes Requested' AND review_status='Changes Requested' AND do_not_publish=true) AS rework_packages,
 count(*) FILTER (WHERE error_messages ? 'Studio_Overdue_Provider_Lane_V2_20261120') AS inspected_provider_evidence
FROM public.platform_outputs;
