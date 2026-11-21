-- Read-only, Supabase-only audit; do NOT use output_status alone as proof
-- of a successful remote platform publication.
-- As of 2026-11-20 CST: 268 overdue approved with no Published_At or post URL.
-- 239 with prior dispatch and no saved remote ID; 26 with no saved dispatch;
-- 2 with saved remote identity; 1 with Published label but no receipt.
-- The published/unpublished outcome is NOT established by these counts.
WITH overdue AS (
 SELECT p.*,
 CASE
  WHEN COALESCE(NULLIF(p.error_messages->>'YouTube_Video_ID',''),
                NULLIF(p.error_messages->>'Platform_Post_ID',''),
                NULLIF(p.error_messages->>'Platform_Media_ID',''),
                NULLIF(p.error_messages->>'IG_Carousel_Published_Media_ID',''),
                NULLIF(p.error_messages->>'TikTok_Draft_Publish_ID','')) IS NOT NULL
     THEN 'requires_authenticated_get'
  WHEN COALESCE((p.error_messages->>'Studio_Publish_Dispatch_Count')::int,0)>0
    OR COALESCE((p.error_messages->>'Publish_Attempt_Count')::int,0)>0
     THEN 'prior_dispatch_provider_reconciliation_required'
  WHEN p.publish_status='Published'
     THEN 'published_label_missing_receipt'
  ELSE 'no_saved_dispatch_requires_preflight_and_new_mae_date'
 END AS evidence_category
 FROM public.platform_outputs p
 WHERE p.output_status='Approved for Publishing'
   AND p.review_status='Approved'
   AND p.scheduled_post_date < now()
   AND p.published_at IS NULL
   AND p.platform_post_url IS NULL
)
SELECT cp.profile_name, o.evidence_category, count(*) AS outputs
FROM overdue o JOIN public.content_profiles cp ON cp.id=o.content_profile_id
GROUP BY 1,2 ORDER BY 1,2;

-- Never mutate these records from classification alone:
-- * a missing remote ID does not prove provider publication failed;
-- * a saved draft/upload ID is not a public post receipt;
-- * retries require authenticated, account-scoped provider readback,
--   idempotency, lease, cooldown and platform quota checks;
-- * no historical forced catch-up publishing.
