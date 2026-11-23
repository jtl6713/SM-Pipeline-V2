-- Incident #2670: Supabase-only native gallery C5/C6 held creative job ledger.
-- The former Airtable table tbl5sq9xBrF6bgPph is retired. This table stores
-- the exact original Airtable-shaped fields, with no migration or recreation
-- of historical job states from the closed archive.
CREATE TABLE IF NOT EXISTS public.native_gallery_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airtable_record_id text NOT NULL UNIQUE
    CHECK (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS native_gallery_job_id_exact_uq
  ON public.native_gallery_jobs ((fields->>'Job_ID'))
  WHERE fields ? 'Job_ID';
CREATE INDEX IF NOT EXISTS native_gallery_job_output_idx
  ON public.native_gallery_jobs ((fields->>'Output_Record_ID'));
CREATE INDEX IF NOT EXISTS native_gallery_job_held_idx
  ON public.native_gallery_jobs ((fields->>'Job_State'), created_at);

ALTER TABLE public.native_gallery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_gallery_jobs FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_gallery_jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.native_gallery_jobs_id_seq TO service_role;

COMMENT ON TABLE public.native_gallery_jobs IS
  'Supabase-only original C5/C6 creative jobs. Empty indicates no queued jobs; never reconstruct historical claims without proof.';
