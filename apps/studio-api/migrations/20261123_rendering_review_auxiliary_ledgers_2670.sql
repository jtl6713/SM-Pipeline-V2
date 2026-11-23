-- Incident #2670: Rendering Review auxiliary ledgers under Supabase authority.
-- Four core ledgers already exist. These two close the remaining retired
-- Airtable table IDs needed for the exact Worker session/message workflow.
CREATE TABLE IF NOT EXISTS public.rendering_review_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airtable_record_id text NOT NULL UNIQUE
    CHECK (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.rendering_review_requirements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airtable_record_id text NOT NULL UNIQUE
    CHECK (airtable_record_id ~ '^rec[A-Za-z0-9]{14}$'),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS rendering_review_messages_session_idx
  ON public.rendering_review_messages ((fields->>'Session_ID'),created_at);
CREATE INDEX IF NOT EXISTS rendering_review_requirements_session_idx
  ON public.rendering_review_requirements ((fields->>'Session_ID'),created_at);
ALTER TABLE public.rendering_review_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rendering_review_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rendering_review_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rendering_review_requirements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendering_review_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendering_review_requirements TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rendering_review_messages_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rendering_review_requirements_id_seq TO service_role;

COMMENT ON TABLE public.rendering_review_messages IS
  'Supabase-only Rendering Review message ledger. No speculative archive replay.';
COMMENT ON TABLE public.rendering_review_requirements IS
  'Supabase-only Rendering Review requirement ledger. No speculative archive replay.';
