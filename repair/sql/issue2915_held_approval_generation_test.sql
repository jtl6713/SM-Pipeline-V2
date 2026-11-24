\set ON_ERROR_STOP on
-- Isolated PostgreSQL fixture; never production.
CREATE TABLE public.platform_outputs (
  id uuid primary key,airtable_record_id text,output_number integer,content_item_id uuid,content_profile_id uuid,platform text,platform_output_type text,test_run_id text,
  output_status text,review_status text,publish_status text,do_not_publish boolean,auto_publish_enabled boolean,publish_retry_eligible boolean,
  publish_hold_source text,studio_preview_url text,publish_asset_url text,final_file_url text,platform_publish_response jsonb,error_messages jsonb,updated_at timestamptz,
  published_at timestamptz,platform_post_url text,scheduled_post_date timestamptz,studio_scheduled_at timestamptz
);
CREATE TABLE public.studio_users (id uuid,email text,airtable_record_id text,active boolean,user_status text);
CREATE TABLE public.studio_memberships (user_id uuid,organization_id uuid,active boolean,membership_status text,role text);
CREATE TABLE public.content_profiles (id uuid,organization_id uuid,airtable_record_id text,active boolean);
INSERT INTO public.studio_users VALUES ('11111111-1111-4111-8111-111111111111','owner@example.test','recaKAksAFrEv21RO',true,'Active');
INSERT INTO public.studio_memberships VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',true,'Active','Owner');
INSERT INTO public.content_profiles VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','recpNlNn6U6eq0M9r',true);
\ir ../../apps/studio-api/migrations/20261124_story_5628_held_approval_generation.sql
CREATE TRIGGER guard_overdue_saved_instagram_container_retry BEFORE UPDATE OF auto_publish_enabled,do_not_publish,publish_retry_eligible,error_messages,published_at,platform_post_url ON public.platform_outputs FOR EACH ROW EXECUTE FUNCTION public.guard_overdue_saved_instagram_container_retry();
DO $$
DECLARE
 s constant text := 'e9f4ad61913fe88aad28bcf6df5643bd8586c74c34ab0b2fe1c9b2d37c3a747f';
 old_id constant text := '18116418158139610';
 media constant text := 'https://media.chicagoshining.com/studio/previews/repairs/issue2915/miami-1018/po5628-e9f4ad61913fe88a.mp4';
 drive constant text := 'https://drive.google.com/file/d/1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV/view';
 rec constant text := 'rec1Zg5eEJjQKzUDO';
 own constant text := 'recaKAksAFrEv21RO';
 held constant text := '2026-11-24T13:19:27.223Z';
 stamp constant text := '2026-11-24T13:30:00Z';
 slot constant timestamptz := now()+interval '3 days';
 p jsonb;
 h jsonb;
 attempts jsonb;
 initial jsonb;
 nextbag jsonb;
 x public.platform_outputs%rowtype;
