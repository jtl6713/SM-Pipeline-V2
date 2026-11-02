/**
 * Chicago Instagram Reel: promote a real Producer suggestion into a revision
 * plan only when the current authoritative source and each proposed asset pass
 * independent server-side checks. No renderer, scheduler or provider writes.
 *
 * A model suggestion can NEVER certify its own assets or its factual claims.
 * Unresolved requirements remain visible as blockers, not a pretend "ready".
 */
import {inspectReviewPlan} from "./rendering-review-plan-preflight.mjs";
import {mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {resolveReviewCatalogAssets,catalogRecordId} from "./rendering-review-catalog-assets.mjs";

const rec = v => /^rec[A-Za-z0-9]{14}$/.test(String(v||""));
const drive = v => /^[A-Za-z0-9_-]{16,}$/.test(String(v||""));
const str = v => String(v??"").trim();
const one = v => Array.isArray(v)&&v.length===1&&rec(v[0])?v[0]:null;
const label = v => typeof v==="string"?v:str(v?.name);
const fail=(code,message,status=409)=>{
  const e=new Error(message);e.code=code;e.status=status;throw e;
};
const driveUrlMatches=(url,fileId)=>{
  try {
    const u=new URL(url);
    return u.protocol==="https:"&&u.hostname==="drive.google.com" &&
      (u.pathname==="/file/d/"+fileId+"/view"||
       u.pathname==="/file/d/"+fileId+"/preview");
  } catch{return false;}
};
async function exact(readRecord,table,id){
  if(!rec(id))fail("REVIEW_SOURCE_ID_INVALID","Exact source record ID required");
  const row=await readRecord(table,id);
  if(row?.id!==id||!row.fields)
    fail("REVIEW_SOURCE_UNAVAILABLE","Authoritative source record not readable",503);
  return row;
}
async function sourceReceipt({output,session,readField,output_id,loadCompletedAttempt}){
  const f=(row,key)=>readField(row,key);
  const attempt=(session.attempts||[]).find(x=>x.id===session.current_attempt_id);
  const originalFileId=str(f(output,"Final_File_ID"));
  if(!drive(originalFileId)||!attempt||attempt.status!=="ready_for_review")
    fail("REVIEW_SOURCE_NOT_VERIFIED","Completed source attempt and original Drive render required");
  let fileId=originalFileId;
  if(attempt.number===1){
    if(attempt.artifact_id!==originalFileId||
       !driveUrlMatches(str(f(output,"Final_File_URL")||f(output,"Output_URL")),originalFileId))
      fail("REVIEW_SOURCE_NOT_VERIFIED","Original Drive render and attempt do not match");
  }else{
    if(!Number.isSafeInteger(attempt.number)||attempt.number<2||
       !drive(str(attempt.artifact_id))||
       typeof loadCompletedAttempt!=="function")
      fail("REVIEW_SOURCE_NOT_VERIFIED","Completed revision needs its own durable artifact receipt");
    const row=await loadCompletedAttempt(attempt.id);
    const rf=row?.fields||{};
    let proof;
    try{proof=JSON.parse(str(rf.Validation_Evidence_JSON));}catch{
      fail("REVIEW_SOURCE_NOT_VERIFIED","Revision MP4 validation receipt is unreadable");
    }
    if(!row||str(rf.Attempt_ID)!==attempt.id||
       str(rf.Session_ID)!==session.id||
       str(rf.Output_Record_ID)!==output_id||
       Number(rf.Attempt_Number)!==attempt.number||
       str(rf.Attempt_Status)!=="ready_for_review"||
       str(rf.Artifact_File_ID)!==attempt.artifact_id||
       !driveUrlMatches(str(rf.Artifact_URL),attempt.artifact_id)||
       !/^[a-f0-9]{64}$/.test(str(proof?.sha256))||
       !Number.isSafeInteger(proof?.byte_count)||proof.byte_count<100000||
       proof.mime_type!=="video/mp4"||
       proof.width!==1080||proof.height!==1920||
       proof.audio_verified!==true||
       // Creative redo may reuse a held V2 with pending watermark QA.
       proof.google_drive_verified!==true)
      fail("REVIEW_SOURCE_NOT_VERIFIED","Source revision differs from the validated Drive attempt");
    fileId=attempt.artifact_id;
  }
  return {verified:true,authority:"server",output_id,
    profile_id:CHICAGO_PROFILE_ID,artifact_id:fileId,
    attempt_id:attempt.id,drive_file_id:fileId,
    canonical_media_authority:"google_drive"};
}
/**
 * Reconcile the authoritative Production Request's owned master assets with
 * its completed 9:16 variant manifest and the exact original Remotion scene.
 * An owned master Drive file alone does not prove a cropped image is approved.
 */
function verifiedReelVariant(entry,variantManifest,originalProps,requestId){
  if(variantManifest?.production_request_record_id!==requestId||
     variantManifest?.complete!==true||!Array.isArray(variantManifest.assets)||
     originalProps?.compositionId!=="ChicagoShiningPhotoSequence"||
     !Array.isArray(originalProps.clips))return null;
  const linked=variantManifest.assets.filter(a=>a?.id===entry?.id);
  const clips=originalProps.clips.filter(c=>c?.mediaAssetRecordId===entry?.media_asset_record_id);
  if(linked.length!==1||clips.length!==1)return null;
  const master=linked[0],clip=clips[0],v=master.variants?.["9:16"];
  const variantFile=str(v?.google_drive_file_id);
  // V1 contains mixed images and an owned, already rendered video clip.
  // Video passthrough variants have an internal preview route, not a
  // /studio/previews/item4/ image crop. Only the exact original Google Drive
  // source is executable; never turn the preview route into a render URL.
  const isVideo=v?.media_kind==="video";
  const url=isVideo?str(clip.url||clip.src):str(v?.preview_url);
  if(master.media_asset_record_id!==entry.media_asset_record_id||
     master.google_drive_file_id!==entry.google_drive_file_id||
     v?.preview_status!=="Ready"||!drive(variantFile)||
     str(clip.url||clip.src)!==url||
     str(clip.googleDriveFileId)!==variantFile||
     str(clip.src||clip.url)!==url)return null;
  if(isVideo){
    if(entry.media_kind!=="video"||v.recipe_version!=="video-passthrough"||
       variantFile!==entry.google_drive_file_id||
       v.width!==1080||v.height!==1920||
       url!=="https://drive.google.com/uc?export=download&id="+variantFile)
      return null;
  }else if(!/^https:\/\/media\.chicagoshining\.com\/studio\/previews\/item4\//.test(url)){
    return null;
  }
  return {render_variant_drive_file_id:variantFile,render_url:url,
    media_kind:isVideo?"video":"image"};
}

function requestedIds(candidate){
  const ids=[...(candidate.reuse_asset_ids||[])];
  for(const scene of candidate.timeline||[])ids.push(...(scene.asset_ids||[]));
  return [...new Set(ids)];
}
function rightsReceipt(row,entry,readField,variant){
  const f=name=>readField(row,name);
  const id=str(entry.id);
  const mediaRecordId=str(entry.media_asset_record_id);
  const fileId=str(entry.google_drive_file_id);
  const status=label(f("Asset_Status"));
  const rights=label(f("Rights_Status"));
  const kind=label(f("Media_Class"));
  const profiles=f("Content_Profile");
  if(!variant?.render_variant_drive_file_id||!variant?.render_url||
     !/^[A-Za-z0-9_-]{8,120}$/.test(id)||!rec(mediaRecordId)||!drive(fileId)||
    row?.id!==mediaRecordId||str(f("Google Drive File ID"))!==fileId||
    rights!=="Owned"||status!=="Available"||f("Active")!==true||
    f("Do_Not_Use")===true||!Array.isArray(profiles)||
    profiles.length!==1||profiles[0]!==CHICAGO_PROFILE_ID||
    !["Image","Video"].includes(kind))
    return null;
  return {id,verified:true,rights_clear:true,authority:"server",
    rights_receipt_id:"rrrights_"+mediaRecordId,
    drive_file_id:fileId,profile_id:CHICAGO_PROFILE_ID,
    canonical_media_authority:"google_drive",
    media_type:kind==="Image"?"image":"video",
    render_variant_drive_file_id:variant.render_variant_drive_file_id,
    render_url:variant.render_url};
}
/**
 * Only a trusted Worker handler can call this. Caller supplies an authenticated
 * version-fenced Airtable session adapter with canonical output lock.
 */
export async function persistReadyReviewPlan({
  env,output_id,operations,readRecord,readField,
  loadCompletedAttempt=null,readLibraryVariants=null,now=()=>new Date(),
}={}){
  if(!rec(output_id)||!env?.AIRTABLE_OUTPUT_TABLE_ID||
     !env?.AIRTABLE_MEDIA_TABLE_ID||
     typeof readRecord!=="function"||typeof readField!=="function"||
     typeof operations?.loadSession!=="function"||
     typeof operations?.readHold!=="function")
    fail("REVIEW_PLAN_ADAPTER_MISSING","Trusted plan evidence adapters required",503);
  const session=await operations.loadSession(output_id);
  if(!session||session.output_id!==output_id||session.profile_id!==CHICAGO_PROFILE_ID||
     !session.producer_candidate||session.producer_candidate.stale)
    fail("REVIEW_CANDIDATE_UNAVAILABLE","Current held Producer candidate required");
  const hold=await operations.readHold(output_id);
  if(!hold?.verified||!hold.active||hold.owner!==session.id||
     hold.id!==session.review_hold?.id||!session.review_hold?.active)
    fail("REVIEW_HOLD_UNVERIFIED","Producer plan requires an exact active review hold");
  const output=await exact(readRecord,env.AIRTABLE_OUTPUT_TABLE_ID,output_id);
  const f=(r,k)=>readField(r,k);
  if(one(f(output,"Content_Item"))===null ||
     label(f(output,"Platform"))!=="Instagram"||
     label(f(output,"Platform_Output_Type"))!=="Instagram Reel"||
     f(output,"Do_Not_Publish")!==true||
     f(output,"Studio_Render_Review_Hold_Active")!==true||
     str(f(output,"Studio_Render_Review_Hold_ID"))!==hold.id||
     str(f(output,"Studio_Render_Review_Hold_Owner"))!==session.id||
     str(f(output,"Studio_Render_Review_Session_ID"))!==session.id||
     f(output,"Publish_Started_At")||f(output,"Publish_Locked_By")||
     f(output,"Publish_Locked_At")||f(output,"Platform_Media_ID")||
     f(output,"Platform_Post_ID")||f(output,"Published_At"))
    fail("REVIEW_OUTPUT_INELIGIBLE","Held, unpublished Chicago Instagram Reel required");
  const content=await exact(readRecord,"tblwzN9AXWvmKVKPs",one(f(output,"Content_Item")));
  if(one(f(content,"Content_Profile"))!==CHICAGO_PROFILE_ID)
    fail("REVIEW_PROFILE_MISMATCH","Original Content Item is outside Chicago");
  const reqId=one(f(content,"Production_Request"));
  if(!reqId)fail("REVIEW_REQUEST_UNAVAILABLE","Source Production Request not uniquely linked");
  const request=await exact(readRecord,"tbl75nxNi6PMUjBQE",reqId);
  let master;
  try{master=JSON.parse(str(f(request,"Studio_Master_Assets_JSON")));}catch{
    fail("REVIEW_ASSET_MANIFEST_INVALID","Production Request asset inventory cannot be verified");
  }
  if(!Array.isArray(master)||master.length>80)
    fail("REVIEW_ASSET_MANIFEST_INVALID","Production Request asset inventory is invalid");
  const byId=new Map();
  for(const item of master){
    if(!item||typeof item!=="object"||typeof item.id!=="string"||
       byId.has(item.id))fail("REVIEW_ASSET_MANIFEST_INVALID","Duplicate or invalid source asset identity");
    byId.set(item.id,item);
  }
  let variantManifest,originalProps;
  try {
    variantManifest=JSON.parse(str(f(request,"Studio_Variant_Manifest_JSON")));
    originalProps=JSON.parse(str(f(output,"Remotion_Props_JSON")));
  } catch { fail("REVIEW_VARIANT_MANIFEST_INVALID","Approved Reel variant manifest and render props required"); }
  const candidate=session.producer_candidate.candidate;
  if(!Array.isArray(candidate.timeline)||candidate.timeline.length===0){
    // A conversational proposal is valid even when no exact renderable visual
    // placement can yet be established. Never attempt an immutable plan or
    // expose a render button from this model-only suggestion.
    return {ok:true,ready:false,persisted:false,
      blockers:[{kind:"asset",
        description:"Producer reply saved. An owned replacement visual and complete scene timeline must be independently verified before V2."}],
      public_post_created:false};
  }
  const ids=requestedIds(candidate);
  if(ids.length>80)fail("REVIEW_ASSET_LIMIT","Too many revision assets");
  const assets=[];
  for(const assetId of ids){
    const entry=byId.get(assetId);
    if(!entry||!rec(entry.media_asset_record_id))continue;
    const row=await exact(readRecord,env.AIRTABLE_MEDIA_TABLE_ID,entry.media_asset_record_id);
    const variant=verifiedReelVariant(entry,variantManifest,originalProps,reqId);
    const receipt=rightsReceipt(row,entry,readField,variant);
    if(receipt)assets.push(receipt);
  }
  const libraryTokens=ids.filter(id=>catalogRecordId(id));
  if(libraryTokens.length){
    if(typeof readLibraryVariants!=="function")
      fail("REVIEW_CATALOG_NOT_CONFIGURED",
        "Trusted review library crop resolver is unavailable",503);
    const discovered=await resolveReviewCatalogAssets({
      tokens:libraryTokens,readRecord,readField,readVariants:readLibraryVariants,
      mediaTable:env.AIRTABLE_MEDIA_TABLE_ID,
    });
    assets.push(...discovered.receipts);
  }
  const result=await inspectReviewPlan({
    session,source:await sourceReceipt({output,session,readField,output_id,
      loadCompletedAttempt}),
    assets,visualReceipt:null,factReceipts:[],requirementReceipts:[],
  });
  if(!result.ready_to_commit){
    return {ok:true,ready:false,persisted:false,
      blockers:result.blockers.map(b=>({kind:b.kind,description:b.description})),
      public_post_created:false};
  }
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(
    JSON.stringify([output_id,session.id,session.version,result.plan_hash])));
  const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
  const event={
    type:"PROPOSE_PLAN",expected_version:session.version,
    idempotency_key:"rrplan_"+hex.slice(0,48),
    fingerprint:"rrfp_"+hex,
    plan_version:result.plan.plan_version,plan_hash:result.plan_hash,
    missing_assets:[],frozen:true,
    immutable_manifest:{...result.plan,session_id:session.id,
      plan_hash:result.plan_hash},
    acceptance_checks:result.plan.creative.acceptance_checks,
    at:now().toISOString(),
  };
  const updated=await mutateReviewSessionCommand({output_id,event,operations});
  if(updated.session?.plan?.hash!==result.plan_hash||
     updated.session.state!=="plan_ready")
    fail("REVIEW_PLAN_READBACK_FAILED","Immutable plan was not confirmed",503);
  return {ok:true,ready:true,persisted:true,
    plan_version:result.plan.plan_version,plan_hash:result.plan_hash,
    session_version:updated.session.version,blockers:[],
    public_post_created:false};
}
