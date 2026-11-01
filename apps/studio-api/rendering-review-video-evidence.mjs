/**
 * Shared, fail-closed completed MP4 media evidence contract.
 *
 * A completed Vibe Cut must be bound to the exact frozen music-only plan and
 * profile logo evidence; it cannot masquerade as a Chicago narrated Reel.
 * Neither pathway grants publish or schedule authority.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{8,120}$/;
const fail=()=>{const e=new Error("Review video evidence is not authoritative");
  e.code="REVIEW_VIDEO_EVIDENCE_INVALID";e.status=409;throw e;};
export function validateReviewVideoEvidence({validation:v,session:s,
    expectedRenderJobId=null}={}){
  if(!s||!REC.test(String(s.profile_id||""))||!v||
     typeof v!=="object"||Array.isArray(v)||
     !SHA.test(String(v.sha256||""))||
     !Number.isSafeInteger(v.byte_count)||v.byte_count<100000||
     v.mime_type!=="video/mp4"||v.google_drive_mime_type!=="video/mp4"||
     typeof v.duration_seconds!=="number"||
     !Number.isFinite(v.duration_seconds)||v.duration_seconds<1||
     v.duration_seconds>180||v.audio_verified!==true||
     v.watermark_verified!==true||v.google_drive_verified!==true||
     v.watermark_profile_id!==s.profile_id||
     !Number.isSafeInteger(v.watermark_frame_sample_count)||
     v.watermark_frame_sample_count<3||
     !ID.test(String(v.render_job_id||""))||
     (expectedRenderJobId!==null&&v.render_job_id!==expectedRenderJobId))
    fail();
  const plan=s.plan?.immutable_manifest;
  const vibe=plan?.schema==="studio.render-review.vibe.1";
  if(vibe){
    if(plan.mode!=="vibe_cut"||plan.source_kind!=="video"||
       plan.output_id!==s.output_id||plan.profile_id!==s.profile_id||
       plan.session_id!==s.id||plan.human_intent!=="explicit_button"||
       plan.voiceover!=="off"||![undefined,null,""].includes(plan.narration)||
       plan.allow_public_publish!==false||
       plan.allow_platform_upload!==false||plan.auto_approve!==false||
       !["9:16","16:9"].includes(plan.aspect_ratio)|| 
       v.music_only!==true||v.voiceover_expected!==false||
       v.ready_for_publication!==false||
       v.watermark_profile_id!==s.profile_id)
      fail();
    const [width,height]=plan.aspect_ratio==="16:9"?[1920,1080]:[1080,1920];
    if(v.width!==width||v.height!==height||v.duration_seconds<8||
       v.duration_seconds>90)fail();
    return {media_kind:"vibe_cut",aspect_ratio:plan.aspect_ratio};
  }
  // No unrecognized schema can signal a music-only revision. Unknown future
  // media types need their own independent explicitly versioned contract.
  if(plan?.schema && plan.schema!=="studio.render-review.1")fail();
  if(v.music_only===true||v.voiceover_expected===false||
     v.width!==1080||v.height!==1920)fail();
  return {media_kind:"narrated_video",aspect_ratio:"9:16"};
}
