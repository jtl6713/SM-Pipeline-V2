import test from "node:test";
import assert from "node:assert/strict";
import {
  STORY_VIDEO_MODEL, STORY_VIDEO_MODELS, availableStoryVideoModels, buildStoryVideoProviderSettings, storyVideoPriceKey, normalizeStoryVideoSettings, videoPriceConfig, storyVideoQuote,
  requireStoryVideoPaidApproval, submitStoryVideo, readStoryVideo,
  isSafeStoryVideoDownloadUrl, downloadStoryVideo, storyVideoJobKey,
} from "./story-first-ai-video.mjs";

const env = {
  STUDIO_ELEVENLABS_VIDEO_ENABLED: "true",
  ELEVENLABS_API_KEY: "test-key-never-real",
  STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT: "2026-11-08",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P_9X16: "100",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_6S_720P_9X16: "150",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P_9X16: "200",
  STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P_16X9: "225",
};
const input = {prompt:"A beautiful golden-hour view of the Chicago River, cinematic slow push in",
  duration_secs:8, aspect_ratio:"9:16"};

test("Veo model retains safe defaults and rejects unsupported duration/ratio", () => {
  assert.deepEqual(normalizeStoryVideoSettings(input), {
    ...input, model_id:STORY_VIDEO_MODEL, resolution:"720p", generate_audio:false,
    references:{ start_frame:null,end_frame:null,images:[],videos:[],audios:[] },
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
  assert.equal(videoPriceConfig({...env,STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P_9X16:""},8,Date.parse("2026-11-09T00:00:00Z")).enabled,false);
  assert.equal(videoPriceConfig(env,8,Date.parse("2026-12-10T00:00:00Z")).enabled,false);
});

test("quote binds exact prompt and cost, and requires explicit paid approval", async () => {
  const now=Date.parse("2026-11-09T00:00:00Z");
  const quote=await storyVideoQuote(env,input,now);
  assert.equal(quote.estimated_credits,200);
  const landscape = await storyVideoQuote(env,{...input,aspect_ratio:"16:9"},now);
  assert.equal(landscape.estimated_credits,225);
  assert.notEqual(quote.quote_id, landscape.quote_id);
  const sceneOne=await storyVideoQuote(env,{...input,idea_id:"recIdeaA",scene_number:1,content_profile_id:"recChicago"},now);
  const sceneTwo=await storyVideoQuote(env,{...input,idea_id:"recIdeaA",scene_number:2,content_profile_id:"recChicago"},now);
  assert.notEqual(sceneOne.quote_id,sceneTwo.quote_id);
  const otherProfile=await storyVideoQuote(env,{...input,idea_id:"recIdeaA",scene_number:1,content_profile_id:"recNewYork"},now);
  assert.notEqual(sceneOne.quote_id,otherProfile.quote_id);
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
  await assert.rejects(()=>submitStoryVideo(env,settings,fetcher),/Upload and translate/);
  assert.deepEqual(await submitStoryVideo(env,buildStoryVideoProviderSettings(settings),fetcher),{id:"Gen123456789",status:"pending"});
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

test("Seedance 2.5 is selectable but gated by separate API entitlement", async () => {
  const seedance={...input,model_id:"bytedance-seedance-v2.5",duration_secs:20,
    aspect_ratio:"4:3",resolution:"480p",generate_audio:true};
  assert.equal(normalizeStoryVideoSettings(seedance).duration_secs,20);
  assert.equal(availableStoryVideoModels(env).find(x=>x.id==="bytedance-seedance-v2.5").enabled,false);
  assert.equal((await storyVideoQuote(env,seedance,Date.parse("2026-11-09T00:00:00Z"))).enabled,false);
  const longConfig={...env,STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED:"true",
    STUDIO_ELEVENLABS_VIDEO_AUDIO_ENABLED:"true"};
  const blockedLong=await storyVideoQuote(longConfig,seedance,Date.parse("2026-11-09T00:00:00Z"));
  assert.equal(blockedLong.enabled,false);
  assert.match(blockedLong.reason,/Long AI video transfer/);
  assert.equal(availableStoryVideoModels({...env,STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED:"true"})
    .find(x=>x.id==="bytedance-seedance-v2.5").enabled,true);
  assert.deepEqual(STORY_VIDEO_MODELS["bytedance-seedance-v2.5"].resolutions,["480p","720p"]);
  assert.throws(()=>normalizeStoryVideoSettings({...seedance,duration_secs:31}),/duration/);
  assert.throws(()=>normalizeStoryVideoSettings({...seedance,resolution:"1080p"}),/resolution/);
});

test("Veo frame, image reference and Seedance audio/video capabilities validate exact exclusivity", () => {
  const ids=["recReferenceOne","recReferenceTwo","recReferenceThree"];
  assert.equal(normalizeStoryVideoSettings({...input,references:{start_frame:ids[0],end_frame:ids[1]}})
    .references.end_frame,ids[1]);
  assert.throws(()=>normalizeStoryVideoSettings({...input,references:{end_frame:ids[1]}}),/start frame/);
  assert.throws(()=>normalizeStoryVideoSettings({...input,references:{
    start_frame:ids[0],images:[{asset_id:ids[1],role:"subject"}]}}),/OR free-form/);
  assert.throws(()=>normalizeStoryVideoSettings({...input,duration_secs:4,references:{
    images:[{asset_id:ids[0],role:"style"}]}}),/8-second/);
  assert.throws(()=>normalizeStoryVideoSettings({...input,references:{
    videos:[{asset_id:ids[0]}]}}),/not supported/);
  const seedance=normalizeStoryVideoSettings({...input,model_id:"bytedance-seedance-v2.5",
    references:{audios:[{asset_id:ids[0]}],videos:[{asset_id:ids[1]}] }});
  assert.equal(seedance.references.audios.length,1);
  assert.equal(seedance.references.videos.length,1);
  assert.throws(()=>normalizeStoryVideoSettings({...input,
    model_id:"bytedance-seedance-v2.5",
    references:{images:[{asset_id:ids[0]},{asset_id:ids[1]},{asset_id:ids[2]},
      {asset_id:"recReferenceFour"}]}}),/Too many/);
});

test("audio or reference options never inherit text-only credit pricing", async () => {
  const now=Date.parse("2026-11-09T00:00:00Z");
  const withAudio=await storyVideoQuote(env,{...input,generate_audio:true},now);
  assert.equal(withAudio.enabled,false);
  const withFrame=await storyVideoQuote(env,{...input,references:{start_frame:"recFrameOne"}},now);
  assert.equal(withFrame.enabled,false);
  const extra=storyVideoPriceKey({...input,generate_audio:true});
  const priceMap={ [extra]: 350 };
  const updated={...env,STUDIO_ELEVENLABS_VIDEO_AUDIO_ENABLED:"true",
    STUDIO_ELEVENLABS_VIDEO_CREDIT_ESTIMATES_JSON:JSON.stringify(priceMap)};
  assert.equal((await storyVideoQuote(updated,{...input,generate_audio:true},now)).estimated_credits,350);
  assert.equal((await storyVideoQuote(updated,{...input,references:{start_frame:"recFrameOne"}},now)).enabled,false);
});

test("paid quote hashes exact referenced Media Assets and selected model settings", async () => {
  const now=Date.parse("2026-11-09T00:00:00Z");
  const withFrame={...input,references:{start_frame:"recFrameOne"}};
  const priceKey=storyVideoPriceKey(withFrame);
  const configured={...env,STUDIO_ELEVENLABS_VIDEO_CREDIT_ESTIMATES_JSON:
    JSON.stringify({[priceKey]:300})};
  const q=await storyVideoQuote(configured,withFrame,now);
  assert.equal(q.estimated_credits,300);
  const changed=await storyVideoQuote(configured,{...withFrame,references:{start_frame:"recFrameTwo"}},now);
  assert.notEqual(q.quote_id,changed.quote_id);
  assert.notEqual(q.quote_id,(await storyVideoQuote(configured,{...withFrame,
    negative_prompt:"Avoid signage"},now)).quote_id);
});

test("provider payload converts trusted media only and never contains Airtable IDs or empty references", () => {
  const s=normalizeStoryVideoSettings({...input,references:{
    start_frame:"recReferenceOne"}});
  assert.throws(()=>buildStoryVideoProviderSettings(s),/upload/);
  const provider=buildStoryVideoProviderSettings(s,{provider_references:{
    start_frame:{type:"asset",asset_id:"elevenId012345"}}});
  assert.deepEqual(provider.start_frame,{type:"asset",asset_id:"elevenId012345"});
  assert.equal(provider.references,undefined);
  const basic=buildStoryVideoProviderSettings(normalizeStoryVideoSettings(input));
  assert.equal(basic.references,undefined);
});
