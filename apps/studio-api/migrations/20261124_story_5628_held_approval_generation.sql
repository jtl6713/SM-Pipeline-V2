-- Preserve the November 20 fence for all existing identities. Only the exact
-- owner-authorized, corrected #5628 generation may leave its historical hold.
-- The original marker and every operational attempt remain immutable evidence.
CREATE OR REPLACE FUNCTION public.guard_overdue_saved_instagram_container_retry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  b jsonb := coalesce(NEW.error_messages,'{}'::jsonb);
  prior jsonb := coalesce(OLD.error_messages,'{}'::jsonb);
  g jsonb := b->'SM_Issue2915_Story_Replacement_Generation';
  h jsonb := b->'SM_Factory_Held_Review_Receipt';
  a jsonb := b->'SM_Factory_Supabase_Approval_Receipt';
  r jsonb := b->'SM_Issue2915_Held_Approval_Recovery';
  p jsonb := b->'SM_Issue2915_Story_Provider_Reconciliation';
  sha constant text := 'e9f4ad61913fe88aad28bcf6df5643bd8586c74c34ab0b2fe1c9b2d37c3a747f';
  original constant text := '18116418158139610';
  owner_rec constant text := 'recaKAksAFrEv21RO';
  held_at constant text := '2026-11-24T13:19:27.223Z';
  auth_ref constant text := 'https://github.com/jtl6713/SM-Pipeline-V2/issues/2915#issuecomment-7132839239';
  media constant text := 'https://media.chicagoshining.com/studio/previews/repairs/issue2915/miami-1018/po5628-e9f4ad61913fe88a.mp4';
  keys constant text[] := ARRAY['IG_Story_Status','IG_Story_Asset_URL','IG_Story_Locked_At','IG_Story_Locked_By','IG_Story_Container_ID','IG_Story_Attempt_Count','IG_Story_Last_Attempt_At','IG_Story_Error_Message','IG_Story_Response_JSON','Publish_Error_Stage','Publish_Error_Message','Studio_Publish_Dispatch_At','Studio_Publish_Dispatch_Note','Studio_Publish_Dispatch_Count'];
  exact_generation boolean := false;
