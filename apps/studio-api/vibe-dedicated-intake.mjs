/** #3094: narrow dedicated Vibe Cut intake. No ordinary editor or AZ authority. */
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { parseVibeCutDirective, vibeCutOriginNotes, isHorizontalVibeCutAspect } from "./vibe-cut.mjs";

const rec=/^rec[A-Za-z0-9]{14}$/;
const assetId=/^[A-Za-z0-9_-]{1,80}$/;
const one=(a,id)=>Array.isArray(a)&&a.length===1&&a[0]===id;
const exactPlatforms=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===b.length&&b.every(v=>a.includes(v));
const forbidden=/origin\s*=\s*az-finished-video|ez-input\s*=\s*finished-video|az-publish|publish-now|\[factory-revision-open\]|\[automatic-ez-|\[story-first/i;
const allowedDraftKeys=new Set(["idea_record_id","content_profile_id","production_notes","content_type","platforms","primary_location","voiceover_mode","background_music_mode","thumbnail_mode","video_duration_seconds"]);
const originLine="origin=ez-wizard; ez-input=vibe-cut; ez-caption=ai; ez-package=video";
export function dedicatedVibeIntakeEnabled(env){
  return productionModeCaptureEnabled(env)&&env?.STUDIO_DEDICATED_PRODUCTION_ROUTES==="true"&&env?.STUDIO_DEDICATED_VIBE_INTAKE==="true";
}
export function vibeDedicatedRoute(path,verb){
  const prefix="/api/vibe-cut/production-requests";
  if(path===prefix)return {kind:"vibe_create",allowed:verb==="POST",path:"/api/production-requests"};
  if(!path.startsWith(prefix+"/"))return null;
  const m=/^\/api\/vibe-cut\/production-requests\/(rec[A-Za-z0-9]+)\/(item4|assets\/upload-session(?:\/([A-Za-z0-9_-]+)\/(complete|parts\/(\d+)))?)$/.exec(path);
  if(!m)return {kind:"invalid",allowed:false};
  const [,id,tail,asset,action,part]=m;
  const operation=tail==="item4"&&verb==="GET"?"snapshot":
    tail==="assets/upload-session"&&verb==="POST"?"start":
    action==="complete"&&verb==="POST"?"complete":
    part&&verb==="PUT"&&Number.isSafeInteger(Number(part))&&Number(part)>0&&Number(part)<=10000?"part":null;
  return {kind:"vibe_request",id,asset,operation,allowed:rec.test(id)&&(!asset||assetId.test(asset))&&Boolean(operation),
    path:"/api/production-requests/"+id+"/"+tail};
}
export function vibeDraftNotesValid(notes){
  const text=String(notes||"").trim();
  if(forbidden.test(text)||!text.split(/\r?\n/).includes(originLine))return false;
  const config=parseVibeCutDirective(text);
  return Boolean(config&&text.match(/(?:^|\n)\[vibe-cut\]/gi)?.length===1&&
    text.match(/source-aspect=(horizontal|vertical)/gi)?.length===1);
}
export function canonicalVibeDraftNotes(config,aspect){
  if(!["vertical","horizontal"].includes(aspect))throw new Error("Source orientation is required");
  return vibeCutOriginNotes({config})+"\nsource-aspect="+aspect;
}
function expected(notes){
  const horizontal=isHorizontalVibeCutAspect(notes);
  return {type:horizontal?"Longform Video":"Vertical Short Video",platforms:horizontal?["YouTube"]:["Instagram","Facebook","TikTok","YouTube"]};
}
export function verifiedVibeIdea(idea,profileId){
  const f=idea?.fields||{};
  return rec.test(idea?.id||"")&&rec.test(profileId||"")&&one(f.Content_Profile,profileId)&&
    f.Studio_Production_Source==="vibe_cut"&&f.Studio_Production_Mode==="automatic"&&
    !String(f.Test_Run_ID||"").trim();
}
export function verifiedVibeDraftInput(idea,body){
  if(!body||Object.keys(body).some(k=>!allowedDraftKeys.has(k))||body.idea_record_id!==idea?.id||
    !verifiedVibeIdea(idea,body.content_profile_id)||idea.fields.Candidate_Status!=="Generated"||
    idea.fields.Promoted_Content_Record_ID||(idea.fields["Content Items"]||[]).length)return false;
  const notes=body.production_notes;
  if(!vibeDraftNotesValid(notes))return false;
  const cfg=parseVibeCutDirective(notes);
  if(notes!==canonicalVibeDraftNotes(cfg,isHorizontalVibeCutAspect(notes)?"horizontal":"vertical"))return false;
  const plan=expected(notes);
  return body.content_type===plan.type&&exactPlatforms(body.platforms,plan.platforms)&&
    body.voiceover_mode==="No"&&body.background_music_mode==="Yes"&&body.thumbnail_mode==="Yes"&&
    Number(body.video_duration_seconds)===cfg.target_seconds;
}
export function verifiedVibeRequest(record,idea,profileId){
  const f=record?.fields||{},notes=f.Production_Notes;
  if(!verifiedVibeIdea(idea,profileId)||!rec.test(record?.id||"")||!one(f.Idea_Candidate,idea.id)||
    f.Active!==true||f.Test_Run_ID||!vibeDraftNotesValid(notes))return false;
  const plan=expected(notes);
  return f.Master_Content_Type===plan.type&&exactPlatforms(f.Target_Platforms,plan.platforms)&&
    f.Voiceover_Mode==="No"&&f.Background_Music_Mode==="Yes"&&f.Thumbnail_Mode==="Yes";
}
export function verifiedVibeDraftReceipt(record,idea,body){
  return verifiedVibeDraftInput(idea,body)&&verifiedVibeRequest(record,idea,body.content_profile_id)&&
    record.fields.Request_Status==="Draft"&&!record.fields.Studio_Publish_Batch_ID&&
    !record.fields.Studio_Publish_Requested_At&&!(record.fields.Promoted_Content_Item||[]).length&&
    String(record.fields.Production_Notes).startsWith(body.production_notes)&&
    Number(record.fields.Video_Duration_Seconds)===Number(body.video_duration_seconds);
}
function manifest(fields){
  const raw=fields.Studio_Master_Assets_JSON;
  if(raw==null||raw==="")return [];
  try {const a=typeof raw==="string"?JSON.parse(raw):raw;return Array.isArray(a)?a:null;}catch{return null;}
}
export function vibeRequestOperationAllowed(route,record,body){
  const f=record?.fields||{};
  if(route.operation==="snapshot")return ["Draft","Ready","Submitted","Promoted"].includes(f.Request_Status);
  if(f.Request_Status!=="Draft"||f.Studio_Publish_Batch_ID||f.Studio_Publish_Requested_At||
    (f.Promoted_Content_Item||[]).length||/origin=prepare-to-review/i.test(f.Production_Notes||""))return false;
  const assets=manifest(f);
  if(!assets)return false;
  if(route.operation==="start")return assets.length===0&&Number(f.Studio_Master_Asset_Count||0)===0&&
    body?.origin_kind==="vibe-cut"&&typeof body.filename==="string"&&/\.(mp4|mov|m4v|webm)$/i.test(body.filename)&&
    Number.isSafeInteger(body.size_bytes)&&body.size_bytes>0&&
    typeof body.mime_type==="string"&&/^video\//i.test(body.mime_type);
  const a=assets[0];
  if(assets.length!==1||Number(f.Studio_Master_Asset_Count)!==1||a?.id!==route.asset||
    a.origin_kind!=="vibe-cut"||a.media_kind!=="video")return false;
  const staged=Boolean(a.r2_key&&a.multipart_upload_id);
  if(route.operation==="part")return a.upload_status==="multipart_pending"&&staged;
  if(route.operation==="complete")return (a.upload_status==="multipart_pending"&&staged)||
    (a.upload_status==="complete"&&Boolean(a.r2_key||(a.google_drive_file_id&&a.media_asset_record_id)));
  return false;
}
