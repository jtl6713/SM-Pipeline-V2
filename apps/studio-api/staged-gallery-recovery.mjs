// #3159: temporary, narrow future-slot native gallery recovery. The general outage
// fence and the normal broad provider reconciler remain unchanged.
import { assessFreshSupabasePublish } from "./approved-publish-flow.mjs";
import { renderingReviewHoldPresent } from "./rendering-review-publication-hold.mjs";
import { inspectNativeGalleryPublicationPackage } from "./native-gallery-package-guard.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import { factorySupabaseApprovalRows } from "./factory-supabase-approval.mjs";
import { supabaseRest, studioWriteSource, studioSupabaseConfigured, readSupabaseContentProfile, listSupabasePipelineSettingsByNames } from "./supabase-pipeline-reads.mjs";
import { pipelineStageBackend, studioFacebookGraphPublishHeld, studioPromoteDuePublishStatus } from "./worker-functions-01.mjs";
import { readScheduleReservationLane } from "./schedule-reservation-authority.mjs";
import { verifyAuthenticatedInstagramReceipt } from "./exception-recovery-authenticated-receipt.mjs";
import { studioPublishDispatchTarget, studioPulseAp0c, studioPulseAp1c, studioPulseAp2c, studioPulseAp3c, studioPulseAp3p, studioPulseAp4c, studioPulseAp5c, studioPulseFb0, studioPulseFb1, studioPulseFb2, studioPulseFb3 } from "./worker-functions-03.mjs";

