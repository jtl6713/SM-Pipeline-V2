/**
 * QA-TIKTOK-STALE-SCHEDULE-RFR-v1: rebuild a documented incorrect native
 * package from an exact, verified same-content Instagram sibling.
 * No provider calls, approval, schedule, hold release or source-row writes.
 */
import { matchesStaleTikTokReviewSignature } from "./quality-factory-handoff.mjs";
import { TARGET_FIELDS,hasProviderEvidence,verifyBytes,recoverOneVerifiedNativeReview } from "./quality-native-review-repair.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import { runnerWorkerLease,startRunnerWorkerLeaseHeartbeat } from "./worker-shared-admission.mjs";
import { supabaseRest } from "./supabase-pipeline-reads.mjs";

const REC=/^rec[A-Za-z0-9]{14}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const MARK="SM_Quality_Native_Media_Rebuild_v1";
const OLD="SM_NYC_Sibling_Visual_QA_Hold_20261122";
const PREFIX="studio/state/factory-approvals/v2/";
const one=x=>Array.isArray(x)&&x.length===1?x[0]:null;
const f=(k,v)=>k+"="+(v==null?"is.null":"eq."+encodeURIComponent(String(v)));
const clone=x=>JSON.parse(JSON.stringify(x));
const no=reason=>({status:"skipped",reason,approval_actions:0,schedule_actions:0,publish_actions:0});
const terminalJob=s=>["completed","failed","cancelled","canceled"].includes(s);
const terminalItem=s=>["approved","already_satisfied","failed","skipped","rejected","cancelled","canceled"].includes(s);

