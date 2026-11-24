/**
 * #2853 bounded automatic review handoff recovery for already verified
 * native TikTok media. Never creates media, gallery slides or destinations,
 * never clears a hold, records a human approval, schedules or publishes.
 * Repair only a stale status after exact current package/parent proof.
 */
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import { runnerWorkerLease, startRunnerWorkerLeaseHeartbeat } from "./worker-shared-admission.mjs";
import { supabaseRest } from "./supabase-pipeline-reads.mjs";

const REC=/^rec[A-Za-z0-9]{14}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const CDN="https://media.chicagoshining.com/";
const asString=v=>String(v??"").trim();
const field=(col,v)=>col+"="+(v==null?"is.null":"eq."+encodeURIComponent(String(v)));
const safeUrl=v=>typeof v==="string"&&v.startsWith(CDN)&&!v.includes("?")&&!v.includes("#");
const blocked=reason=>({eligible:false,reason});
const ownedProofKey="SM_Quality_Native_Variant_Repair_v1";
const repairKey="SM_Quality_Factory_Handoff_Repair_v1";
const staleDraftRepairKey="SM_Quality_Stale_TikTok_Review_Repair_v1";
export const STALE_TIKTOK_REVIEW_REASON="stale_tiktok_waiting_schedule_blocks_review";
const MAX_BYTES=8*1024*1024;
const MAX_IMAGES=10;
export const TARGET_FIELDS=[
  "id","airtable_record_id","output_number","content_item_id","content_profile_id",
  "platform","studio_output_type","platform_output_type","aspect_ratio","output_status",
  "review_status","render_status","publish_status","output_caption","selected_clip_count",
  "selected_assets","render_clip_list","studio_preview_url","thumbnail_url","do_not_publish",
  "auto_publish_enabled","publish_retry_eligible","test_run_id","scheduled_post_date",
  "studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url",
  "platform_publish_response","platform_publish_response_text","publish_asset_url","tiktok_draft_status","updated_at","error_messages",
].join(",");
const providerKeys=/^(?:Platform_(?:Post|Media)_ID|Publish_(?:Started|Locked)_At|Studio_Publish_Dispatch_(?:At|Count)|IG_Story_(?:Container|Post)_ID|IG_(?:Carousel|Reel)_Container_ID|FB_(?:Post|Video|Reel)_ID|YouTube_(?:Video_ID|Upload_ID)|TikTok_(?:Publish_ID|Draft_ID|Draft_Publish_ID|Upload_ID)|Last_Publish_Attempt_At|.*(?:Publish|Draft|Story|Reel|Carousel)_Attempt_Count)$/i;
export function hasProviderEvidence(bag) {
  return Object.entries(bag).some(([k,v])=>providerKeys.test(k)&&
    v!==null&&v!==undefined&&v!==false&&v!==0&&v!=="0"&&v!=="");
}
function clipsMatch(clips,assets) {
  return Array.isArray(clips)&&clips.length===assets.length&&clips.every((c,i)=>{
    const a=assets[i];
    return Number(c?.order)===i+1&&asString(c.url||c.src)===a.url
      &&asString(c.google_drive_file_id||c.googleDriveFileId)===a.drive_id
      &&asString(c.media_asset_record_id||c.mediaAssetRecordId)===a.media_asset_id
      &&c.verified_media_sha256===a.sha256&&c.source_transfer_id===a.transfer_id
      &&c.watermarked===true&&c.lettered===false&&c.aspect_ratio==="9:16";
  });
}
export function assessVerifiedNativeReviewRepair(row) {
  if(!row||!UUID.test(asString(row.id))||!REC.test(asString(row.airtable_record_id))
    ||!UUID.test(asString(row.content_item_id))||!UUID.test(asString(row.content_profile_id))
    ||!Number.isSafeInteger(row.output_number)||row.output_number<=0||!row.updated_at)
    return blocked("unverified_output_identity");
  const staleDraft=row.output_status==="Ready for Review"&&row.review_status==="Review Sent"
    &&row.publish_status==="Not Ready"&&row.tiktok_draft_status==="Waiting for Schedule";
  const receiptKey=staleDraft?staleDraftRepairKey:repairKey;
  if(row.platform!=="TikTok"||row.studio_output_type!=="Multi-Photo"||row.aspect_ratio!=="9:16"
    ||(!staleDraft&&row.output_status!=="In Production")||row.render_status!=="Native Photo Route"
    ||!["","Pending","Pending Review","Review Sent"].includes(asString(row.review_status))
    ||!["","Not Ready"].includes(asString(row.publish_status)))
    return blocked("not_stale_native_review_handoff");
  if(row.do_not_publish!==false||row.auto_publish_enabled!==false||row.publish_retry_eligible===true
    ||row.test_run_id||row.scheduled_post_date||row.studio_scheduled_at||row.youtube_scheduled_publish_at
    ||row.published_at||row.platform_post_url||row.platform_publish_response||row.platform_publish_response_text||row.publish_asset_url||(!staleDraft&&row.tiktok_draft_status))
    return blocked("hold_test_or_publishing_evidence");
  const bag=row.error_messages;
  if(!bag||typeof bag!=="object"||Array.isArray(bag)||bag[receiptKey]
    ||bag.Studio_Render_Review_Hold_Active||bag.Factory_Review_Handoff_Safety_Hold_At
    ||bag.SM_2618_Creative_QA_Hold?.publishing_permitted===false
    ||bag.SM_Factory_Held_Review_Receipt||hasProviderEvidence(bag))
    return blocked("hold_or_prior_provider_evidence");
  const proof=bag[ownedProofKey], stage=proof?.stage_receipt, assets=stage?.assets;
  if(!proof||proof.provider_writes!==0||stage?.verified!==true||stage.source_writes!==0
    ||stage.provider_writes!==0||Number(stage.output)!==row.output_number
    ||Number(stage.source_output)!==Number(proof.source_output)||!Number.isSafeInteger(Number(stage.source_output))
    ||Number(stage.source_output)===row.output_number||!Number.isFinite(Date.parse(proof.at))
    ||!Number.isFinite(Date.parse(stage.target_updated_at))||Date.parse(proof.at)<Date.parse(stage.target_updated_at)
    ||!Array.isArray(assets)||assets.length<2||assets.length>MAX_IMAGES
    ||row.selected_clip_count!==assets.length)
    return blocked("missing_protected_exact_variant_receipt");
  const oldApproval=Date.parse(bag.SM_Factory_Supabase_Approval_Receipt?.approved_at||"");
  if(Number.isFinite(oldApproval)&&Date.parse(proof.at)<=oldApproval)
    return blocked("current_revision_not_newer_than_historical_approval");
  const unique=new Set();
  for(let i=0;i<assets.length;i++){
    const a=assets[i];
    if(!a||a.index!==i+1||a.cdn_verified!==true||a.geometry!=="1080x1920"
      ||!safeUrl(a.url)||!SHA.test(a.sha256)||!REC.test(a.media_asset_id)
      ||!asString(a.drive_id)||!asString(a.transfer_id)||!asString(a.asset_name)
      ||unique.has(a.media_asset_id))return blocked("invalid_ordered_variant_receipt");
    unique.add(a.media_asset_id);
  }
  if(!asString(row.output_caption)||row.studio_preview_url!==assets[0].url
    ||row.thumbnail_url!==assets[0].url||!clipsMatch(row.selected_assets?.selected_clips,assets)
    ||!clipsMatch(row.render_clip_list,assets))
    return blocked("current_revision_does_not_match_protected_receipt");
  return {eligible:true,reason:staleDraft?STALE_TIKTOK_REVIEW_REASON:"verified_native_status_handoff",staleDraft,receiptKey,source_output:Number(stage.source_output),assets,proof_at:proof.at};
}
function exactOne(rows){return Array.isArray(rows)&&rows.length===1?rows[0]:null;}
const uniqueIds=rows=>new Set(rows.map(x=>x.airtable_record_id)).size===rows.length;
function assetsOwned(assets,rows,profileRecord){
  if(!Array.isArray(rows)||rows.length!==assets.length||!uniqueIds(rows))return false;
  const byId=new Map(rows.map(x=>[x.airtable_record_id,x]));
  return assets.every(a=>{
    const r=byId.get(a.media_asset_id),m=r?.metadata;
    return r?.active===true&&r.do_not_use===false&&r.asset_status==="Available"&&r.media_class==="Image"
      &&r.google_drive_file_id===a.drive_id&&r.asset_name===a.asset_name
      &&m?.rights_status==="Owned"&&m.content_profile_airtable_id===profileRecord
      &&m.studio_transfer_id===a.transfer_id;
  });
}
async function exactOwner(read,row,decision){
  const c=exactOne(await read("content_items?"+field("id",row.content_item_id)
    +"&select=id,content_profile_id,production_request_id&limit=2"));
  if(!c||c.content_profile_id!==row.content_profile_id||!UUID.test(c.production_request_id))return null;
  const p=exactOne(await read("production_requests?"+field("id",c.production_request_id)
    +"&select=id,promoted_content_item_id,idea_candidate_id,request_status,output_plan_status,output_plan,production_job,updated_at&limit=2"));
  if(!p||p.promoted_content_item_id!==c.id||p.request_status!=="Promoted"||p.output_plan_status!=="Ready"
    ||p.production_job?.step!=="done"||!UUID.test(p.idea_candidate_id))return null;
  const plan=p.output_plan?.items;
  if(!Array.isArray(plan)||plan.filter(x=>x?.enabled!==false&&x?.platform==="TikTok"
    &&(x.output_type||x.studio_output_type)==="Multi-Photo").length!==1||plan.filter(x=>x?.enabled!==false&&x?.platform==="Instagram"&&(x.output_type||x.studio_output_type)==="Carousel").length!==1)return null;
  const idea=exactOne(await read("idea_candidates?"+field("id",p.idea_candidate_id)
    +"&select=id,airtable_record_id,content_profile_id&limit=2"));
  const profile=exactOne(await read("content_profiles?"+field("id",row.content_profile_id)
    +"&select=id,airtable_record_id&limit=2"));
  if(!idea||idea.content_profile_id!==row.content_profile_id||!REC.test(idea.airtable_record_id)
    ||!profile||!REC.test(profile.airtable_record_id))return null;
  const sibling=exactOne(await read("platform_outputs?"+field("output_number",decision.source_output)
    +"&select=id,content_item_id,content_profile_id,platform,studio_output_type,selected_clip_count,selected_assets,updated_at&limit=2"));
  if(!sibling||sibling.content_item_id!==row.content_item_id||sibling.content_profile_id!==row.content_profile_id
    ||sibling.platform!=="Instagram"||sibling.studio_output_type!=="Carousel"
    ||sibling.selected_clip_count!==decision.assets.length)return null;
  const siblingClips=sibling.selected_assets?.selected_clips;
  if(!Array.isArray(siblingClips)||siblingClips.length!==decision.assets.length)return null;
  const ids=siblingClips.map(x=>asString(x.media_asset_record_id||x.mediaAssetRecordId));
  if(ids.some(x=>!REC.test(x))||new Set(ids).size!==ids.length)return null;
  const targets=decision.assets.map(x=>x.media_asset_id);
  const all=[...new Set([...ids,...targets])];
  if(all.length!==2*ids.length)return null;
  const records=await read("media_assets?airtable_record_id=in.("+all.join(",")+")"
    +"&select=airtable_record_id,asset_name,media_class,active,do_not_use,asset_status,google_drive_file_id,metadata&limit="+(all.length+1));
  if(!Array.isArray(records)||records.length!==all.length||!uniqueIds(records))return null;
  if(!assetsOwned(decision.assets,records.filter(x=>targets.includes(x.airtable_record_id)),profile.airtable_record_id))return null;
  const map=new Map(records.map(x=>[x.airtable_record_id,x]));
  const stemsMatch=ids.every((id,i)=>{
    const s=map.get(id),m=s?.metadata,t=decision.assets[i];
    return s?.active===true&&s.do_not_use===false&&s.asset_status==="Available"&&s.media_class==="Image"
      &&m?.rights_status==="Owned"&&m.content_profile_airtable_id===profile.airtable_record_id
      &&s.google_drive_file_id===asString(siblingClips[i].google_drive_file_id||siblingClips[i].googleDriveFileId)
      &&asString(m.studio_transfer_id).endsWith("-4x5")&&t.transfer_id.endsWith("-9x16")
      &&m.studio_transfer_id.slice(0,-4)===t.transfer_id.slice(0,-5);
  });
  if(!stemsMatch)return null;
  return {ideaRecord:idea.airtable_record_id,parentVersion:p.updated_at,siblingVersion:sibling.updated_at};
}
export async function verifyBytes(assets,transport=fetch){
  for(const a of assets){
    const response=await transport(a.url,{method:"GET",redirect:"error",headers:{"Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(12000)});
    const size=Number(response.headers.get("Content-Length"));
    if(!response.ok||!/^image\/jpeg(?:;|$)/i.test(response.headers.get("Content-Type")||"")
      ||!Number.isSafeInteger(size)||size<4||size>MAX_BYTES||!response.body){
      await response.body?.cancel();return false;
    }
    const reader=response.body.getReader();let total=0;const chunks=[];
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;
        total+=value.byteLength;if(total>size||total>MAX_BYTES){await reader.cancel();return false;}chunks.push(value);}
    }finally{reader.releaseLock();}
    if(total!==size)return false;
    const buf=new Uint8Array(size);let at=0;
    for(const chunk of chunks){buf.set(chunk,at);at+=chunk.length;}
    if(buf[0]!==255||buf[1]!==216)return false;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buf)),v=>v.toString(16).padStart(2,"0")).join("");
    if(hash!==a.sha256)return false;
  }
  return true;
}
/** One candidate, one durable attempt per exact protected proof. An ambiguous
 * commit stays fenced for reconciliation; no blind retry. */
