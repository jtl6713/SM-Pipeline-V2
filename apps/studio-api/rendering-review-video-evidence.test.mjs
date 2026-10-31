import test from "node:test";
import assert from "node:assert/strict";
import {validateReviewVideoEvidence as verify} from "./rendering-review-video-evidence.mjs";
const profile="recF7UAn0LkMZZrWZ",out="recA1B2C3D4E5F6G7",id="rrsession_12345678";
const base={sha256:"a".repeat(64),byte_count:500000,mime_type:"video/mp4",
  google_drive_mime_type:"video/mp4",width:1080,height:1920,
  duration_seconds:20,audio_verified:true,watermark_verified:true,
  google_drive_verified:true,render_job_id:"remotion_12345678"};
const session={id,profile_id:profile,output_id:out};
const vibe=(ratio="16:9")=>({...session,plan:{immutable_manifest:{
  schema:"studio.render-review.vibe.1",mode:"vibe_cut",source_kind:"video",
  output_id:out,profile_id:profile,session_id:id,human_intent:"explicit_button",
  voiceover:"off",narration:"",allow_platform_upload:false,
  allow_public_publish:false,auto_approve:false,aspect_ratio:ratio,
}}});
const music=(ratio="16:9")=>({...base,
  width:ratio==="16:9"?1920:1080,height:ratio==="16:9"?1080:1920,
  music_only:true,voiceover_expected:false,watermark_profile_id:profile,
  ready_for_publication:false});
test("existing narrated vertical MP4 still passes exact Drive and render receipt",()=>{
  assert.equal(verify({validation:base,session,expectedRenderJobId:base.render_job_id}).media_kind,"narrated_video");
  assert.throws(()=>verify({validation:{...base,width:1920},session}),{code:"REVIEW_VIDEO_EVIDENCE_INVALID"});
});
test("held horizontal and vertical Vibe Cut proof require exact immutable plan and profile logo",()=>{
  for(const ratio of ["9:16","16:9"]){
    assert.deepEqual(verify({validation:music(ratio),session:vibe(ratio)}),
      {media_kind:"vibe_cut",aspect_ratio:ratio});
  }
});
test("foreign logo, fabricated Vibe type or altered plan never pass Factory receipt",()=>{
  for(const v of [
    {...music(),watermark_profile_id:"recT2rbKX3MF7cVFU"},
    {...music(),music_only:false},
    {...music(),voiceover_expected:true},
    {...music(),ready_for_publication:true},
    {...music(),width:1080},
  ])assert.throws(()=>verify({validation:v,session:vibe()}),
    {code:"REVIEW_VIDEO_EVIDENCE_INVALID"});
  assert.throws(()=>verify({validation:music(),session}),
    {code:"REVIEW_VIDEO_EVIDENCE_INVALID"});
  const altered=vibe();altered.plan.immutable_manifest.profile_id="recT2rbKX3MF7cVFU";
  assert.throws(()=>verify({validation:music(),session:altered}),
    {code:"REVIEW_VIDEO_EVIDENCE_INVALID"});
});
