/** Private, exact-authority MP4 stream for a V2 promoted to Factory.
 * Never fall back to an old V1 video or let callers supply a Drive file ID.
 * The Runner independently repeats the same session/output/attempt checks.
 */
const rec=/^rec[A-Za-z0-9]{14}$/;
const text=v=>String(v??"").trim();
const fail=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};
const selected=v=>typeof v==="string"?v:text(v?.name);
export async function previewAcceptedFactoryRevision({
  request,env,authorization,outputId,operations,readVideo,copyHeaders,
}){
  if(!rec.test(outputId)||outputId!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID)return null;
  if(!authorization?.authorized||authorization?.permissions?.outputs_review!==true)
    fail("FACTORY_PREVIEW_FORBIDDEN","Output review permission required",403);
  if(!["GET","HEAD"].includes(request.method))
    fail("FACTORY_PREVIEW_READ_ONLY","Preview is read-only",405);
  const session=await operations.readSession(outputId);
  if(!session?.factory_handoff)return null;
  const attemptId=session.approved_attempt_id;
  const attempt=session.attempts?.find(a=>a.id===attemptId);
  const receipt=session.factory_handoff;
  if(session.output_id!==outputId || session.state!=="approved" ||
     session.current_attempt_id!==attemptId || session.review_hold?.active!==false ||
     receipt.status!=="ready_for_factory_approval"||
     receipt.attempt_id!==attemptId ||
     receipt.artifact_id!==attempt?.artifact_id ||
     !attempt || attempt.number<2 || attempt.status!=="ready_for_review")
    fail("FACTORY_PREVIEW_SESSION_CHANGED","Accepted V2 Factory receipt could not be verified");
  const row=await operations.readRawOutput(outputId),f=row?.fields||{};
  if(row?.id!==outputId || text(f.Final_File_ID)!==receipt.artifact_id ||
     f.Do_Not_Publish===true || f.Auto_Publish_Enabled===true ||
     f.Studio_Render_Review_Hold_Active===true ||
     ["Studio_Render_Review_Hold_ID","Studio_Render_Review_Hold_Owner",
       "Studio_Render_Review_Session_ID","Studio_Review_Hold_ID",
       "Studio_Review_Hold_Owner","Scheduled_Post_Date","Studio_Scheduled_At",
       "Published_At","Platform_Post_ID","Platform_Post_URL","Platform_Media_ID",
       "Publish_Started_At","Publish_Locked_At","Publish_Locked_By"].some(k=>Boolean(text(f[k]))) ||
     selected(f.Output_Status)!=="Ready for Review" ||
     selected(f.Review_Status)!=="Review Sent" ||
     selected(f.Publish_Status)!=="Not Ready")
    fail("FACTORY_PREVIEW_OUTPUT_CHANGED","Output no longer has unapproved V2 selected");
  const persisted=await operations.readAttempt(attemptId),p=persisted?.fields||{};
  if(p.Attempt_ID!==attemptId||p.Session_ID!==session.id||
     p.Output_Record_ID!==outputId||
     p.Artifact_File_ID!==receipt.artifact_id||
     selected(p.Attempt_Status)!=="ready_for_review"||
     Number(p.Attempt_Number)!==Number(attempt.number))
    fail("FACTORY_PREVIEW_ATTEMPT_CHANGED","V2 attempt identity changed");
  const req=request.method==="HEAD"?new Request(request.url,{
    method:"GET",headers:{"Range":"bytes=0-0"}}):request;
  const upstream=await readVideo({env,outputId,attemptId,request:req});
  if(!upstream||![200,206].includes(upstream.status))
    fail("FACTORY_PREVIEW_STREAM_MISSING","Verified V2 video bytes unavailable",502);
  const headers=copyHeaders(upstream);
  headers.set("Cache-Control","private, no-store");
  headers.set("X-Studio-Preview-Source","factory-accepted-review-v2");
  headers.set("X-Content-Type-Options","nosniff");
  if(request.method==="HEAD"){
    const cr=upstream.headers.get("Content-Range")||"";
    const total=cr.match(/\/(\d+)$/);
    if(total)headers.set("Content-Length",total[1]);
    headers.delete("Content-Range");
    try{await upstream.body?.cancel()}catch{}
    return new Response(null,{status:200,headers});
  }
  return new Response(upstream.body,{status:upstream.status===206?206:200,headers});
}
