import test from "node:test";
import assert from "node:assert/strict";
import {
  STORY_VIDEO_MODEL, normalizeStoryVideoSettings, videoPriceConfig, storyVideoQuote,
  requireStoryVideoPaidApproval, submitStoryVideo, readStoryVideo,
  isSafeStoryVideoDownloadUrl, downloadStoryVideo, storyVideoJobKey,
} from "./story-first-ai-video.mjs";

const env = {
  STUDIO_ELEVENLABS_VIDEO_ENABLED: "true",
  ELEVENLABS_API_KEY: "test-key-never-real",
  STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT: "2026-11-08",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P: "100",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_6S_720P: "150",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P: "200",
};
const input = {prompt:"A beautiful golden-hour view of the Chicago River, cinematic slow push in",
  duration_secs:8, aspect_ratio:"9:16"};

test("fixed safe Veo model, bounded duration and ratio; never generate audio", () => {
  assert.deepEqual(normalizeStoryVideoSettings(input), {
    ...input, model_id:STORY_VIDEO_MODEL, resolution:"720p", generate_audio:false,
  });
  for (const duration_secs of [1,5,10]) {
    assert.throws(()=>normalizeStoryVideoSettings({...input,duration_secs}),/duration/);
  }
  assert.throws(()=>normalizeStoryVideoSettings({...input,aspect_ratio:"1:1"}),/ratio/);
  assert.throws(()=>normalizeStoryVideoSettings({...input,model_id:"bytedance-seedance-v2"}),/Model/);
  assert.throws(()=>normalizeStoryVideoSettings({...input,prompt:"hello"}),/prompt/);
});

test("pricing must be enabled, fresh and configured; no fabricated zero-credit quote", () => {
  assert.equal(videoPriceConfig(env,8,Date.parse("2026-11-08T00:00:00Z")).estimated_credits,200);
  assert.equal(videoPriceConfig({...env,STUDIO_ELEVENLABS_VIDEO_ENABLED:"false"},8).enabled,false);
  assert.equal(videoPriceConfig({...env,STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P:""},8,Date.parse("2026-11-09T00:00:00Z")).enabled,false);
  assert.equal(videoPriceConfig(env,8,Date.parse("2026-12-10T00:00:00Z")).enabled,false);
});

test("quote binds exact prompt and cost, and requires explicit paid approval", async () => {
  const now=Date.parse("2026-11-09T00:00:00Z");
  const quote=await storyVideoQuote(env,input,now);
  assert.equal(quote.estimated_credits,200);
  assert.match(quote.quote_id,/^[a-f0-9]{64}$/);
  assert.equal(requireStoryVideoPaidApproval(quote,{quote_id:quote.quote_id,approve_paid_generation:true}),true);
  assert.throws(()=>requireStoryVideoPaidApproval(quote,{quote_id:quote.quote_id}),/approval/);
  const changed=await storyVideoQuote(env,{...input,prompt:input.prompt+" with a new camera angle"},now);
  assert.notEqual(changed.quote_id,quote.quote_id);
  assert.throws(()=>requireStoryVideoPaidApproval(changed,{quote_id:quote.quote_id,approve_paid_generation:true}),/changed/);
});

test("only valid provider receipt is accepted and transport sends a single POST", async () => {
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({id:"Gen123456789",status:"pending"}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const settings=normalizeStoryVideoSettings(input);
  assert.deepEqual(await submitStoryVideo(env,settings,fetcher),{id:"Gen123456789",status:"pending"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://api.elevenlabs.io/v1/flows/video");
  assert.equal(JSON.parse(calls[0].options.body).generate_audio,false);
  assert.equal(calls[0].options.headers["xi-api-key"],env.ELEVENLABS_API_KEY);
});

test("read status refuses a mismatched generation ID", async () => {
  const fetcher=async()=>new Response(JSON.stringify({id:"Unrelated999",status:"completed"}));
  await assert.rejects(()=>readStoryVideo(env,"Gen123456789",fetcher),/mismatched/);
});

test("reject untrusted video download URLs (SSRF) and non-video content", async () => {
  assert.equal(isSafeStoryVideoDownloadUrl("https://storage.googleapis.com/generations/a?token=x"),true);
  for (const host of ["https://evil.example/video.mp4",
    "http://storage.googleapis.com/video.mp4",
    "https://storage.googleapis.com.evil.example/video.mp4",
    "https://user:pass@storage.googleapis.com/video.mp4"]) {
    assert.equal(isSafeStoryVideoDownloadUrl(host),false);
  }
  await assert.rejects(()=>downloadStoryVideo({
    status:"completed",content_mime_type:"video/mp4",content_url:"https://evil.example/video.mp4"
  }),/untrusted/);
  const fakeVideo=async()=>new Response(new Uint8Array(2048),{headers:{"Content-Type":"application/octet-stream"}});
  await assert.rejects(()=>downloadStoryVideo({
    status:"completed",content_mime_type:"video/mp4",
    content_url:"https://storage.googleapis.com/generations/a"
  },fakeVideo),/validation/);
});

test("job keys are scoped to exact idea and scene", () => {
  assert.equal(storyVideoJobKey("rec123",2),"studio/story-first/ai-video/v1/rec123/scene-2.json");
});
