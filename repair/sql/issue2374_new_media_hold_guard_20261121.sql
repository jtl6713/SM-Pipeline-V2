-- #2374: exact ten incomplete galleries, original IDs preserved.
-- Installed via Supabase migration 'guard_issue2374_ten_incomplete_gallery_rework_holds'
-- on 2026-11-21. Keep this repository copy in sync with live production.
-- This guard fails closed on any automatic re-arming, retry scheduling, or
-- deletion of incident evidence. Future release requires a separately
-- reviewed migration and fresh creative Factory approval, not a flag reset.
CREATE OR REPLACE FUNCTION public.guard_issue2374_new_media_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  expected_id text;
BEGIN
  -- Only exactly ten independently reconciled, missing-gallery outputs.
  expected_id := CASE OLD.output_number
    WHEN 10546 THEN 'recgS5wXiWnlhgVm0'
    WHEN 10564 THEN 'rec37Q0BeKga1ydGC'
    WHEN 10598 THEN 'rec1fQzlWCRm53MQ4'
    WHEN 10759 THEN 'reczJBifoU2F95yEM'
    WHEN 10766 THEN 'recNu1iOFpzuzIHEu'
    WHEN 10792 THEN 'recbqPtRfK3EZagWm'
    WHEN 10793 THEN 'recYnHtxkSljy762z'
    WHEN 10800 THEN 'recEbgk1H0rNqEr8h'
    WHEN 10802 THEN 'recr4kD97CT3X2JLX'
    WHEN 10818 THEN 'recWgwW0HYmgq4EZG'
    ELSE NULL
  END;
  IF expected_id IS NULL OR OLD.airtable_record_id IS DISTINCT FROM expected_id
     OR NOT (COALESCE(OLD.error_messages,'{}'::jsonb)
          ? 'Studio_Overdue_UnsafeGallery_Hold_20261121') THEN
    RETURN NEW;
  END IF;
  IF NEW.airtable_record_id IS DISTINCT FROM expected_id
     OR NEW.output_number IS DISTINCT FROM OLD.output_number
     OR NOT (COALESCE(NEW.error_messages,'{}'::jsonb)
          ? 'Studio_Overdue_UnsafeGallery_Hold_20261121') THEN
    RAISE EXCEPTION USING
      ERRCODE='check_violation',
      MESSAGE='Protected #2374 original media hold cannot lose its identity or audit marker';
  END IF;
  IF NEW.do_not_publish IS DISTINCT FROM TRUE
     OR NEW.auto_publish_enabled IS DISTINCT FROM FALSE
     OR NEW.publish_retry_eligible IS DISTINCT FROM FALSE
     OR NEW.publish_next_retry_at IS NOT NULL
     OR NEW.ig_carousel_next_retry_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE='check_violation',
      MESSAGE='Protected #2374 incomplete media requires renewed creative review before any publish or retry release';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_issue2374_new_media_hold ON public.platform_outputs;
CREATE TRIGGER guard_issue2374_new_media_hold BEFORE UPDATE ON public.platform_outputs FOR EACH ROW EXECUTE FUNCTION guard_issue2374_new_media_hold();