export function rebuildCandidate(row) {
  const b=row?.error_messages;
  return Boolean(matchesStaleTikTokReviewSignature(row)&&REC.test(row.airtable_record_id)&&UUID.test(row.id)
    &&UUID.test(row.content_item_id)&&UUID.test(row.content_profile_id)&&Number.isSafeInteger(row.output_number)
    &&row.updated_at&&row.output_caption&&row.output_title&&!row.final_file_url
    &&!row.publish_retry_eligible&&!row.platform_publish_response&&!row.platform_publish_response_text&&!row.publish_asset_url
    &&b&&typeof b==="object"&&!Array.isArray(b)&&!b[MARK]&&!b.SM_Quality_Native_Variant_Repair_v1
    &&!b.Studio_Render_Review_Hold_Active&&!b.Factory_Review_Handoff_Safety_Hold_At
    &&!b.SM_Factory_Held_Review_Receipt&&b.SM_2618_Creative_QA_Hold?.publishing_permitted!==false
    &&!hasProviderEvidence(b)
    // A stale flag alone is not evidence of incorrect media. Require a
    // documented visual correction with fresh human reapproval mandated.
    &&b[OLD]?.source_replacement_required===true&&b[OLD]?.manual_reapproval_required===true
    &&b[OLD]?.no_recorded_native_or_dispatch_attempt===true&&b[OLD]?.provider_writes===0);
}
async function readLedger(bucket,key) {
  const o=await bucket.get(key);if(!o)return null;
  if(!Number.isFinite(Number(o.size))||Number(o.size)>8_000_000)throw Error("factory_ledger_unavailable");
  return JSON.parse(await o.text());
}
export async function oldClaimSafe(bucket,profile,id,version) {
  const registry=await readLedger(bucket,PREFIX+"output-claims-v1/"+profile+".json");
  if(!registry)return true;
  if(registry.schema!=="studio.factory-output-claims.1"||registry.profile_id!==profile)return false;
  const claim=registry.outputs?.[id];if(!claim)return true;
  const rid=claim.request_id;
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(rid||"")||!Number.isFinite(Date.parse(claim.at))||Date.parse(claim.at)>=Date.parse(version))return false;
  const parent=await readLedger(bucket,PREFIX+"groups/"+rid+".json");
  let jobId=rid;
  if(parent){
    if(parent.schema!=="studio.factory-approval-group.1"||parent.request_id!==rid
      ||!parent.records?.some(x=>x.id===id&&x.profile_id===profile))return false;
    const children=(parent.children||[]).filter(x=>x.profile_id===profile);
    if(children.length!==1)return false;
    jobId=children[0].request_id;
  }
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(jobId||""))return false;
  const job=await readLedger(bucket,PREFIX+"jobs/"+profile+"/"+jobId+".json");
  if(!job||job.profile_id!==profile||job.request_id!==jobId||(parent&&job.group_request_id!==rid)
    ||!terminalJob(job.status))return false;
  const items=(job.items||[]).filter(x=>x.id===id);
  const stamp=items[0]?.updated_at||job.updated_at;
  return items.length===1&&terminalItem(items[0].status)&&Number.isFinite(Date.parse(stamp))
    &&Date.parse(stamp)<Date.parse(version);
}
const sourceUrl=/^https:\/\/media\.chicagoshining\.com\/studio\/previews\/repairs\/issue[0-9]+\/[A-Za-z0-9_-]+\/slide-[0-9]+-([a-f0-9]{16})\.jpg$/;
async function sourcePackage(read,row) {
  const c=one(await read("content_items?"+f("id",row.content_item_id)+"&select=id,content_profile_id,production_request_id&limit=2"));
  if(!c||c.content_profile_id!==row.content_profile_id||!UUID.test(c.production_request_id))return null;
  const p=one(await read("production_requests?"+f("id",c.production_request_id)+"&select=id,promoted_content_item_id,idea_candidate_id,request_status,output_plan_status,output_plan,production_job,updated_at&limit=2"));
  if(!p||p.promoted_content_item_id!==c.id||p.request_status!=="Promoted"||p.output_plan_status!=="Ready"||p.production_job?.step!=="done"||!UUID.test(p.idea_candidate_id))return null;
  const plan=p.output_plan?.items||[];
  for(const [platform,type] of [["Instagram","Carousel"],["TikTok","Multi-Photo"]])
    if(plan.filter(x=>x.enabled!==false&&x.platform===platform&&(x.output_type||x.studio_output_type)===type).length!==1)return null;
  const idea=one(await read("idea_candidates?"+f("id",p.idea_candidate_id)+"&select=airtable_record_id,content_profile_id&limit=2"));
  const profile=one(await read("content_profiles?"+f("id",row.content_profile_id)+"&select=airtable_record_id&limit=2"));
  if(!idea||idea.content_profile_id!==row.content_profile_id||!REC.test(idea.airtable_record_id)||!REC.test(profile?.airtable_record_id))return null;
  const sibling=one(await read("platform_outputs?"+f("content_item_id",c.id)+"&platform=eq.Instagram&studio_output_type=eq.Carousel&test_run_id=is.null&select=airtable_record_id,output_number,content_profile_id,output_title,output_caption,output_status,review_status,selected_assets,selected_clip_count,updated_at&limit=2"));
  if(!sibling||sibling.content_profile_id!==row.content_profile_id||!REC.test(sibling.airtable_record_id)||!Number.isSafeInteger(sibling.output_number)
    ||sibling.output_title!==row.output_title||sibling.output_caption!==row.output_caption
    ||sibling.review_status!=="Approved"||!["Approved for Publishing","Published"].includes(sibling.output_status))return null;
  const clips=sibling.selected_assets?.selected_clips;
  if(!Array.isArray(clips)||clips.length<2||clips.length>8||sibling.selected_clip_count!==clips.length)return null;
  const ids=clips.map(x=>x.media_asset_record_id||x.mediaAssetRecordId);
  if(ids.some(x=>!REC.test(x))||new Set(ids).size!==ids.length)return null;
  const rows=await read("media_assets?airtable_record_id=in.("+ids.join(",")+")&select=airtable_record_id,asset_name,google_drive_file_id,media_class,active,do_not_use,asset_status,metadata&limit="+(ids.length+1));
  if(!Array.isArray(rows)||rows.length!==ids.length||new Set(rows.map(x=>x.airtable_record_id)).size!==ids.length)return null;
  const slides=await read("carousel_slides?fields->PO_Output_ID=cs."+encodeURIComponent(JSON.stringify([sibling.output_number]))+"&deleted_from_carousel=eq.false&select=current_order,fields&order=current_order.asc&limit="+(ids.length+1));
  if(!Array.isArray(slides)||slides.length!==ids.length)return null;
  const assets=[];
  for(let i=0;i<ids.length;i++){
    const a=rows.find(x=>x.airtable_record_id===ids[i]),m=a?.metadata,b=slides[i]?.fields;
    const q=b?.SM_NYC_AI_Creative_QA_20261122,g=b?.SM_NYC_Shared_Small_Watermark_20261122;
    const unbranded=g?.source_unbranded_url, match=sourceUrl.exec(unbranded||"");
    const branded=b?.["Final Image URL"], drive=clips[i].google_drive_file_id||clips[i].googleDriveFileId;
    if(!a||!a.active||a.do_not_use!==false||a.asset_status!=="Available"||a.media_class!=="Image"
      ||m?.rights_status!=="Owned"||m.content_profile_airtable_id!==profile.airtable_record_id
      ||!m.studio_transfer_id||a.google_drive_file_id!==drive||Number(clips[i].order)!==i+1
      ||slides[i].current_order!==i+1||b?.["Platform Output"]?.length!==1||b["Platform Output"][0]!==sibling.airtable_record_id
      ||b.Asset_Family_Key!==ids[i]||b["Google Drive File ID"]!==drive||branded!==clips[i].url
      ||q?.brand_verified!==true||q?.source_owner_rights_verified!==true||g?.cdn_sha256_verified!==true
      ||g.geometry!=="1080x1350"||g.verified_branded_url!==branded||!SHA.test(g.branded_sha256||"")
      ||q.verified_branded_sha256!==g.branded_sha256||!match
      ||branded!==unbranded.replace(/\/slide-[0-9]+-[a-f0-9]{16}\.jpg$/, "/shared-small-bottom-right/slide-"+String(i+1).padStart(2,"0")+"-"+g.branded_sha256.slice(0,16)+".jpg"))return null;
    assets.push({index:i+1,media_asset_id:ids[i],asset_name:a.asset_name,drive_id:drive,transfer_id:m.studio_transfer_id,
      source_url:unbranded,source_hash_prefix:match[1],branded_url:branded,branded_sha256:g.branded_sha256});
  }
  return {idea:idea.airtable_record_id,profile:profile.airtable_record_id,parent_version:p.updated_at,
    source_output:sibling.output_number,source_version:sibling.updated_at,assets};
}
async function runnerStage(env,body){
  const base=String(env.PIPELINE_RUNNER_URL||"").replace(/\/+$/,""),secret=String(env.PIPELINE_RUNNER_SHARED_SECRET||"");
  if(!/^https:\/\//.test(base)||!secret)throw Error("rebuild_runner_unconfigured");
  const res=await fetch(base+"/internal/quality/native-media-rebuild",{method:"POST",redirect:"error",
    headers:{"Content-Type":"application/json","X-Pipeline-Secret":secret},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
  if(!res.ok)throw Error("rebuild_runner_not_verified");
  return res.json();
}
export function buildRebuiltPackage(row,source,stage,at){
  if(stage?.verified!==true||stage.output!==row.output_number||stage.source_output!==source.source_output
    ||stage.target_version!==row.updated_at||stage.source_version!==source.source_version
    ||stage.provider_writes!==0||stage.source_writes!==0||!Array.isArray(stage.assets)||stage.assets.length!==source.assets.length)return null;
  const assets=stage.assets;
  for(let i=0;i<assets.length;i++){
    const a=assets[i],s=source.assets[i];
    if(a.index!==i+1||a.media_asset_id!==s.media_asset_id||a.drive_id!==s.drive_id||a.transfer_id!==s.transfer_id
      ||a.asset_name!==s.asset_name||a.source_url!==s.source_url||a.branded_sha256!==s.branded_sha256
      ||!SHA.test(a.source_sha256||"")||!a.source_sha256.startsWith(s.source_hash_prefix)
      ||!SHA.test(a.sha256||"")||a.geometry!=="1080x1920"||a.cdn_verified!==true
      ||a.url!=="https://media.chicagoshining.com/studio/previews/watermarked/quality-native-rebuild/"+row.airtable_record_id+"/slide-"+String(i+1).padStart(2,"0")+"-"+a.sha256+".jpg")return null;
  }
  const clips=assets.map((a,i)=>({id:"studio-source-"+(i+1),order:i+1,url:a.url,src:a.url,asset_name:a.asset_name,
    assetName:a.asset_name,media_asset_record_id:a.media_asset_id,mediaAssetRecordId:a.media_asset_id,
    google_drive_file_id:a.drive_id,googleDriveFileId:a.drive_id,source_transfer_id:a.transfer_id,
    verified_media_sha256:a.sha256,source:"quality_owned_sibling_rebuild",aspect_ratio:"9:16",watermarked:true,lettered:false,
    media_kind:"photo",mediaKind:"photo",overlay:{enabled:false},caption:i===0?row.output_title:"",
    startFrame:i*150,durationFrames:150,inSeconds:0,outSeconds:5,fitMode:"full_with_solid_background",
    motionStyle:"none",motion:{type:"none",intensity:"normal"}}));
  const bag=clone(row.error_messages);
  bag[MARK]={at,signature:"QA-TIKTOK-STALE-SCHEDULE-RFR-v1",source_output:source.source_output,
    source_version:source.source_version,target_version:row.updated_at,assets,prior_tiktok_draft_status:row.tiktok_draft_status,
    prior_selected_assets:row.selected_assets,prior_render_clip_list:row.render_clip_list,prior_preview:row.studio_preview_url,
    prior_thumbnail:row.thumbnail_url,prior_technical_preflight:bag.SM_Scheduling_Approval_Preflight_v1||null,
    provider_writes:0,approval_actions:0,schedule_actions:0,publishing_authorized:false,requires_human_approval:true};
  delete bag.SM_Scheduling_Approval_Preflight_v1;
  for(let i=1;i<=3;i++){
    bag["Clip_"+i+"_URL"]=clips[i-1]?.url||null;
    bag["Selected_Clip_"+i+"_URL"]=clips[i-1]?.url||null;
    bag["Selected_Clip_"+i+"_Media_Asset_ID"]=clips[i-1]?.media_asset_record_id||null;
    bag["Clip_"+i+"_Duration_Frames"]=clips[i-1]?.durationFrames||null;
  }
  bag.Render_Total_Frames=clips.length*150;
  const selected={...row.selected_assets,aspect_ratio:"9:16",fps:30,target_total_frames:clips.length*150,selected_clips:clips,
    render_prep:{...row.selected_assets?.render_prep,render_status:"Native Photo Route",render_total_frames:clips.length*150,render_clip_list_json:JSON.stringify(clips)}};
  return {aspect_ratio:"9:16",selected_clip_count:clips.length,selected_assets:selected,render_clip_list:clips,
    studio_preview_url:clips[0].url,thumbnail_url:clips[0].url,tiktok_draft_status:null,error_messages:bag,updated_at:at};
}
export async function rebuildWrongNativeReview(env,report,{
  read=path=>supabaseRest(env,path),patch=(path,body)=>supabaseRest(env,path,{method:"PATCH",body,headers:{Prefer:"return=representation"}}),
  bucket=env.STUDIO_MEDIA,lock=(id,fn)=>withOutputApprovalLock(bucket,id,fn),
  claim=(idea,token)=>runnerWorkerLease(env,"claim",idea,token),release=(idea,token)=>runnerWorkerLease(env,"release",idea,token),
  heartbeat=(idea,token)=>startRunnerWorkerLeaseHeartbeat(env,idea,token),stage=body=>runnerStage(env,body),
  checkBytes=verifyBytes,claimSafe=(profile,id,version)=>oldClaimSafe(bucket,profile,id,version),now=()=>new Date()
}={}){
  const finding=report?.status==="ok"&&report.findings?.find(x=>x.reason==="stale_tiktok_waiting_schedule_blocks_review"&&REC.test(x.record_id));
  if(!finding)return no("no_exact_rebuild_candidate");
  const id=finding.record_id,load=async()=>one(await read("platform_outputs?"+f("airtable_record_id",id)+"&select="+TARGET_FIELDS+",output_title,final_file_url&limit=2"));
  return lock(id,async()=>{
    const row=await load();
    if(!rebuildCandidate(row)||row.output_number!==Number(finding.output_id)||row.content_item_id!==finding.content_item_id)return no("no_documented_safe_media_rebuild");
    const source=await sourcePackage(read,row);
    if(!source||!await claimSafe(source.profile,id,row.updated_at))return no("source_or_factory_claim_unverified");
    const token=crypto.randomUUID(),admission=await claim(source.idea,token);
    if(!admission.admitted){await release(source.idea,token).catch(()=>{});return no("shared_admission_denied");}
    let pulse;
    try{
      pulse=heartbeat(source.idea,token);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([row.updated_at,source])))),v=>v.toString(16).padStart(2,"0")).join("");
      const key="studio/state/quality-native-media-rebuild/v1/"+row.id+"/"+digest+".json";
      const reserved=await bucket.put(key,JSON.stringify({state:"reserved",token,at:now().toISOString()}),{onlyIf:new Headers({"If-None-Match":"*"})});
      if(!reserved)return no("exact_rebuild_revision_already_attempted");
      pulse.assertOwned();
      const receipt=await stage({output:row.output_number,record_id:id,target_version:row.updated_at,source_output:source.source_output,
        source_version:source.source_version,idea_id:source.idea,token,assets:source.assets});
      const mutation=buildRebuiltPackage(row,source,receipt,now().toISOString());
      if(!mutation||!await checkBytes(receipt.assets))throw Error("rebuild_media_proof_unverified");
      const latest=await load();
      if(!rebuildCandidate(latest)||latest.updated_at!==row.updated_at||JSON.stringify(await sourcePackage(read,latest))!==JSON.stringify(source)
        ||!await claimSafe(source.profile,id,row.updated_at))throw Error("rebuild_revision_or_claim_changed");
      pulse.assertOwned();
      const path="platform_outputs?"+f("id",row.id)+"&"+f("updated_at",row.updated_at)+"&"+f("airtable_record_id",id)
        +"&output_status=eq.Ready%20for%20Review&review_status=eq.Review%20Sent&publish_status=eq.Not%20Ready&render_status=eq.Native%20Photo%20Route"
        +"&tiktok_draft_status=eq.Waiting%20for%20Schedule&do_not_publish=eq.false&auto_publish_enabled=eq.false&test_run_id=is.null"
        +"&scheduled_post_date=is.null&studio_scheduled_at=is.null&youtube_scheduled_publish_at=is.null&published_at=is.null&platform_post_url=is.null&platform_publish_response=is.null";
      const changed=await patch(path,mutation);
      if(!Array.isArray(changed)||changed.length!==1)throw Error("rebuild_commit_unverified");
      const after=await load();
      if(!after||after.tiktok_draft_status!==null||after.review_status!=="Review Sent"||after.output_status!=="Ready for Review"||after.publish_status!=="Not Ready"
        ||after.auto_publish_enabled!==false||after.do_not_publish!==false||after.scheduled_post_date||after.studio_scheduled_at||after.published_at
        ||after.error_messages?.[MARK]?.target_version!==row.updated_at||JSON.stringify(after.render_clip_list)!==JSON.stringify(mutation.render_clip_list)
        ||JSON.stringify(after.selected_assets?.selected_clips)!==JSON.stringify(after.render_clip_list))throw Error("rebuild_readback_unverified");
      await bucket.put(key,JSON.stringify({state:"repaired",token,at:now().toISOString(),output:row.output_number,requires_human_approval:true}),{onlyIf:{etagMatches:reserved.etag}});
      return {status:"repaired",reason:"media_rebuilt_review_required",provider_writes:0,approval_actions:0,schedule_actions:0,publish_actions:0};
    }finally{if(pulse)await pulse.stop();await release(source.idea,token).catch(()=>{});}
  });
}
export async function recoverNativeReviewWithRebuild(env,report){
  const first=await recoverOneVerifiedNativeReview(env,report);
  if(first.status!=="skipped"||env.QUALITY_NATIVE_MEDIA_REBUILD_ENABLED!=="true"
    ||!["not_stale_native_review_handoff","missing_protected_exact_variant_receipt","current_revision_does_not_match_protected_receipt"].includes(first.reason))return first;
  return rebuildWrongNativeReview(env,report);
}
