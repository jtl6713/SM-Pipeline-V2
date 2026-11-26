// #3094: ordinary EZ draft intake is separate from photo-wait acceptance.
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { productionModeRoutingEnabled } from "./manual-production-list.mjs";
import { editorGuardEnabled, assertEditorGuardReady } from "./production-editor-boundary.mjs";

export const automaticEzIntakeEnabled = env => productionModeCaptureEnabled(env) &&
  productionModeRoutingEnabled(env) && editorGuardEnabled(env) &&
  env?.STUDIO_AUTOMATIC_EZ_INTAKE === "true";
const kinds = new Set(["single-photo","multiple-photos","single-ai","multiple-ai","mixed",
  "video-clips","photos-and-clips"]);
const rec = /^rec[A-Za-z0-9]{14}$/;
const marker = "[automatic-ez-intake.1] ";
const authorityNotes = /origin\s*=\s*(?:az-finished-video|prepare-to-review|autonomous|scripted-short|story-first)|ez-input\s*=\s*(?:finished-video|vibe-cut)|az-(?:publish-mode|auto-queue)\s*=|\[story-first(?:-production)?\.1\]|\[factory-revision-open\]/i;
export function automaticEzCreateEnabled(env, auth) {
  return automaticEzIntakeEnabled(env) && auth?.permissions?.ideas_create === true &&
    auth?.permissions?.production_configure === true;
}
export function automaticEzIdeaFields(env, auth, payload, { source, mode, profileId } = {}) {
  if (!automaticEzCreateEnabled(env, auth)) throw new Error("Automatic EZ intake is not enabled");
  assertEditorGuardReady(env);
  const kind = payload?.input_kind;
  if (payload?.automatic_ez_intake !== true || source !== "idea" || mode !== "automatic" ||
      payload.production_mode !== "automatic" || !kinds.has(kind) ||
      !rec.test(profileId || "") || payload.content_profile_id !== profileId ||
      Object.prototype.hasOwnProperty.call(payload, "automatic_photo_wait") ||
      authorityNotes.test(String(payload.summary || "")))
    throw new Error("Exact ordinary automatic EZ intake and profile required");
  // No acceptance, no schedule, no library matching while explicit originals
  // or AI masters are still being collected.
  return { Studio_Photo_Wait_Status: "Not Needed", Production_Config_Notes: marker + kind };
}
export function automaticEzIdeaKind(idea) {
  const f = idea?.fields || {};
  const lines = String(f.Production_Config_Notes || "").split(/\r?\n/).filter(x=>x.startsWith(marker));
  const kind = lines.length === 1 ? lines[0].slice(marker.length) : "";
  return kinds.has(kind) ? kind : null;
}
// Future draft transport must check the typed canonical source and exact
// owner again, not accept the request's origin text as authority.
export function verifiedAutomaticEzDraftInput(idea, body) {
  const f = idea?.fields || {};
  const kind = automaticEzIdeaKind(idea);
  const notes = String(body?.production_notes || "");
  const profile = body?.content_profile_id;
  const origins = [...notes.matchAll(/\borigin\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  const inputs = [...notes.matchAll(/\bez-input\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  return Boolean(kind && rec.test(idea?.id || "") && body?.idea_record_id === idea.id &&
    rec.test(profile || "") && Array.isArray(f.Content_Profile) && f.Content_Profile.length === 1 &&
    f.Content_Profile[0] === profile && f.Studio_Production_Mode === "automatic" &&
    f.Studio_Production_Source === "idea" && f.Candidate_Status === "Generated" &&
    f.Studio_Photo_Wait_Status === "Not Needed" && !String(f.Test_Run_ID || "").trim() &&
    !f.Promoted_Content_Record_ID && !(f["Content Items"] || []).length &&
    origins.length === 1 && origins[0] === "ez-wizard" &&
    inputs.length === 1 && inputs[0] === kind &&
    !authorityNotes.test(notes) && !notes.includes("[automatic-ez-accepted.1]") && !authorityNotes.test(String(f.Idea_Summary || "")) &&
    !/\b(?:origin|ez-input)\s*=/i.test(String(f.Idea_Summary || "")) &&
    !Object.keys(body).some(key=>/^(?:publish|schedule|approval|approve|status|hold|test_run)/i.test(key)));
}

/** A replay never replaces an existing draft or accepts a different owner. */
export function verifiedAutomaticEzDraftReceipt(record, idea, body) {
  const f = record?.fields || {};
  const kind = automaticEzIdeaKind(idea);
  const notes = String(f.Production_Notes || "");
  const origins = [...notes.matchAll(/\borigin\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  const inputs = [...notes.matchAll(/\bez-input\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  return Boolean(verifiedAutomaticEzDraftInput(idea,body) && rec.test(record?.id || "") &&
    f.Request_Status === "Draft" && f.Active === true &&
    Array.isArray(f.Idea_Candidate) && f.Idea_Candidate.length === 1 &&
    f.Idea_Candidate[0] === idea.id && origins.length === 1 && origins[0] === "ez-wizard" &&
    inputs.length === 1 && inputs[0] === kind && !authorityNotes.test(notes) &&
    !String(f.Test_Run_ID || "").trim() && !(f.Promoted_Content_Item || []).length &&
    !f.Studio_Publish_Batch_ID && !f.Studio_Publish_Requested_At);
}
// A canonical lookup failure or multiple open requests requires reconciliation;
// never treat a failed read as permission to create another draft.
export function automaticEzExistingDraftId(rows, idea) {
  if (!Array.isArray(rows) || rows.length > 1 ||
      rows.some(row=>!rec.test(row?.id || "")))
    throw new Error("Automatic EZ draft ownership requires reconciliation");
  const linked = idea?.fields?.["Production Requests"] || [];
  if (!Array.isArray(linked) || linked.some(id=>!rec.test(id)) ||
      linked.some(id=>id!==rows[0]?.id))
    throw new Error("Automatic EZ reciprocal draft linkage requires reconciliation");
  return rows[0]?.id || null;
}

/** Authoritative draft request; no client-selected origin or profile. */
export function automaticEzMediaContext(record, idea) {
  const profileId=idea?.fields?.Content_Profile?.[0];
  const body={idea_record_id:idea?.id,content_profile_id:profileId,
    production_notes:record?.fields?.Production_Notes};
  if (!verifiedAutomaticEzDraftReceipt(record,idea,body) || automaticEzAcceptanceMarked(record)) return null;
  return {kind:automaticEzIdeaKind(idea),profileId};
}
export function automaticEzMediaOperationAllowed(kind,operation) {
  if(operation==="snapshot")return kinds.has(kind);
  if(operation==="upload")return ["single-photo","multiple-photos","mixed","video-clips","photos-and-clips"].includes(kind);
  if(operation==="ai")return ["single-ai","multiple-ai","mixed"].includes(kind);
  return false;
}
export function automaticEzUploadAllowed(kind,requestedKind,{photos=0,videos=0,existing=0}={}) {
  if(!automaticEzMediaOperationAllowed(kind,"upload") ||
     (requestedKind && requestedKind!==kind) || photos+videos<1)return false;
  if(kind==="single-photo")return photos===1&&videos===0&&existing===0;
  if(kind==="video-clips")return videos>0&&photos===0;
  if(kind==="photos-and-clips")return true;
  return photos>0&&videos===0;
}
export function automaticEzAiTarget(kind,record,body,profileId) {
  if(!automaticEzMediaOperationAllowed(kind,"ai")||!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(k=>!["content_profile_id","profile_id","target_ai_count","prompt_guidance","asset_name_base"].includes(k))||
     [body.content_profile_id,body.profile_id].some(id=>id!=null&&id!==profileId))return null;
  const notes=String(record?.fields?.Production_Notes||"");
  const ai=[...notes.matchAll(/\bez-ai=(\d+)(?:;|\s|$)/gi)];
  const target=kind==="single-ai"?1:kind==="mixed"?Number(ai.length===1?ai[0][1]:0):
    Number(record?.fields?.Carousel_Slide_Count_Exact|| (ai.length===1?ai[0][1]:0));
  if(!Number.isInteger(target)||target<1||target>30||
     (body.target_ai_count!=null&&Number(body.target_ai_count)!==target))return null;
  return target;
}

const acceptanceMarker="[automatic-ez-accepted.1] ";
const acceptanceTail="\norigin=prepare-to-review\nez-photo-wait=off\n";
export function automaticEzAcceptanceMarked(record) {
  const notes=String(record?.fields?.Production_Notes||"");
  return notes.split(/\r?\n/).filter(line=>line.startsWith(acceptanceMarker)).length===1;
}
function acceptanceParts(record) {
  const notes=String(record?.fields?.Production_Notes||"");
  const index=notes.lastIndexOf(acceptanceTail+acceptanceMarker);
  if(index<0||!automaticEzAcceptanceMarked(record))return null;
  let receipt;try{receipt=JSON.parse(notes.slice(index+acceptanceTail.length+acceptanceMarker.length));}catch{return null;}
  return {original:notes.slice(0,index),receipt};
}
// Strictly use saved master manifest, not supplied asset IDs or a Ready badge.
export function automaticEzReadyMedia(record,context) {
  const f=record?.fields||{};
  if(!context||f.Studio_Master_Asset_Status!=="Ready")return null;
  let assets;try{assets=JSON.parse(f.Studio_Master_Assets_JSON||"[]");}catch{return null;}
  if(!Array.isArray(assets)||!assets.length||assets.length!==Number(f.Studio_Master_Asset_Count))return null;
  if(assets.some((a,i)=>!a?.id||Number(a.order)!==i+1||!rec.test(a.media_asset_record_id||"")||
      !String(a.google_drive_file_id||"").trim()||a.content_profile_id!==context.profileId||
      a.compression_needed===true||["pending","queued","compressing","downloading","failed"].includes(a.compression_status)||
      a.upload_status==="multipart_pending"))return null;
  const ids=assets.map(a=>a.media_asset_record_id);
  if(new Set(ids).size!==ids.length||new Set(assets.map(a=>a.id)).size!==assets.length)return null;
  const linked=f.Studio_Master_Media_Assets;
  if(!Array.isArray(linked)||linked.length!==ids.length||ids.some(id=>!linked.includes(id)))return null;
  const video=a=>a.media_kind==="video"||String(a.mime_type||"").startsWith("video/");
  const ai=a=>/^studio_ai/i.test(String(a.source||""));
  const videos=assets.filter(video).length,generated=assets.filter(ai).length;
  if(assets.some(a=>video(a)&&ai(a)))return null;
  const photos=assets.length-videos-generated;
  const notes=String(f.Production_Notes||"");
  const count=key=>{
    const matches=[...notes.matchAll(new RegExp("\\b"+key+"=(\\d+)(?:;|\\s|$)","gi"))];
    return matches.length===1?Number(matches[0][1]):null;
  };
  const manual=count("ez-manual"), clips=count("ez-clips");
  const exact=Number(f.Carousel_Slide_Count_Exact||0);
  const clipExact=Number(f.Video_Clip_Count_Exact||0);
  const kind=context.kind;
  const aiTarget=automaticEzAiTarget(kind,record,{},context.profileId);
  const okay=kind==="single-photo"?photos===1&&!videos&&!generated:
    kind==="multiple-photos"?photos>=2&&!videos&&!generated&&photos===(manual||exact):
    kind==="single-ai"||kind==="multiple-ai"?generated===aiTarget&&!photos&&!videos:
    kind==="mixed"?photos>0&&photos===manual&&generated===aiTarget&&!videos:
    kind==="video-clips"?videos>0&&videos===(clips||clipExact)&&!photos&&!generated:
    kind==="photos-and-clips"?videos>0&&videos===(clips||clipExact)&&photos>0&&(!manual||photos===manual)&&!generated:false;
  return okay?ids:null;
}
export function automaticEzAcceptedContext(record,idea) {
  const parts=acceptanceParts(record);
  const state=idea?.fields?.Candidate_Status;
  if(!parts||!["Generated","Approved"].includes(state))return null;
  const original={...record,fields:{...record.fields,Production_Notes:parts.original,Request_Status:"Draft"}};
  const staged={...idea,fields:{...idea.fields,Candidate_Status:"Generated"}};
  const context=automaticEzMediaContext(original,staged);
  if(!context||!["Draft","Ready","Submitted"].includes(record.fields.Request_Status))return null;
  const ids=automaticEzReadyMedia(original,context);
  if(!ids||JSON.stringify(parts.receipt)!==JSON.stringify({kind:context.kind,profile:context.profileId,ids}))return null;
  return {...context,ids};
}
export function automaticEzAcceptanceNotes(record,idea) {
  const context=automaticEzMediaContext(record,idea);
  const ids=automaticEzReadyMedia(record,context);
  if(!ids||automaticEzAcceptanceMarked(record))throw new Error("Complete the selected original and AI media before accepting the Idea");
  const notes=String(record.fields.Production_Notes||"")+acceptanceTail+acceptanceMarker+
    JSON.stringify({kind:context.kind,profile:context.profileId,ids});
  if(notes.length>10000)throw new Error("Automatic EZ acceptance metadata exceeds the note limit");
  return notes;
}
export async function queueAcceptedAutomaticEz({idea,draft,listRequests,commitDraft,commitIdea,readJob,enqueue}) {
  const existing=await listRequests(idea.id);
  if(automaticEzExistingDraftId(existing,idea)!==draft.id)throw new Error("Exact automatic EZ draft required");
  const prior=await readJob(idea.id);
  let context=automaticEzAcceptedContext(draft,idea);
  if(!context) {
    if(prior||idea.fields.Candidate_Status!=="Generated"||automaticEzAcceptanceMarked(draft))
      throw new Error("Automatic EZ acceptance requires reconciliation");
    const notes=automaticEzAcceptanceNotes(draft,idea);
    const saved=await commitDraft(draft,notes);
    context=automaticEzAcceptedContext(saved,idea);
    if(saved?.id!==draft.id||saved.fields.Production_Notes!==notes||!context)
      throw new Error("Automatic EZ media acceptance receipt not verified");
    draft=saved;
  }
  if(prior&&(prior.idea_id!==idea.id||prior.profile_id!==context.profileId||
      (prior.production_request_id&&prior.production_request_id!==draft.id)))
    throw new Error("Existing queue job does not match the accepted intake");
  if(idea.fields.Candidate_Status!=="Approved") {
    const saved=await commitIdea(idea,draft);
    if(saved?.id!==idea.id||saved.fields?.Candidate_Status!=="Approved"||!automaticEzAcceptedContext(draft,saved))
      throw new Error("Automatic EZ Idea acceptance could not be verified");
  }
  const job=prior||await enqueue(idea.id,context.profileId);
  if(!job)throw new Error("Acceptance saved; durable queue needs reconciliation");
  return {queued:true,idea_id:idea.id,production_request_id:draft.id,job_status:job.status||null,
    publishing:false,requires_factory_approval:true};
}
