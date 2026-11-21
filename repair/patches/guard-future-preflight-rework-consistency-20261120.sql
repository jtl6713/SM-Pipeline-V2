-- Live Supabase migration: guard_future_preflight_rework_consistency_20261120
-- Applied 2026-11-20 CST. Scope: only records carrying the exact
-- Studio_Future_Preflight_Repair_20261120 diagnostic marker.
-- The guard prevents stale background render updates from prematurely
-- advertising a rejected package as Ready for Review while it is held.
-- Legitimate remediation requires a new review transition.
CREATE OR REPLACE FUNCTION public.guard_future_preflight_rework_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.do_not_publish IS TRUE
     AND NEW.review_status = 'Changes Requested'
     AND COALESCE(NEW.error_messages,'{}'::jsonb) ? 'Studio_Future_Preflight_Repair_20261120'
     AND NEW.output_status = 'Ready for Review'
  THEN
    NEW.output_status := 'Changes Requested';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_future_preflight_rework_consistency ON public.platform_outputs;
CREATE TRIGGER guard_future_preflight_rework_consistency
BEFORE INSERT OR UPDATE OF output_status,review_status,do_not_publish,error_messages
ON public.platform_outputs FOR EACH ROW
EXECUTE FUNCTION public.guard_future_preflight_rework_consistency();

-- Nine preflight repair records (original dates retained in error_messages):
-- 8946, 8948, 9022, 9028, 9382, 9601, 10200, 10356, 10532
SELECT output_number,output_status,review_status,do_not_publish,
 error_messages->'Studio_Future_Preflight_Repair_20261120'->>'reason' AS reason
FROM public.platform_outputs
WHERE error_messages ? 'Studio_Future_Preflight_Repair_20261120'
ORDER BY output_number;
