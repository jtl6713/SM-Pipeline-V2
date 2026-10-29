/** One-time, private, exact Chicago #8447 visual-V2 audio QA correction.
 * This is NOT a renderer, a Producer action, an approval or a publisher.
 * It rebinds an independently validated lossless remux under the existing
 * session/output approval lock, retaining the previous artifact for audit.
 */
import {reviewCompletionEnabled} from "./rendering-review-completion-http.mjs";

const SCOPE=Object.freeze({
 output:"rec0uVrVeiUM6shp9",
 profile:"recT2rbKX3MF7cVFU",
 session:"rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796",
 attempt:"rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c",
 job:"rrjob_26054929500b8abe981e3f6131b5c668209bf9c765edb06c",
 v1:"1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4",
 previous:"1MgyPrgEDWUFwdX--uZamtK8_fvY7Nki3",
 previous_sha:"74a9ec2018e51bf5d6a2f041e3d080d7b188da896578a85ad3fa24a3ca2ab31e",
 corrected:"1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up",
 corrected_sha:"8ee06c1f0234959c5ff4610b020d6bb72a005200ffa5d6590d920754b3c0f77e",
 corrected_size:21961807,
 render_job:"job-20261029042719-d8b6ef01"
});
function deny(code,status=409){const e=new Error(code);e.code=code;e.status=status;throw e}
async function auth(request,env){
 const supplied=request.headers.get("X-Rendering-Review-Job-Secret")||"";
 const expected=String(env.RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET||"");
 if(expected.length<24||supplied.length!==expected.length)deny("QA_REPAIR_AUTH_DENIED",403);
 const sha=async s=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([sha(supplied),sha(expected)]);
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 if(mismatch)deny("QA_REPAIR_AUTH_DENIED",403);
}
function requireLive(s,h,o,a){
 if(s?.id!==SCOPE.session||s.output_id!==SCOPE.output||s.profile_id!==SCOPE.profile||
    s.output_type!=="Instagram Reel"||s.state!=="ready_for_review"||
    s.review_hold?.active!==true||s.current_attempt_id!==SCOPE.attempt||
    s.approved_attempt_id||s.active_job||
    h?.verified!==true||h.active!==true||h.owner!==SCOPE.session||
    h.id!==s.review_hold.id||h.output_id!==SCOPE.output||
    o?.id!==SCOPE.output||o.profile_id!==SCOPE.profile||
    o.platform!=="Instagram"||o.output_type!=="Instagram Reel"||
    o.do_not_publish!==true||o.review_hold_active!==true||
    o.final_file_id!==SCOPE.v1||o.published_at||o.platform_post_id||
    o.platform_media_id||o.publish_locked_at||o.publish_started_at||
    o.publish_locked_by||
    a?.output_id!==SCOPE.output||a.session_id!==SCOPE.session||
    a.attempt_id!==SCOPE.attempt||a.status!=="ready_for_review")
   deny("QA_REPAIR_HOLD_OR_IDENTITY_STALE");
 const orig=(s.attempts||[]).find(t=>t.number===1);
 const current=(s.attempts||[]).find(t=>t.id===SCOPE.attempt);
 if(!orig||orig.artifact_id!==SCOPE.v1||
    !current||current.number!==2||current.job_id!==SCOPE.job||
    current.status!=="ready_for_review")deny("QA_REPAIR_SESSION_MISMATCH");
 return current;
}
export async function repairExactReviewAudio({request,env,operations}){
 if(!reviewCompletionEnabled(env))deny("QA_REPAIR_DISABLED",405);
 if(request.method!=="POST")deny("METHOD_NOT_ALLOWED",405);
 await auth(request,env);
 if(!request.headers.get("Content-Type")?.startsWith("application/json"))deny("QA_REPAIR_CONTENT_TYPE",415);
 const raw=await request.text();
 if(raw.length>160)deny("QA_REPAIR_BODY_INVALID",400);
 let body;try{body=JSON.parse(raw)}catch{deny("QA_REPAIR_BODY_INVALID",400)}
 if(!body||Object.keys(body).length!==1||body.confirm!=="BIND-VERIFIED-AUDIO-ONLY")
   deny("QA_REPAIR_CONFIRMATION_REQUIRED",400);
 for(const op of ["withOutputLock","readSession","readHold","readOutput","readAttempt",
                  "patchAttempt","saveSessionIfVersion","verifyCorrectedMedia"]){
   if(typeof operations?.[op]!=="function")deny("QA_REPAIR_ADAPTER_UNAVAILABLE",503);
 }
 return operations.withOutputLock(SCOPE.output,async()=>{
   const [s,h,o,a]=await Promise.all([
     operations.readSession(SCOPE.output),operations.readHold(SCOPE.output),
     operations.readOutput(SCOPE.output),operations.readAttempt(SCOPE.attempt)]);
   const current=requireLive(s,h,o,a);
   const existing=a.artifact_file_id;
   const existingSession=current.artifact_id;
   if(existing===SCOPE.corrected&&existingSession===SCOPE.corrected)
     return {ok:true,replay:true,original_preserved:true,
             attempt_id:SCOPE.attempt,artifact_id:SCOPE.corrected,
             public_post_created:false};
   if(![SCOPE.previous,SCOPE.corrected].includes(existing)||
      existingSession!==SCOPE.previous)deny("QA_REPAIR_TARGET_DRIFT");
   const verified=await operations.verifyCorrectedMedia({
      file_id:SCOPE.corrected,sha256:SCOPE.corrected_sha,
      expected_bytes:SCOPE.corrected_size,
      previous_file_id:SCOPE.previous,
      original_file_id:SCOPE.v1
   });
   if(verified!==true)deny("QA_REPAIR_MEDIA_UNVERIFIED",503);
   const evidence={
     sha256:SCOPE.corrected_sha,byte_count:SCOPE.corrected_size,
     mime_type:"video/mp4",width:1080,height:1920,
     duration_seconds:34.517333,audio_verified:true,
     google_drive_verified:true,google_drive_mime_type:"video/mp4",
     watermark_verified:true,render_job_id:SCOPE.render_job,
     qa_repair:"lossless_audio_remux",audio_source_file_id:SCOPE.v1,
     prior_v2_artifact_id:SCOPE.previous,prior_v2_sha256:SCOPE.previous_sha,
     video_stream_identity:"original_v2_bit_exact",
     audio_stream_identity:"original_v1_bit_exact"
   };
   if(existing===SCOPE.previous){
     await operations.patchAttempt(a.record_id,{
       Artifact_File_ID:SCOPE.corrected,
       Artifact_URL:"https://drive.google.com/file/d/"+SCOPE.corrected+"/view",
       Validation_Evidence_JSON:JSON.stringify(evidence),
       Change_Summary:"Two daylight scene replacements; restored original V1 soundtrack without rerender or publishing"
     });
   }
   const afterAttempt=await operations.readAttempt(SCOPE.attempt);
   if(afterAttempt?.artifact_file_id!==SCOPE.corrected)deny("QA_REPAIR_ATTEMPT_READBACK_FAILED",503);
   const next=structuredClone(s);
   next.version=s.version+1;
   const row=next.attempts.find(x=>x.id===SCOPE.attempt);
   row.artifact_id=SCOPE.corrected;
   next.history=[...(next.history||[]),{
     type:"QA_AUDIO_REBIND",key:"review8447_audio_original_v1_20261029",
     at:"2026-10-29T05:14:00.000Z",version:next.version,
     prior_artifact_id:SCOPE.previous,artifact_id:SCOPE.corrected,
     preservation:"v1_audio_stream_and_v2_video_stream"
   }];
   const saved=await operations.saveSessionIfVersion({
     output_id:SCOPE.output,expected_version:s.version,next});
   if(saved!==true)deny("QA_REPAIR_SESSION_VERSION_CHANGED",409);
   const [final,finalAttempt,finalHold]=await Promise.all([
      operations.readSession(SCOPE.output),
      operations.readAttempt(SCOPE.attempt),
      operations.readHold(SCOPE.output)]);
   if(final?.version!==next.version||final.current_attempt_id!==SCOPE.attempt||
      final.attempts?.find(x=>x.id===SCOPE.attempt)?.artifact_id!==SCOPE.corrected||
      finalAttempt?.artifact_file_id!==SCOPE.corrected||
      finalHold?.active!==true||finalHold.owner!==SCOPE.session)
      deny("QA_REPAIR_FINAL_READBACK_FAILED",503);
   return {ok:true,replay:false,original_preserved:true,
     attempt_id:SCOPE.attempt,artifact_id:SCOPE.corrected,
     public_post_created:false};
 });
}