export async function recoverOneVerifiedNativeReview(env, report, {
  read=path=>supabaseRest(env,path),
  patch=(path,body)=>supabaseRest(env,path,{method:"PATCH",body,headers:{Prefer:"return=representation"}}),
  lock=(id,fn)=>withOutputApprovalLock(env.STUDIO_MEDIA,id,fn),
  claim=(idea,token)=>runnerWorkerLease(env,"claim",idea,token),
  release=(idea,token)=>runnerWorkerLease(env,"release",idea,token),
  heartbeat=(idea,token)=>startRunnerWorkerLeaseHeartbeat(env,idea,token),
  checkBytes=verifyBytes,
  bucket=env.STUDIO_MEDIA,now=()=>new Date(),
}={}){
  const no=reason=>({status:"skipped",reason,approval_actions:0,schedule_actions:0,publish_actions:0});
  if(report?.status!=="ok"||!Array.isArray(report.findings))return no("detector_unavailable");
  const finding=report.findings.find(x=>["review_handoff_status_mismatch",STALE_TIKTOK_REVIEW_REASON].includes(x.reason)&&REC.test(asString(x.record_id)));
  if(!finding)return no("no_exact_candidate");
  const id=finding.record_id;
  const load=async()=>exactOne(await read("platform_outputs?"+field("airtable_record_id",id)+"&select="+TARGET_FIELDS+"&limit=2"));
  return lock(id,async()=>{
    const row=await load(), decision=assessVerifiedNativeReviewRepair(row);
    if(!decision.eligible||decision.staleDraft!==(finding.reason===STALE_TIKTOK_REVIEW_REASON)||String(row.content_item_id)!==String(finding.content_item_id)
      ||Number(row.output_number)!==Number(finding.output_id))return no(decision.reason);
    const ownership=await exactOwner(read,row,decision);
    if(!ownership)return no("exact_parent_or_owned_variants_unverified");
    const token=crypto.randomUUID();
    const admission=await claim(ownership.ideaRecord,token);
    if(!admission.admitted){
      await release(ownership.ideaRecord,token).catch(()=>{});
      return {...no("shared_admission_denied"),admission_reason:admission.reason||"unknown",
        admission_http_status:admission.http_status??null};
    }
    let pulse;
    try{
      pulse=heartbeat(ownership.ideaRecord,token);
      if(!await checkBytes(decision.assets))return no("public_media_hash_unverified");
      const latest=await load();
      const again=assessVerifiedNativeReviewRepair(latest);
      if(!again.eligible||again.reason!==decision.reason||latest.updated_at!==row.updated_at)return no("concurrent_output_revision");
      const ownerAgain=await exactOwner(read,latest,again);
      if(!ownerAgain||JSON.stringify(ownerAgain)!==JSON.stringify(ownership))return no("concurrent_owner_revision");
      pulse.assertOwned();
      const rev=decision.assets.map(a=>a.sha256).join(":")+":"+decision.proof_at;
      const reservationRev=decision.staleDraft?rev+":"+STALE_TIKTOK_REVIEW_REASON:rev;
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(reservationRev))),v=>v.toString(16).padStart(2,"0")).join("");
      const key="studio/state/quality-factory-handoff/v1/"+row.id+"/"+digest+".json";
      const receipt={schema:"studio.quality.native-review-handoff.1",at:now().toISOString(),
        output_id:row.output_number,proof_at:decision.proof_at,proof_sha256:digest,
        source_output:decision.source_output,repair_signature:decision.reason,provider_writes:0,approval_actions:0,schedule_actions:0,
        publishing_authorized:false,requires_human_approval:true};
      const reserved=await bucket.put(key,JSON.stringify({...receipt,state:"reserved",owner:token}),{
        onlyIf:new Headers({"If-None-Match":"*"}),httpMetadata:{contentType:"application/json"}});
      if(!reserved)return no("exact_revision_already_attempted");
      pulse.assertOwned();
      const path="platform_outputs?"+field("id",row.id)+"&"+field("airtable_record_id",id)
        +"&"+field("updated_at",row.updated_at)+"&"+field("output_status",row.output_status)
        +(decision.staleDraft?"&tiktok_draft_status=eq.Waiting%20for%20Schedule":"")
        +"&render_status=eq.Native%20Photo%20Route&do_not_publish=eq.false&auto_publish_enabled=eq.false"
        +"&test_run_id=is.null&published_at=is.null&platform_post_url=is.null"
        +"&scheduled_post_date=is.null&studio_scheduled_at=is.null&youtube_scheduled_publish_at=is.null"
        +"&"+field("review_status",row.review_status)+"&"+field("publish_status",row.publish_status);
      const mutation=decision.staleDraft?{tiktok_draft_status:null}:{output_status:"Ready for Review",review_status:"Review Sent"};
      if(decision.staleDraft)receipt.prior_tiktok_draft_status=row.tiktok_draft_status;
      const changed=await patch(path,{...mutation,
        error_messages:{...latest.error_messages,[decision.receiptKey]:receipt},updated_at:receipt.at});
      if(!Array.isArray(changed)||changed.length!==1)throw Error("native_handoff_commit_unverified");
      const after=await load();
      if(!after||after.output_status!=="Ready for Review"||after.review_status!=="Review Sent"
        ||after.do_not_publish!==false||after.auto_publish_enabled!==false||after.scheduled_post_date
        ||after.published_at||after.publish_status!=="Not Ready"&&decision.staleDraft
        ||(decision.staleDraft&&after.tiktok_draft_status!==null)
        ||after.error_messages?.[decision.receiptKey]?.proof_sha256!==digest)
        throw Error("native_handoff_readback_unverified");
      await bucket.put(key,JSON.stringify({...receipt,state:"repaired",owner:token}),{
        onlyIf:{etagMatches:reserved.etag},httpMetadata:{contentType:"application/json"}});
      return {...receipt,status:"repaired"};
    }finally{
      if(pulse)await pulse.stop();
      await release(ownership.ideaRecord,token).catch(()=>{});
    }
  });
}
