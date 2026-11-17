-- SM-Pipeline-V2 #2150: prevent already-uploaded shared media from being
-- re-labelled Waiting/Ready by a late queue stamp. Supabase-only guard.
-- Never use Output_ID (nullable); never promote review/approval or publish.
CREATE OR REPLACE FUNCTION public.guard_completed_shared_render_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.render_status IN ('Waiting in Render Queue', 'Ready for Render', 'Ready to Render')
     AND NEW.output_status = 'Ready for Review'
     AND NEW.final_file_storage_status = 'Uploaded'
     AND NEW.final_file_url LIKE 'https://drive.google.com/file/d/%'
     AND NEW.studio_preview_url LIKE 'https://media.chicagoshining.com/studio/previews/%'
     AND NEW.thumbnail_url LIKE 'https://media.chicagoshining.com/%'
     AND NEW.content_item_id IS NOT NULL
     AND NEW.do_not_publish IS FALSE
     AND NEW.test_run_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.platform_outputs canonical
       WHERE canonical.content_item_id = NEW.content_item_id
         AND canonical.id IS DISTINCT FROM NEW.id
         AND canonical.render_status = 'Rendered'
         AND canonical.remotion_job_id IS NOT NULL
         AND canonical.remotion_job_id <> ''
         AND canonical.final_file_url = NEW.final_file_url
         AND canonical.studio_preview_url = NEW.studio_preview_url
         AND canonical.thumbnail_url = NEW.thumbnail_url
         AND canonical.do_not_publish IS FALSE
         AND canonical.test_run_id IS NULL
     )
  THEN
    NEW.render_status := 'Rendered';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_completed_shared_render_status ON public.platform_outputs;
CREATE TRIGGER guard_completed_shared_render_status
BEFORE INSERT OR UPDATE OF render_status, output_status, final_file_storage_status,
  final_file_url, studio_preview_url, thumbnail_url
ON public.platform_outputs
FOR EACH ROW EXECUTE FUNCTION public.guard_completed_shared_render_status();