BEGIN
 p:=jsonb_build_object('account_username','miamishining','account_owned',true,'original_container_id',old_id,'original_container_status','EXPIRED','candidate_sha256',s,'provider_writes',0,'owner_previously_reported_not_published',true,'verified_at','2026-11-24T12:57:16Z');
 h:=jsonb_build_object('at',held,'actor','owner@example.test','decision','approve','publishing_authorized',false,'publishing_hold_preserved',true,'incident_creative_only',false,'publish_state_at_decision','Not Ready');
 attempts:=jsonb_build_object('IG_Story_Container_ID',old_id,'IG_Story_Attempt_Count',2,'Studio_Publish_Dispatch_Count',2,'IG_Story_Status','Failed');
 initial:=attempts||jsonb_build_object('Studio_Overdue_Failed_IG_Story_Fence_20261120',jsonb_build_object('original',old_id),'SM_Issue2915_Story_Provider_Reconciliation',p,'SM_Factory_Held_Review_Receipt',h);
 INSERT INTO public.platform_outputs (id,airtable_record_id,output_number,content_item_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,publish_retry_eligible,publish_hold_source,studio_preview_url,final_file_url,error_messages,updated_at)
 VALUES ('44444444-4444-4444-8444-444444444444',rec,5628,'55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','Instagram','Instagram Story','Approved for Publishing','Approved','Not Ready',true,false,false,'issue2915_review_and_provider_reconciliation',media,drive,initial,held::timestamptz);
 UPDATE public.platform_outputs SET do_not_publish=false,auto_publish_enabled=true WHERE output_number=5628 RETURNING * INTO x;
 IF NOT x.do_not_publish OR x.auto_publish_enabled THEN RAISE EXCEPTION 'legacy fence lost'; END IF;
 nextbag:=(initial-ARRAY['IG_Story_Container_ID','IG_Story_Attempt_Count','Studio_Publish_Dispatch_Count','IG_Story_Status'])||jsonb_build_object(
 'IG_Story_Status','Ready','IG_Story_Asset_URL',media,
 'SM_Issue2915_Story_Replacement_Generation',jsonb_build_object('version',1,'output_record_id',rec,'output_number',5628,'generation','vizcaya-'||s,'asset_sha256',s,'asset_url',media,'original_container_id',old_id,'original_attempts',attempts,'release_actor',own,'release_actor_provenance','owner_directed_recovery','provider_proof_at',p->>'verified_at','released_at',stamp,'approval_required',true),
 'SM_Issue2915_Held_Approval_Recovery',jsonb_build_object('authorization_ref','https://github.com/jtl6713/SM-Pipeline-V2/issues/2915#issuecomment-7132839239','authority','owner_directed_recovery','actor_record_id',own,'original_held_review_at',held,'asset_sha256',s,'original_container_id',old_id,'reconciled_at',stamp,'no_new_factory_submission',true),
 'SM_Factory_Supabase_Approval_Receipt',jsonb_build_object('actor_provenance','authenticated_held_review_owner_directed_recovery','authority','supabase','output_record_id',rec,'output_number',5628,'approval_actor_record_id',own,'original_held_review_at',held,'approved_at',stamp,'request_id','issue2915-held-review-recovery-5628','profile_record_id','recpNlNn6U6eq0M9r','scheduled',true,'scheduled_for',slot));
 -- Failed attempts must not leave even staged media fields behind; exercise
 -- negative candidate inside a nested subtransaction and roll it back.
 BEGIN
   UPDATE public.platform_outputs SET do_not_publish=false,auto_publish_enabled=true,publish_status='Ready to Schedule',publish_asset_url=media,scheduled_post_date=slot,studio_scheduled_at=slot,error_messages=jsonb_set(nextbag,'{SM_Issue2915_Held_Approval_Recovery,authorization_ref}','"wrong"') WHERE output_number=5628 RETURNING * INTO x;
   IF NOT x.do_not_publish OR x.auto_publish_enabled THEN RAISE EXCEPTION 'wrong authorization permitted'; END IF;
   RAISE SQLSTATE 'ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 BEGIN
   UPDATE public.studio_memberships SET active=false;
   UPDATE public.platform_outputs SET do_not_publish=false,auto_publish_enabled=true,publish_status='Ready to Schedule',publish_asset_url=media,scheduled_post_date=slot,studio_scheduled_at=slot,error_messages=nextbag WHERE output_number=5628 RETURNING * INTO x;
   IF NOT x.do_not_publish OR x.auto_publish_enabled THEN RAISE EXCEPTION 'inactive owner permitted'; END IF;
   RAISE SQLSTATE 'ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 UPDATE public.platform_outputs SET do_not_publish=false,auto_publish_enabled=true,publish_status='Ready to Schedule',publish_asset_url=media,scheduled_post_date=slot,studio_scheduled_at=slot,error_messages=nextbag WHERE output_number=5628 RETURNING * INTO x;
 IF x.do_not_publish OR NOT x.auto_publish_enabled OR x.scheduled_post_date<>slot THEN RAISE EXCEPTION 'authorized exact generation denied'; END IF;
 UPDATE public.platform_outputs SET error_messages=error_messages||jsonb_build_object('IG_Story_Container_ID','123456789'),publish_status='Publishing' WHERE output_number=5628 RETURNING * INTO x;
 IF x.do_not_publish OR NOT x.auto_publish_enabled THEN RAISE EXCEPTION 'new generation could not continue'; END IF;
 UPDATE public.platform_outputs SET do_not_publish=true,auto_publish_enabled=false,publish_status='Failed' WHERE output_number=5628;
 UPDATE public.platform_outputs SET do_not_publish=false,auto_publish_enabled=true WHERE output_number=5628 RETURNING * INTO x;
 IF NOT x.do_not_publish OR x.auto_publish_enabled THEN RAISE EXCEPTION 'subsequent failed generation rearmed'; END IF;
 RAISE NOTICE 'ISSUE2915_HELD_GENERATION_SQL_GUARD=PASS';
END $$;