export const GALLERY_STAGE_CUTOFF = Date.parse("2026-11-28T15:45:00Z");
const FIVE = 300000, HOUR = 3600000;
const idOk = id => /^rec[A-Za-z0-9]{14}$/.test(String(id||""));
const ms = v => Date.parse(String(v||""));
const val = (r,k) => r?.fields?.[k];
const present = v => v != null && String(v).trim() !== "";
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const markerKey = id => "studio/state/initial-publish-fence/v1/"+id+".json";
const prefix = "studio/state/3159-gallery-v1/";
const pulses = {ap0c:studioPulseAp0c,ap1c:studioPulseAp1c,ap2c:studioPulseAp2c,ap3c:studioPulseAp3c,ap3p:studioPulseAp3p,ap4c:studioPulseAp4c,ap5c:studioPulseAp5c,fb0:studioPulseFb0,fb1:studioPulseFb1,fb2:studioPulseFb2,fb3:studioPulseFb3};
const polls = new Set(["ap2c","ap3p"]);
const canaryKey=prefix+"single-canary.json";
export function stagedGalleryCandidate(entry, now, marker=null) {
  const r=entry?.row, record=entry?.record;
  const reject = reason => ({ok:false,reason});
  if (!r || !idOk(r.airtable_record_id) || record?.id!==r.airtable_record_id ||
      !entry.profileUuid || !idOk(entry.profileId) || !r.content_item_id ||
      !Number.isFinite(now)) return reject("identity");
  const ig = r.platform==="Instagram" && r.platform_output_type==="Instagram Carousel" && r.studio_output_type==="Carousel";
  const fb = r.platform==="Facebook" && r.platform_output_type==="Facebook Photo Set" &&
    r.studio_output_type==="Multi-Image Post" && r.fb_resolved_publish_mode==="Multi-Photo Collage";
  if ((!ig&&!fb) || r.render_status!=="Native Photo Route" ||
      r.review_status!=="Approved" || r.output_status!=="Approved for Publishing" ||
      r.publish_method!=="Automated" || r.do_not_publish!==false || r.auto_publish_enabled!==true ||
      r.test_run_id || r.published_at || r.publish_hold_reason ||
      present(val(record,"Manual_Published_URL")) || val(record,"Manual_Fallback_Required")===true ||
      present(val(record,"Replace_Transaction_ID")) || present(val(record,"Replace_Fingerprint")) ||
      renderingReviewHoldPresent(k=>val(record,k))) return reject("not_current_approved_native_gallery");
  const due=ms(r.scheduled_post_date);
  if (!Number.isFinite(due) || due!==ms(r.studio_scheduled_at) ||
      due<=GALLERY_STAGE_CUTOFF || due>now || now-due>HOUR) return reject("outside_fresh_gallery_cohort");
  if (r.publish_next_retry_at && (!Number.isFinite(ms(r.publish_next_retry_at)) || ms(r.publish_next_retry_at)>now))
    return reject("cooldown");
  // No lock age guessing, automatic retry/reset or old attempt reopening.
  if (present(val(record,"Publish_Locked_By")) || present(val(record,"Publish_Locked_At"))) return reject("publish_lock_present");
  if (!marker) {
    if (now-due>FIVE || r.platform_post_url || r.platform_publish_response && Object.keys(r.platform_publish_response).length ||
        Number(val(record,"Studio_Publish_Dispatch_Count")||0)!==0 ||
        Number(val(record,"Publish_Attempt_Count")||0)!==0 ||
        assessFreshSupabasePublish(record,{nowMs:now}).reason!=="fresh_approved_due_unattempted")
      return reject("not_fresh_first_dispatch");
    return {ok:true,stage:ig?"ap0c":"fb0",due,initial:true};
  }
  if (marker.version!=="3159-gallery-v1" || marker.output_record_id!==record.id ||
      marker.profile_id!==entry.profileId || marker.due_ms!==due ||
      marker.asset_revision!==(r.asset_set_revision??null) ||
      !Number.isFinite(marker.started_ms) || marker.started_ms<due || marker.started_ms-due>FIVE ||
      marker.started_ms>now) return reject("continuation_identity_unverified");
  if (!["Ready to Publish","Publishing"].includes(r.publish_status)) return reject("continuation_status");
  const status=ig?r.ig_carousel_status:r.fb_publish_status;
  const post=String(val(record,"Platform_Post_ID")||"");
  const media=String(val(record,"IG_Carousel_Published_Media_ID")||"");
  const parent=String(val(record,"IG_Carousel_Parent_Container_ID")||"");
  const genericMedia=String(val(record,"Platform_Media_ID")||"");
  if(genericMedia && genericMedia!==(ig?media:post))return reject("conflicting_remote_identity");
  if (ig) {
    if(status==="Publishing" && /^\d{6,35}$/.test(media) && (!post||post===media)) return {ok:true,stage:"ap5c",due};
    if(r.platform_post_url||post||media) return reject("existing_remote_identity");
    if(status==="Assets Ready"&&!parent) return {ok:true,stage:"ap1c",due};
    if(status==="Children Processing"&&!parent) return {ok:true,stage:"ap2c",due};
    if(status==="Children Ready"&&!parent) return {ok:true,stage:"ap3c",due};
    if(status==="Parent Processing"&&/^\d{6,35}$/.test(parent)) return {ok:true,stage:"ap3p",due};
    if(status==="Parent Ready"&&/^\d{6,35}$/.test(parent)) return {ok:true,stage:"ap4c",due};
  } else {
    if(status==="Published Pending Finalize" && /^\d{6,35}_\d{6,35}$/.test(post)) return {ok:true,stage:"fb3",due};
    if(r.platform_post_url||post) return reject("existing_remote_identity");
    if(status==="Ready for Photo Media") return {ok:true,stage:"fb1",due};
    if(status==="Photo Media Ready") return {ok:true,stage:"fb2",due};
  }
  return reject("ambiguous_or_unready_stage");
}
const immutable = entry=>({selected:entry.row.selected_assets,render:entry.row.render_clip_list,
  revision:entry.row.asset_set_revision??null,caption:entry.row.output_caption,
  hashtags:val(entry.record,"Output_Hashtags")??null,content:entry.row.content_item_id,platform:entry.row.platform});
