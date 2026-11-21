-- Restore numeric Studio Content ID and Output ID allocation in Supabase.
-- Existing records retain their IDs, UUIDs, links, scheduling and publish state.
-- The Phase 6 writer can explicitly send NULL; a column DEFAULT alone is insufficient.
-- Backfill runs with write locks to avoid colliding with concurrent creates.

BEGIN;

LOCK TABLE public.content_items, public.platform_outputs IN SHARE ROW EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS public.content_items_content_number_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.platform_outputs_output_number_seq AS integer;

SELECT setval(
  'public.content_items_content_number_seq'::regclass,
  COALESCE((SELECT MAX(content_number) FROM public.content_items), 0) + 1,
  false
);
SELECT setval(
  'public.platform_outputs_output_number_seq'::regclass,
  COALESCE((SELECT MAX(output_number) FROM public.platform_outputs), 0) + 1,
  false
);

CREATE OR REPLACE FUNCTION public.pipeline_assign_content_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.content_number IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      -- A sparse legacy upsert must never erase an already assigned ID.
      IF OLD.content_number IS NOT NULL THEN
        NEW.content_number := OLD.content_number;
      ELSE
        NEW.content_number := nextval('public.content_items_content_number_seq'::regclass);
      END IF;
    ELSE
      NEW.content_number := nextval('public.content_items_content_number_seq'::regclass);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pipeline_assign_output_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.output_number IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.output_number IS NOT NULL THEN
        NEW.output_number := OLD.output_number;
      ELSE
        NEW.output_number := nextval('public.platform_outputs_output_number_seq'::regclass);
      END IF;
    ELSE
      NEW.output_number := nextval('public.platform_outputs_output_number_seq'::regclass);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pipeline_assign_content_number ON public.content_items;
CREATE TRIGGER pipeline_assign_content_number
  BEFORE INSERT OR UPDATE OF content_number
  ON public.content_items FOR EACH ROW
  EXECUTE FUNCTION public.pipeline_assign_content_number();

DROP TRIGGER IF EXISTS pipeline_assign_output_number ON public.platform_outputs;
CREATE TRIGGER pipeline_assign_output_number
  BEFORE INSERT OR UPDATE OF output_number
  ON public.platform_outputs FOR EACH ROW
  EXECUTE FUNCTION public.pipeline_assign_output_number();

-- Parent AFTER UPDATE trigger automatically refreshes platform_outputs.content_number.
UPDATE public.content_items
SET content_number = nextval('public.content_items_content_number_seq'::regclass)
WHERE content_number IS NULL;

UPDATE public.platform_outputs
SET output_number = nextval('public.platform_outputs_output_number_seq'::regclass)
WHERE output_number IS NULL;

DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.content_items WHERE content_number IS NULL) THEN
    RAISE EXCEPTION 'Content ID backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_outputs WHERE output_number IS NULL) THEN
    RAISE EXCEPTION 'Output ID backfill incomplete';
  END IF;
END;
$check$;

COMMIT;
