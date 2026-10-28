/**
 * Exact-output, server-owned Rendering Review plan materialization.
 * Uses the existing Production Request + Media Assets authority, not a
 * model's self-reported "verified" fields or browser-submitted URLs.
 * No rendering, publishing, schedule or original-output writes.
 */
import {inspectReviewPlan} from "./rendering-review-plan-preflight.mjs";
import {mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const rec = value => /^rec[A-Za-z0-9]{14}$/.test(String(value||""));
const fileId = value => /^[A-Za-z0-9_-]{20,}$/.test(String(value||""));
const exactOne = value => Array.isArray(value)&&value.length===1&&rec(value[0]) ? value[0] : null;
const text = value => String(value??"").trim();
function deny(code,message,status=409){const e=new Error(message);e.status=status;e.code=code;throw e;}
async function digest(value){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
function sameId(a,b){return text(a)===text(b);}
function ownedAsset(row,f,expectedId,expectedDrive){
  if(!row||row.id!==expectedId||!fileId(expectedDrive)||
     !sameId(f(row,"Google Drive File ID"),expectedDrive)||
     exactOne(f(row,"Content_Profile"))!==CHICAGO_PROFILE_ID||
     text(f(row,"Rights_Status"))!=="Owned"||
     text(f(row,"Capture_Source"))!=="Self Filmed"||
     text(f(row,"Asset_Status"))!=="Available"||
     f(row,"Active")!==true||f(row,"Do_Not_Use")===true)
    return false;
  const media=text(f(row,"Media_Class"));
  return media==="Image"||media==="Video";
}
/**
 * A candidate must have been persisted by the genuine Producer first. The
 * coordinator serializes the plan event with the exact output/hold lease,
 * verifies Airtable write-back and refuses stale model candidates.
 */
export async function materializeReviewPlan({
  output_id,expected_version,operations,readRaw,readContent,readRequest,
  readMediaAsset,readField,now=()=>new Date(),
}){
  if(!rec(output_id)||!Number.isSafeInteger(expected_version)||expected_version<2)
    deny("PLAN_REQUEST_INVALID","Exact output and persisted Producer version required",400);
  for(const fn of [operations?.authorizeReview,operations?.readHold,
    operations?.loadSession,readRaw,readContent,readRequest,readMediaAsset,readField]){
    if(typeof fn!=="function")
      deny("PLAN_AUTHORITY_MISSING","Server-owned plan evidence adapter missing",503);
  }
  if(await operations.authorizeReview(output_id)!==true)
    deny("PLAN_SCOPE_DENIED","Chicago review permission required",403);
  const session=await operations.loadSession(output_id);
  const hold=await operations.readHold(output_id);
  if(!session||session.version!==expected_version||session.output_id!==output_id||
     session.profile_id!==CHICAGO_PROFILE_ID||session.output_type!=="Instagram Reel"||
     session.review_hold?.active!==true||!hold?.verified||hold?.active!==true||
     hold.id!==session.review_hold.id||hold.owner!==session.id||
     hold.output_id!==output_id||session.producer_candidate?.stale===true)
    deny("PLAN_SESSION_STALE","Current held Producer candidate not verified");
  const f=readField;
  const output=await readRaw(output_id);
  if(output?.id!==output_id||!output.fields||
     text(f(output,"Platform"))!=="Instagram"||
     text(f(output,"Platform_Output_Type"))!=="Instagram Reel"||
     text(f(output,"Render_Status"))!=="Rendered"||
     f(output,"Studio_Render_Review_Hold_Active")!==true||
     f(output,"Studio_Render_Review_Hold_ID")!==hold.id||
     f(output,"Studio_Render_Review_Hold_Owner")!==session.id||
     f(output,"Studio_Render_Review_Session_ID")!==session.id||
     f(output,"Do_Not_Publish")!==true||
     f(output,"Publish_Started_At")||f(output,"Publish_Locked_At")||
     f(output,"Publish_Locked_By")||f(output,"Platform_Post_ID")||
     f(output,"Platform_Media_ID")||f(output,"Published_At")||
     f(output,"Platform_Post_URL"))
    deny("PLAN_OUTPUT_NOT_HELD","Original output is not independently held and undispatched");
  const sourceAttempt=session.attempts?.find(a=>a.id===session.current_attempt_id);
  const currentFile=text(f(output,"Final_File_ID"));
  if(!fileId(currentFile)||sourceAttempt?.status!=="ready_for_review"||
     sourceAttempt.artifact_id!==currentFile)
    deny("PLAN_SOURCE_CHANGED","Original Google Drive MP4 identity does not match current attempt");
  const contentId=exactOne(f(output,"Content_Item"));
  if(!contentId)deny("PLAN_CONTENT_AMBIGUOUS","Exactly one linked Content Item required");
  const content=await readContent(contentId);
  if(content?.id!==contentId||exactOne(f(content,"Content_Profile"))!==CHICAGO_PROFILE_ID)
    deny("PLAN_PROFILE_CHANGED","Authoritative Chicago Content Item mismatch");
  const requestId=exactOne(f(content,"Production_Request"));
  if(!requestId)deny("PLAN_ASSET_REQUEST_MISSING","Original Production Request unavailable");
  const request=await readRequest(requestId);
  if(request?.id!==requestId)
    deny("PLAN_ASSET_REQUEST_MISSING","Original Production Request readback mismatch");
  let items;
  try{items=JSON.parse(text(f(request,"Studio_Master_Assets_JSON")));}
  catch{deny("PLAN_ASSET_MANIFEST_INVALID","Original asset manifest is unreadable");}
  if(!Array.isArray(items)||items.length<1||items.length>80)
    deny("PLAN_ASSET_MANIFEST_INVALID","Original asset manifest must be bounded");
  const byId=new Map();
  for(const item of items){
    if(!item||typeof item!=="object"||!item.id||
       !/^[A-Za-z0-9_-]{8,120}$/.test(item.id)||byId.has(item.id)||
       !rec(item.media_asset_record_id)||!fileId(item.google_drive_file_id)||
       item.authoritative_storage!=="google_drive")
      deny("PLAN_ASSET_MANIFEST_INVALID","Production Request contains ambiguous source identity");
    byId.set(item.id,item);
  }
  const candidate=session.producer_candidate?.candidate;
  if(!candidate||!Array.isArray(candidate.reuse_asset_ids)||
     !Array.isArray(candidate.timeline))
    deny("PLAN_CANDIDATE_INVALID","Saved Producer candidate unavailable");
  const referenced=new Set(candidate.reuse_asset_ids);
  for(const scene of candidate.timeline)for(const id of (scene?.asset_ids||[]))referenced.add(id);
  if(referenced.size>20)
    deny("PLAN_TOO_MANY_ASSETS","Pilot supports at most twenty reused assets");
  const assets=[];
  for(const id of referenced){
    const item=byId.get(id);
    if(!item)continue; // validator presents an explicit missing-asset blocker
    const row=await readMediaAsset(item.media_asset_record_id);
    if(!ownedAsset(row,f,item.media_asset_record_id,item.google_drive_file_id))continue;
    const rightsReceipt="rrrights_"+(await digest([
      "chicago-review-owned-media-v1",row.id,item.id,item.google_drive_file_id,
      text(f(row,"Rights_Status")),text(f(row,"Capture_Source")),
      text(f(row,"Asset_Status")),CHICAGO_PROFILE_ID,
    ])).slice(0,48);
    assets.push({id:item.id,verified:true,rights_clear:true,authority:"server",
      rights_receipt_id:rightsReceipt,drive_file_id:item.google_drive_file_id,
      canonical_media_authority:"google_drive",profile_id:CHICAGO_PROFILE_ID,
      media_type:text(f(row,"Media_Class"))==="Image"?"image":"video"});
  }
  const source={verified:true,authority:"server",output_id,
    profile_id:CHICAGO_PROFILE_ID,attempt_id:sourceAttempt.id,
    artifact_id:currentFile,drive_file_id:currentFile,
    canonical_media_authority:"google_drive"};
  // No independent fact/visual receipts are invented. A model that requests
  // unverified facts or protected video segments yields a blocked plan.
  const inspected=await inspectReviewPlan({
    session,source,assets,visualReceipt:null,factReceipts:[],requirementReceipts:[],
  });
  const event={...inspected.event_preview,expected_version,
    immutable_manifest:inspected.plan,
    idempotency_key:"rrplan_"+(await digest([session.id,expected_version,inspected.plan_hash])).slice(0,48),
    fingerprint:"rrfp_"+(await digest([inspected.plan_hash,inspected.plan])).slice(0,48),
    at:now().toISOString()};
  const saved=await mutateReviewSessionCommand({output_id,event,operations});
  if(saved.session?.plan?.hash!==inspected.plan_hash||
     saved.session?.plan?.version!==inspected.plan.plan_version||
     saved.session?.plan?.immutable_manifest?.source_drive_file_id!==currentFile)
    deny("PLAN_PERSISTENCE_UNVERIFIED","Frozen plan was not saved with source identity",503);
  return {ok:true,plan_ready:inspected.ready_to_commit,
    plan_hash:inspected.plan_hash,plan_version:inspected.plan.plan_version,
    blockers:inspected.blockers,session_version:saved.session.version,
    publication_changed:false,render_queued:false};
}
