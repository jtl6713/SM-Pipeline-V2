-- Issue #2563: only human-authored revision decisions may be represented as
-- "Changes Requested" on Instagram/Facebook Platform Outputs.
-- Existing safely-held false labels were reclassified with auditable
-- SM_False_Changes_Requested_Recovery_2563 receipts prior to this migration.
--
-- This fail-safe trigger does not publish, approve, schedule, unlock holds,
-- or discard media/provider evidence. It catches legacy automations, mirrors,
-- and recovery writers (including pre-existing preflight-consistency triggers).
--
-- A genuine review event needs one of:
--   (1) Supabase Factory held-review rejection receipt, with actor/note/time;
--   (2) timestamp-matched, actor-attributed legacy Factory/Phase-6 review note;
--   (3) durable Rendering Review session/hold identity from the authenticated
--       Factory-to-Producer return flow.
-- TODO: migrate legacy manual review writers to a unified typed receipt and
-- retire the legacy timestamp/session compatibility paths.
CREATE OR REPLACE FUNCTION public.guard_meta_user_requested_changes_2563()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  bag jsonb := COALESCE(NEW.error_messages, '{}'::jsonb);
  receipt jsonb;
  review_note text;
  decision_at text;
  is_human_receipt boolean := false;
  is_legacy_review boolean := false;
  is_session_return boolean := false;
  previous_stage text;
  previous_review text;
BEGIN
  IF NEW.platform NOT IN ('Instagram','Facebook')
     OR (LOWER(BTRIM(COALESCE(NEW.output_status,''))) <> 'changes requested'
         AND LOWER(BTRIM(COALESCE(NEW.review_status,''))) <> 'changes requested') THEN
    RETURN NEW;
  END IF;

  receipt := bag->'SM_Factory_Held_Review_Receipt';
  review_note := COALESCE(bag->>'Review_Notes','');
  decision_at := COALESCE(bag->>'Review_Decision_At','');

  is_human_receipt :=
    receipt->>'decision' = 'reject'
    AND LENGTH(BTRIM(COALESCE(receipt->>'actor',''))) > 0
    AND LENGTH(BTRIM(COALESCE(receipt->>'note',''))) > 0
    AND LENGTH(BTRIM(COALESCE(receipt->>'at',''))) > 0;

  -- The existing authenticated, manual Factory and Phase-6 routes append
  -- both the actor-attributed note and the identical decision timestamp.
  is_legacy_review :=
    LENGTH(decision_at) >= 20 AND POSITION(decision_at IN review_note) > 0
    AND (review_note ~* 'Factory (Desk|content) send-back by'
         OR review_note ~* 'Studio Phase 6 changes requested'
         OR review_note ~* 'Studio review mix applied');

  -- Factory return-to-Producer persists its exact review-session hold before
  -- writing the corresponding user decision event; never invalidate that path.
  is_session_return :=
    bag->>'Studio_Render_Review_Hold_Active' = 'true'
    AND LENGTH(BTRIM(COALESCE(bag->>'Studio_Render_Review_Session_ID',''))) > 0
    AND LENGTH(BTRIM(COALESCE(bag->>'Studio_Render_Review_Hold_ID',''))) > 0;

  IF NEW.do_not_publish IS TRUE
     AND (is_human_receipt OR is_legacy_review OR is_session_return) THEN
    RETURN NEW;
  END IF;

  -- Automated provider/asset remediation is NOT a human creative decision.
  -- Keep the protective hold; route by a reasoned recovery marker instead.
  previous_stage := NEW.output_status;
  previous_review := NEW.review_status;
  IF LOWER(BTRIM(COALESCE(NEW.output_status,''))) = 'changes requested' THEN
    NEW.output_status := 'In Production';
  END IF;
  IF LOWER(BTRIM(COALESCE(NEW.review_status,''))) = 'changes requested' THEN
    NEW.review_status := NULL;
  END IF;
  NEW.do_not_publish := TRUE;
  NEW.auto_publish_enabled := FALSE;
  NEW.publish_retry_eligible := FALSE;
  NEW.error_messages := bag || jsonb_build_object(
    'SM_False_Changes_Requested_Recurrence_2563',
    jsonb_build_object(
      'at', clock_timestamp(),
      'issue', 2563,
      'source', 'automatic_status_provenance_guard',
      'invalid_requested_output_status', previous_stage,
      'invalid_requested_review_status', previous_review,
      'reason', 'unverified_human_revision_decision',
      'publishing_authorized', false,
      'publish_hold_preserved', true));
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zz_guard_meta_user_requested_changes_2563 ON public.platform_outputs;
CREATE TRIGGER zz_guard_meta_user_requested_changes_2563
BEFORE INSERT OR UPDATE OF platform, output_status, review_status, error_messages
ON public.platform_outputs
FOR EACH ROW
EXECUTE FUNCTION public.guard_meta_user_requested_changes_2563();