BEGIN
  IF OLD.output_number=5628 AND NEW.output_number=5628
     AND OLD.airtable_record_id='rec1Zg5eEJjQKzUDO' AND NEW.airtable_record_id=OLD.airtable_record_id
     AND NEW.id=OLD.id AND NEW.content_item_id=OLD.content_item_id
     AND NEW.content_profile_id=OLD.content_profile_id
     AND NEW.platform='Instagram' AND NEW.platform_output_type='Instagram Story'
     AND NEW.test_run_id IS NULL
     AND NEW.studio_preview_url=media AND NEW.publish_asset_url=media
     AND NEW.final_file_url='https://drive.google.com/file/d/1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV/view'
     AND prior ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120'
     AND b->'Studio_Overdue_Failed_IG_Story_Fence_20261120'=prior->'Studio_Overdue_Failed_IG_Story_Fence_20261120'
     AND p=prior->'SM_Issue2915_Story_Provider_Reconciliation'
     AND p->>'account_username'='miamishining' AND p->>'account_owned'='true'
     AND p->>'original_container_id'=original AND p->>'original_container_status'='EXPIRED'
     AND p->>'candidate_sha256'=sha AND p->>'provider_writes'='0'
     AND p->>'owner_previously_reported_not_published'='true'
     AND h=prior->'SM_Factory_Held_Review_Receipt'
     AND h->>'at'=held_at AND h->>'decision'='approve'
     AND h->>'publishing_authorized'='false' AND h->>'publishing_hold_preserved'='true'
     AND h->>'incident_creative_only'='false' AND h->>'publish_state_at_decision'='Not Ready'
     AND g->>'generation'='vizcaya-'||sha AND g->>'asset_sha256'=sha
     AND g->>'asset_url'=media AND g->>'original_container_id'=original
     AND g->>'output_record_id'=NEW.airtable_record_id AND g->>'output_number'='5628'
     AND g->>'version'='1' AND g->>'approval_required'='true'
     AND g->>'release_actor'=owner_rec AND g->>'release_actor_provenance'='owner_directed_recovery'
     AND g->>'provider_proof_at'=p->>'verified_at'
     AND g->'original_attempts'->>'IG_Story_Container_ID'=original
     AND g->'original_attempts'->>'IG_Story_Attempt_Count'='2'
     AND g->'original_attempts'->>'Studio_Publish_Dispatch_Count'='2'
     AND r->>'authorization_ref'=auth_ref AND r->>'authority'='owner_directed_recovery'
     AND r->>'actor_record_id'=owner_rec AND r->>'original_held_review_at'=held_at
     AND r->>'asset_sha256'=sha AND r->>'original_container_id'=original
     AND r->>'reconciled_at'=g->>'released_at' AND r->>'no_new_factory_submission'='true'
     AND a->>'actor_provenance'='authenticated_held_review_owner_directed_recovery'
     AND a->>'authority'='supabase' AND a->>'output_record_id'=NEW.airtable_record_id
     AND a->>'output_number'='5628' AND a->>'approval_actor_record_id'=owner_rec
     AND a->>'original_held_review_at'=held_at AND a->>'approved_at'=r->>'reconciled_at'
     AND a->>'request_id'='issue2915-held-review-recovery-5628'
     AND a->>'profile_record_id'='recpNlNn6U6eq0M9r' AND a->>'scheduled'='true'
     AND coalesce(b->>'IG_Story_Container_ID','')<>original
  THEN
    IF NOT (prior ? 'SM_Issue2915_Story_Replacement_Generation') THEN
      -- Initial release: pin the exact current held approval, profile owner,
      -- archived attempt values and a future nonconflicting MAE reservation.
      exact_generation :=
        OLD.updated_at='2026-11-24T13:19:27.223Z'::timestamptz
        AND OLD.do_not_publish IS TRUE AND OLD.auto_publish_enabled IS FALSE
        AND OLD.publish_status='Not Ready' AND OLD.output_status='Approved for Publishing'
        AND OLD.review_status='Approved' AND OLD.publish_hold_source='issue2915_review_and_provider_reconciliation'
        AND OLD.published_at IS NULL AND OLD.platform_post_url IS NULL
        AND OLD.scheduled_post_date IS NULL AND OLD.studio_scheduled_at IS NULL
        AND OLD.publish_asset_url IS NULL AND OLD.platform_publish_response IS NULL
        AND NEW.do_not_publish IS FALSE AND NEW.auto_publish_enabled IS TRUE
        AND NEW.publish_retry_eligible IS FALSE AND NEW.publish_status='Ready to Schedule'
        AND NEW.output_status='Approved for Publishing' AND NEW.review_status='Approved'
        AND NEW.published_at IS NULL AND NEW.platform_post_url IS NULL
        AND NEW.scheduled_post_date>now()+interval '10 minutes'
        AND NEW.studio_scheduled_at=NEW.scheduled_post_date
        AND (a->>'scheduled_for')::timestamptz=NEW.scheduled_post_date
        AND g->'original_attempts'=(SELECT coalesce(jsonb_object_agg(k,prior->k),'{}'::jsonb)
             FROM unnest(keys) AS k WHERE prior ? k)
        AND b->>'IG_Story_Status'='Ready' AND b->>'IG_Story_Asset_URL'=media
        AND NOT (b ? 'IG_Story_Container_ID' OR b ? 'IG_Story_Post_ID' OR b ? 'Platform_Post_ID')
        AND EXISTS (SELECT 1 FROM public.studio_users u
          JOIN public.studio_memberships m ON m.user_id=u.id
          JOIN public.content_profiles cp ON cp.organization_id=m.organization_id
          WHERE u.airtable_record_id=owner_rec AND lower(u.email)=lower(h->>'actor')
            AND u.active IS TRUE AND u.user_status='Active'
            AND m.active IS TRUE AND m.membership_status='Active' AND m.role='Owner'
            AND cp.id=NEW.content_profile_id AND cp.active IS TRUE
            AND cp.airtable_record_id='recpNlNn6U6eq0M9r')
        AND NOT EXISTS (SELECT 1 FROM public.platform_outputs o
          WHERE o.id<>NEW.id AND o.content_profile_id=NEW.content_profile_id
            AND o.platform='Instagram' AND o.scheduled_post_date>now()
            AND o.scheduled_post_date>NEW.scheduled_post_date-interval '90 minutes'
            AND o.scheduled_post_date<NEW.scheduled_post_date+interval '90 minutes');
    ELSE
      -- Continuing the NEW generation is allowed, not a fresh release of a
      -- subsequent failure. Legacy overwrites cannot remove its audit proof.
      exact_generation :=
        g=prior->'SM_Issue2915_Story_Replacement_Generation'
        AND r=prior->'SM_Issue2915_Held_Approval_Recovery'
        AND a=prior->'SM_Factory_Supabase_Approval_Receipt'
        AND (OLD.do_not_publish IS FALSE OR
             (NEW.do_not_publish IS TRUE AND NEW.auto_publish_enabled IS FALSE AND NEW.publish_retry_eligible IS FALSE));
    END IF;
    IF exact_generation IS TRUE THEN RETURN NEW; END IF;
  END IF;
  -- Original guard, unchanged for all historical attempts and other outputs.
  IF (prior ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120'
      OR prior ? 'Studio_Overdue_Existing_IG_Container_Fence_20261120')
     AND NEW.published_at IS NULL
     AND NULLIF(NEW.platform_post_url,'') IS NULL
  THEN
    NEW.do_not_publish := TRUE;
    NEW.auto_publish_enabled := FALSE;
    NEW.publish_retry_eligible := FALSE;
    NEW.error_messages := b;
    IF prior ? 'Studio_Overdue_Failed_IG_Story_Fence_20261120' THEN
      NEW.error_messages := NEW.error_messages || jsonb_build_object(
        'Studio_Overdue_Failed_IG_Story_Fence_20261120',prior->'Studio_Overdue_Failed_IG_Story_Fence_20261120');
    END IF;
    IF prior ? 'Studio_Overdue_Existing_IG_Container_Fence_20261120' THEN
      NEW.error_messages := NEW.error_messages || jsonb_build_object(
        'Studio_Overdue_Existing_IG_Container_Fence_20261120',prior->'Studio_Overdue_Existing_IG_Container_Fence_20261120');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
