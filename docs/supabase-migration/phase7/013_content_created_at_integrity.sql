-- #2577: Content Items creation timestamp integrity.
-- 106 legacy NULL rows (2026-11-16..21) lacked source Created_At and
-- record.createdTime. Their true creation instants are not recoverable from
-- the typed content row. Use the earliest surviving persisted upper bound,
-- explicitly marked as ESTIMATED, without altering publish/status data.
--
-- CREATE behaviour: PostgreSQL assigns a server timestamp when client omits
-- created_at; old clients that explicitly send null are handled by the guard.
-- UPDATE behaviour: never rewrite the original created_at.
-- This is safe to apply while the Worker and runner code updates deploy.

ALTER TABLE public.content_items
  ALTER COLUMN created_at SET DEFAULT now();

WITH observed AS (
  SELECT c.id,
         LEAST(c.updated_at, COALESCE(MIN(o.created_at), c.updated_at)) AS observed_time,
         CASE WHEN MIN(o.created_at) < c.updated_at
              THEN 'earliest_platform_output_created_at'
              ELSE 'content_items_legacy_updated_at'
         END AS evidence_column
  FROM public.content_items AS c
  LEFT JOIN public.platform_outputs AS o ON o.content_item_id = c.id
  WHERE c.created_at IS NULL
  GROUP BY c.id, c.updated_at
)
UPDATE public.content_items AS c
SET created_at = observed.observed_time,
    extras = COALESCE(c.extras, '{}'::jsonb) ||
      jsonb_build_object('_creation_time_recovery',
        jsonb_build_object(
          'classification', 'estimated_not_original_creation_time',
          'evidence_column', observed.evidence_column,
          'observed_timestamp', observed.observed_time,
          'recovered_at', transaction_timestamp(),
          'issue', 2577
        ))
FROM observed
WHERE c.id = observed.id AND c.created_at IS NULL;

ALTER TABLE public.content_items
  ALTER COLUMN created_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_content_items_created_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := clock_timestamp();
      NEW.extras := COALESCE(NEW.extras, '{}'::jsonb) ||
        jsonb_build_object('_creation_time_recovery',
          jsonb_build_object(
            'classification', 'server_insert_time',
            'evidence_column', 'clock_timestamp',
            'reason', 'client_explicit_null',
            'issue', 2577
          ));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Content Items created_at is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_items_created_at_guard ON public.content_items;
CREATE TRIGGER content_items_created_at_guard
  BEFORE INSERT OR UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_items_created_at();
