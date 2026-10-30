/**
 * Authenticated Factory preview of the selected, already accepted V2+.
 * Never trust a Factory card URL or expose private Google Drive credentials.
 */
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
const str=x=>String(x??"").trim();
const field=(row,name)=>row?.fields?.[name];
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const dispatched=r=>["Published_At","Platform_Post_ID","Platform_Media_ID",
  "Platform_Post_URL","Publish_Started_At","Publish_Locked_At","Publish_Locked_By"]
  .some(k=>Boolean(field(r,k)));
export function factorySelectedReviewAttempt({session,row,profile,outputId}){
  if(!session||!row||row.id!==outputId||
     session.output_id!==outputId||
     session.profile_id!==CHICAGO_PROFILE_ID||profile!==CHICAGO_PROFILE_ID||
     session.output_type!=="Instagram Reel"||
     str(field(row,"Platform"))!=="Instagram"||
     str(field(row,"Platform_Output_Type"))!=="Instagram Reel"||
     dispatched(row))return null;
  const attempt=session.attempts?.find(a=>a.id===session.current_attempt_id);
  if(!attempt||Number(attempt.number)<2||attempt.status!=="ready_for_review"||
     !session.factory_handoff||session.factory_handoff.attempt_id!==attempt.id||
     session.factory_handoff.artifact_id!==attempt.artifact_id||
     str(field(row,"Final_File_ID"))!==attempt.artifact_id||
     str(field(row,"Final_File_URL"))!=="https://drive.google.com/file/d/"+attempt.artifact_id+"/view")
    return null;
  const active=field(row,"Studio_Render_Review_Hold_Active")===true;
  const owned=active &&
    field(row,"Do_Not_Publish")===true &&
    field(row,"Studio_Render_Review_Hold_ID")===session.review_hold?.id &&
    field(row,"Studio_Render_Review_Hold_Owner")===session.id;
  const factoryReady=session.state==="approved"&&
    session.current_attempt_id===session.approved_attempt_id&&
    session.factory_handoff.status==="ready_for_factory_approval"&&
    session.review_hold.active===false&&!active&&
    field(row,"Do_Not_Publish")!==true&&
    field(row,"Auto_Publish_Enabled")!==true;
  const backWithProducer=session.state==="discussing"&&
    session.factory_handoff.status==="returned_for_changes"&&
    session.review_hold.active===true&&owned;
  return (factoryReady||backWithProducer)?attempt:null;
}
export async function serveFactorySelectedReviewVideo({request,env,outputId,authorization,
  readSession,readRow,readProfile,readVideo,copyHeaders}){
  if(!["GET","HEAD"].includes(request.method))fail(405,"FACTORY_VIDEO_READ_ONLY");
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization?.permissions?.outputs_review!==true)
    fail(403,"FACTORY_VIDEO_REVIEW_PERMISSION");
  if(!/^rec[A-Za-z0-9]{14}$/.test(outputId))
    fail(403,"FACTORY_VIDEO_SCOPE");
  // Saved session + authoritative Chicago output/attempt control playback.
  const session=await readSession(outputId);
  const row=await readRow(outputId);
  const profile=await readProfile(outputId);
  const attempt=factorySelectedReviewAttempt({session,row,profile,outputId});
  if(!attempt)fail(409,"FACTORY_SELECTED_REVIEW_ASSET_UNVERIFIED");
  const source=new Request(request.url,{method:"GET",headers:request.method==="HEAD"
    ?{"Range":"bytes=0-0"}:{"Range":request.headers.get("Range")||"bytes=0-"}});
  const upstream=await readVideo(outputId,attempt.id,source);
  if(!upstream||![200,206].includes(upstream.status))fail(502,"FACTORY_REVIEW_VIDEO_NOT_AVAILABLE");
  const type=str(upstream.headers.get("Content-Type")).toLowerCase();
  if(type&&!type.startsWith("video/")&&!type.startsWith("application/octet-stream"))
    fail(502,"FACTORY_REVIEW_VIDEO_NOT_MP4");
  const headers=copyHeaders(upstream);
  headers.set("Cache-Control","private, no-store");
  headers.set("X-Studio-Preview-Source","factory-selected-review-attempt");
  if(request.method==="HEAD"){
    const match=str(upstream.headers.get("Content-Range")).match(/\/(\d+)$/);
    if(match)headers.set("Content-Length",match[1]);
    headers.delete("Content-Range");
    try{await upstream.body?.cancel()}catch{}
    return new Response(null,{status:200,headers});
  }
  return new Response(upstream.body,{status:upstream.status===206?206:200,headers});
}