async function fingerprint(entry) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(immutable(entry))));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
async function getMarker(bucket,key) {
  const found=await bucket.get(key);
  return found ? JSON.parse(await found.text()) : null;
}
async function claim(bucket,key,data) {
  const wrote=await bucket.put(key,JSON.stringify(data),{onlyIf:new Headers({"If-None-Match":"*"}),httpMetadata:{contentType:"application/json"}});
  if(!wrote)return false;
  return same(await getMarker(bucket,key),data);
}

export function committedGalleryReservation(entry,lane){
  const r=entry?.row;
  if(!r||lane?.ok!==true||lane.bypass||lane.quarantine||
     lane.lane?.content_profile_id!==entry.profileId||lane.lane?.platform!==r.platform||
     !Array.isArray(lane.recent_reservations))return false;
  const matches=lane.recent_reservations.filter(x=>x.platform_output_record_id===r.airtable_record_id);
  return matches.length===1&&matches[0].output_type===r.platform_output_type&&
    matches[0].content_item_id===r.content_item_airtable_id&&
    ms(matches[0].scheduled_iso)===ms(r.scheduled_post_date)&&
    present(matches[0].reservation_id)&&Number(matches[0].fencing_generation)>0&&
    Number.isFinite(ms(matches[0].committed_timestamp));
}
const cityPrefixes={"Chicago":"","Los Angeles":"LA_","New York City":"NYC_","Miami":"MIAMI_"};
async function verifyGalleryOwner(env,entry,decision){
  const r=entry.row,profile=await readSupabaseContentProfile(env,entry.profileId);
  if(profile?.id!==entry.profileId||profile.fields?.Active!==true)return null;
  const market=String(profile.fields.Market_Name||"");
  if(!Object.hasOwn(cityPrefixes,market))return null;
  const prefix=cityPrefixes[market];
  const keys=["FACEBOOK_PAGE_ID","FACEBOOK_PAGE_ACCESS_TOKEN","INSTAGRAM_BUSINESS_ACCOUNT_ID","META_GRAPH_API_ACCESS_TOKEN","FACEBOOK_GRAPH_API_VERSION","META_GRAPH_API_VERSION"];
  // Match the Python Runner's exact city-prefix resolution, not a Worker-only
  // override. No non-Chicago fallback for account IDs or tokens.
  const names=[...new Set([...keys,...keys.map(k=>prefix+k)])];
  const settings=await listSupabasePipelineSettingsByNames(env,names);
  if(!Array.isArray(settings))return null;
  const map=new Map();
  for(const x of settings){
    const k=String(x.fields?.Setting_Name||"");
    if(!names.includes(k)||map.has(k))return null;
    map.set(k,String(x.fields?.Setting_Value||"").trim());
  }
  const dest=k=>map.get(prefix+k)||"";
  const version=dest("FACEBOOK_GRAPH_API_VERSION")||map.get("FACEBOOK_GRAPH_API_VERSION")||
    (r.platform==="Instagram"?(dest("META_GRAPH_API_VERSION")||map.get("META_GRAPH_API_VERSION")):"")||"v26.0";
  const ig=r.platform==="Instagram",account=dest(ig?"INSTAGRAM_BUSINESS_ACCOUNT_ID":"FACEBOOK_PAGE_ID");
  const token=ig?(dest("META_GRAPH_API_ACCESS_TOKEN")||dest("FACEBOOK_PAGE_ACCESS_TOKEN")):dest("FACEBOOK_PAGE_ACCESS_TOKEN");
  if(!/^\d{6,35}$/.test(account)||!token||!/^v\d{1,2}\.\d$/.test(version))return null;
  const direct=String(profile.fields[ig?"Instagram_Business_Account_ID":"Facebook_Page_ID"]||"").trim();
  if(direct&&direct!==account)return null;
  const get=async(id,fields)=>{
    const u=new URL("https://graph.facebook.com/"+version+"/"+id);
    u.searchParams.set("fields",fields);
    const res=await fetch(u,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(10000),headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
    return res.ok?await res.json():null;
  };
  if(ig){
    const owner=await get(account,"id");
    if(String(owner?.id||"")!==account)return null;
    if(decision.stage==="ap5c"){
      const receipt=await verifyAuthenticatedInstagramReceipt({...entry.record,fields:{...entry.record.fields,Content_Profile:[entry.profileId]}},{settings:{META_GRAPH_API_ACCESS_TOKEN:token,META_GRAPH_API_VERSION:version},expectedAccountId:account});
      if(!receipt.verified_public||!receipt.ownership_verified||receipt.summary?.media_type!=="CAROUSEL_ALBUM")return null;
      return {account,receipt};
    }
    if(["ap3p","ap4c"].includes(decision.stage)){
      const id=String(val(entry.record,"IG_Carousel_Parent_Container_ID")||"");
      const parent=await get(id,"id,status_code");
      if(String(parent?.id||"")!==id||!["IN_PROGRESS","FINISHED"].includes(parent.status_code)||
         decision.stage==="ap4c"&&parent.status_code!=="FINISHED")return null;
    }
  }else{
    const owner=await get("me","id");
    if(String(owner?.id||"")!==account)return null;
    if(decision.stage==="fb3"){
      const id=String(val(entry.record,"Platform_Post_ID")||"");
      if(!id.startsWith(account+"_"))return null;
      const post=await get(id,"id,from,created_time,permalink_url");
      let url;try{url=new URL(post?.permalink_url);}catch{return null;}
      if(post?.id!==id||String(post?.from?.id||"")!==account||!Number.isFinite(ms(post.created_time))||
         ms(post.created_time)>Date.now()||url.protocol!=="https:"||
         !["facebook.com","www.facebook.com"].includes(url.hostname)||url.username||url.password||url.port)return null;
      return {account,receipt:{remote_id:id,permalink:url.href,published_at:post.created_time}};
    }
  }
  return {account};
}

// A matching permalink and timestamp alone cannot prove the canonical remote ID.
export function exactGalleryFinalizationReadback(before,after,receipt){
  const r=before?.row,v=after?.row;
  if(!r||!v||!after.record||!present(receipt?.remote_id)||!present(receipt?.permalink)||
     !Number.isFinite(ms(receipt?.published_at)))return false;
  const ig=r.platform==="Instagram";
  if(!ig&&r.platform!=="Facebook")return false;
  const post=String(val(after.record,"Platform_Post_ID")||"");
  const media=String(val(after.record,"IG_Carousel_Published_Media_ID")||"");
  const generic=String(val(after.record,"Platform_Media_ID")||"");
  const remote=String(receipt.remote_id);
  const ids=(ig?[post,media,generic]:[post,generic]).filter(Boolean);
  return after.profileId===before.profileId&&v.airtable_record_id===r.airtable_record_id&&
    v.platform===r.platform&&v.content_item_airtable_id===r.content_item_airtable_id&&
    ids.length>0&&ids.every(id=>id===remote)&&(ig?Boolean(post||media):Boolean(post))&&
    v.output_status==="Published"&&v.publish_status==="Published"&&
    v.platform_post_url===receipt.permalink&&Number.isFinite(ms(v.published_at))&&
    Math.abs(ms(v.published_at)-ms(receipt.published_at))<=120000&&
    v.review_status===r.review_status&&v.do_not_publish===r.do_not_publish&&
    v.scheduled_post_date===r.scheduled_post_date&&v.studio_scheduled_at===r.studio_scheduled_at;
}

export async function runStagedGalleryRecovery(env,{now=Date.now,rest=(path,opts)=>supabaseRest(env,path,opts),
  read=async id=>(await factorySupabaseApprovalRows(env,[id])).get(id),
  lock=(id,fn)=>withOutputApprovalLock(env.STUDIO_MEDIA,id,fn),
  pulse=(stage,record)=>pulses[stage](env,record),
  promote=record=>studioPromoteDuePublishStatus(env,record),
  reservation=(entry)=>readScheduleReservationLane(env,{content_profile_id:entry.profileId,platform:entry.row.platform}),
  owner=(entry,decision)=>verifyGalleryOwner(env,entry,decision),
  sourceOk=()=>studioWriteSource(env)==="supabase"&&studioSupabaseConfigured(env),
  backendOk=(platform)=>pipelineStageBackend(env,platform==="Instagram"?"AP0C":"FB0").mode==="python"&&
    (platform!=="Facebook"||!studioFacebookGraphPublishHeld(env))}={}) {
  if(env.STUDIO_3159_GALLERY_DISABLED==="true"||!sourceOk()||!env.STUDIO_MEDIA)return {status:"unavailable",reason:"canonical_source_required"};
  const at=now();
  if(!Number.isFinite(at)||at<=GALLERY_STAGE_CUTOFF)return {status:"skipped",reason:"cutoff"};
  const bucket=env.STUDIO_MEDIA;
  const canary=await getMarker(bucket,canaryKey);
  // One output for this entire activation; never silently expand to another.
  if(canary && (!idOk(canary.id)||canary.version!==1))return {status:"blocked",reason:"canary_identity_unverified"};
  // Only indexed recent due slots, never the historic backlog or blank slots.
  const from=new Date(Math.max(at-HOUR,GALLERY_STAGE_CUTOFF)).toISOString(),to=new Date(at).toISOString();
  const list=await rest("platform_outputs?test_run_id=is.null&do_not_publish=eq.false&auto_publish_enabled=eq.true&review_status=eq.Approved&output_status=eq.Approved%20for%20Publishing&published_at=is.null&platform_output_type=in.(Instagram%20Carousel,Facebook%20Photo%20Set)&scheduled_post_date=gt."+encodeURIComponent(from)+"&scheduled_post_date=lte."+encodeURIComponent(to)+"&select=airtable_record_id&order=scheduled_post_date.asc,airtable_record_id.asc&limit=12");
  if(!Array.isArray(list))throw Error("staged_gallery_inventory_unavailable");
  const load=async id=>{
    const entry=await read(id);
    if(!entry?.row)return null;
    const route=await rest("platform_outputs?airtable_record_id=eq."+encodeURIComponent(id)+"&select=id,fb_resolved_publish_mode,updated_at&limit=2");
    if(!Array.isArray(route)||route.length!==1||route[0].id!==entry.row.id||route[0].updated_at!==entry.row.updated_at)return null;
    entry.row.fb_resolved_publish_mode=route[0].fb_resolved_publish_mode;
    return entry;
  };
  for(const candidate of (canary?[{airtable_record_id:canary.id}]:list)) {
    const id=candidate.airtable_record_id;
    if(!idOk(id))continue;
    let outcome;
    try {
      outcome=await lock(id,async()=>{
        const entry=await load(id);
        const marker=await getMarker(bucket,markerKey(id));
        const decision=stagedGalleryCandidate(entry,now(),marker);
        if(!decision.ok)return {status:"skipped",reason:decision.reason};
        const r=entry.row;
        if(!committedGalleryReservation(entry,await reservation(entry)))return {status:"skipped",reason:"exact_committed_reservation_unverified"};
        if(!backendOk(r.platform)||studioPublishDispatchTarget(entry.record)?.target!==(r.platform==="Instagram"?"AP0C":"FB0"))
          return {status:"skipped",reason:"native_python_route_unverified"};
        const hash=await fingerprint(entry);
        if(marker&&marker.package_sha256!==hash)return {status:"skipped",reason:"package_revision_changed"};
        const slides=await rest("carousel_slides?deleted_from_carousel=eq.false&fields->PO_Output_ID=cs."+encodeURIComponent(JSON.stringify([r.output_number]))+"&select=airtable_record_id,current_order,deleted_from_carousel,fields&order=current_order.asc,airtable_record_id.asc&limit=12");
        const verified=inspectNativeGalleryPublicationPackage(r,slides);
        if(!verified.eligible||!verified.applicable)return {status:"skipped",reason:verified.reason};
        if(decision.initial&&slides.some(s=>["IG_Child_Container_ID","FB_Photo_ID","IG_Child_Container_Response_JSON","FB_Photo_Response_JSON"].some(k=>present(s.fields?.[k])&& !["{}","[]"].includes(String(s.fields[k])))))
          return {status:"skipped",reason:"saved_child_evidence"};
        const evidence=await owner(entry,decision);
        if(!evidence?.account||marker&&marker.account!==evidence.account)return {status:"skipped",reason:"owner_or_destination_unverified"};
        if(canary&&canary.account!==evidence.account)return {status:"blocked",reason:"canary_destination_changed"};
        const latestBefore=await load(id);
        if(!latestBefore||!same(latestBefore.row,r)||await fingerprint(latestBefore)!==hash||
           !committedGalleryReservation(latestBefore,await reservation(latestBefore)))return {status:"blocked",reason:"authority_changed_before_stage"};
        const stageKey=prefix+id+"/"+decision.stage+".json";
        if(!decision.initial&&!polls.has(decision.stage)&&await bucket.get(stageKey))return {status:"skipped",reason:"stage_already_entered_reconcile"};
        const slot=Math.floor(now()/FIVE);
        // Atomic global one-stage budget across isolates. No releasing on timeout.
        if(!await claim(bucket,prefix+"tick/"+slot+".json",{id,stage:decision.stage,slot}))return {status:"budget_used"};
        if(decision.initial){
          if(canary||!await claim(bucket,canaryKey,{version:1,id,account:evidence.account,at:now()}))return {status:"blocked",reason:"single_canary_already_reserved"};
          const proof={version:"3159-gallery-v1",output_record_id:id,profile_id:entry.profileId,due_ms:decision.due,
            asset_revision:r.asset_set_revision??null,package_sha256:hash,started_ms:now(),account:evidence.account,
            state:"dispatch_entered",requires_provider_reconciliation_before_reentry:true};
          if(!await claim(bucket,markerKey(id),proof))return {status:"blocked",reason:"initial_fence_unverified"};
          if(r.publish_status!=="Ready to Publish")await promote(entry.record);
          const latest=await load(id);
          if(!latest||latest.row.publish_status!=="Ready to Publish"||await fingerprint(latest)!==hash||
              !stagedGalleryCandidate(latest,now(),null).ok||
              !committedGalleryReservation(latest,await reservation(latest)))return {status:"blocked",reason:"fresh_promotion_unverified"};
          entry.record=latest.record;
        } else if(!polls.has(decision.stage)&&!await claim(bucket,stageKey,{id,stage:decision.stage,due_ms:decision.due,package_sha256:hash}))
          return {status:"blocked",reason:"stage_fence_unverified"};
        // No fallback webhook, AP4R/FB2R caption-only match, retry/reset, or
        // general publisher call. Runner retains exact stage eligibility.
        // For finalization the provider evidence was obtained from the exact
        // owned remote ID before the existing status-only Runner call.
        const result=await pulse(decision.stage,entry.record);
        if(evidence.receipt){
          const after=await load(id),v=after?.row;
          const verified=exactGalleryFinalizationReadback(entry,after,evidence.receipt);
          if(verified&&await claim(bucket,prefix+"verified/"+id+".json",{id,output:r.output_number,remote:evidence.receipt.remote_id,published_at:v.published_at,checked_at:now()}))
            return {status:"verified_publication",output:r.output_number,stage:decision.stage};
          return {status:"finalization_unconfirmed_no_replay",output:r.output_number};
        }
        return {status:result?.ok===false?"stage_unconfirmed":"stage_returned",stage:decision.stage,output:r.output_number,
          skipped:!!result?.skipped};
      });
    }catch{ return {status:"stage_unconfirmed",reason:"read_or_stage_failed_no_replay"}; }
    if(outcome.status!=="skipped")return outcome;
  }
  return {status:"no_eligible_gallery",inspected:list.length};
}
