-- Assign stable numeric Candidate_ID values for Supabase-authoritative Studio Ideas.
-- The browser keeps the internal rec... ID as option value, but should show the
-- numeric Candidate_ID. Previously 76 Supabase-created Ideas were unnumbered.
-- Preserve all existing numbers and assign the missing IDs in creation order.
-- Mirrors the existing phase7/009 content/output numeric-ID migration.

BEGIN;

LOCK TABLE public.idea_candidates IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS public.studio_idea_candidate_number_seq AS bigint;

SELECT setval(
  'public.studio_idea_candidate_number_seq'::regclass,
  GREATEST(
    COALESCE((
      SELECT MAX((payload->>'Candidate_ID')::bigint) + 1
      FROM public.idea_candidates
      WHERE payload->>'Candidate_ID' ~ '^[0-9]+$'
    ), 1),
    (
      SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END
      FROM public.studio_idea_candidate_number_seq
    )
  ),
  false
);

CREATE OR REPLACE FUNCTION public.studio_assign_idea_candidate_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  preserved text;
BEGIN
  -- Later sparse PATCHes must never remove or renumber an existing Idea.
  IF TG_OP = 'UPDATE' THEN
    preserved := OLD.payload->>'Candidate_ID';
  END IF;
  IF COALESCE(preserved ~ '^[0-9]+$', false) THEN
    NEW.payload := pg_catalog.jsonb_set(
      COALESCE(NEW.payload, '{}'::jsonb), '{Candidate_ID}', pg_catalog.to_jsonb(preserved::bigint), true
    );
  ELSIF NOT COALESCE((NEW.payload->>'Candidate_ID') ~ '^[0-9]+$', false) THEN
    NEW.payload := pg_catalog.jsonb_set(
      COALESCE(NEW.payload, '{}'::jsonb), '{Candidate_ID}',
      pg_catalog.to_jsonb(nextval('public.studio_idea_candidate_number_seq'::regclass)), true
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS studio_assign_idea_candidate_number ON public.idea_candidates;
CREATE TRIGGER studio_assign_idea_candidate_number
  BEFORE INSERT OR UPDATE OF payload ON public.idea_candidates
  FOR EACH ROW EXECUTE FUNCTION public.studio_assign_idea_candidate_number();

-- The Worker writes using the service role. Do not grant sequence usage to
-- anonymous/authenticated clients.
GRANT USAGE ON SEQUENCE public.studio_idea_candidate_number_seq TO service_role;
REVOKE ALL ON FUNCTION public.studio_assign_idea_candidate_number() FROM PUBLIC;

-- Process oldest unnumbered record first, using one assignment per row.
DO $backfill$
DECLARE
  record_id uuid;
BEGIN
  FOR record_id IN
    SELECT id FROM public.idea_candidates
    WHERE NOT COALESCE((payload->>'Candidate_ID') ~ '^[0-9]+$', false)
    ORDER BY created_at, id
  LOOP
    UPDATE public.idea_candidates
    SET payload = COALESCE(payload, '{}'::jsonb)
    WHERE id = record_id;
  END LOOP;
END;
$backfill$;

-- The existing 1,883 numeric IDs were distinct before migration.
CREATE UNIQUE INDEX IF NOT EXISTS idea_candidates_candidate_id_number_unique
  ON public.idea_candidates (((payload->>'Candidate_ID')::bigint))
  WHERE payload->>'Candidate_ID' ~ '^[0-9]+$';

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.idea_candidates
    WHERE NOT COALESCE((payload->>'Candidate_ID') ~ '^[0-9]+$', false)
  ) THEN
    RAISE EXCEPTION 'Studio Idea numeric ID backfill incomplete';
  END IF;
END;
$verify$;

COMMIT;
