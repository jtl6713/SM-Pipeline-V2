import test from "node:test";
import assert from "node:assert/strict";
import { verifyFacebookReelByVideoId, reelPublishedReconciliationEvidence } from "./facebook-reel-remote-verification.mjs";
test("missing identity fails closed without provider calls", async () => {
 let calls = 0;
 const result = await verifyFacebookReelByVideoId({ videoId: "", token: "secret", fetcher: async () => { calls++; } });
 assert.equal(result.verdict, "unknown"); assert.equal(calls, 0);
});
test("exact Meta GET corroborates permalink without creating a post", async () => {
 const calls = [];
 const fetcher = async (url, options) => { calls.push({ url, options });
   return { ok: true, json: async () => ({ id: "123456789012345", permalink_url: "https://www.facebook.com/reel/123456789012345/", status:"PUBLISHED", created_time: "2026-10-21T12:00:00Z" }) };
 };
 const result = await verifyFacebookReelByVideoId({ videoId: "123456789012345", token: "secret", fetcher });
 assert.equal(result.verdict, "remote_identity_confirmed");
 assert.equal(result.publish_authorized, false);
 assert.equal(calls.length, 1); assert.equal(calls[0].options.method, "GET");
 assert.equal(calls[0].options.headers.Authorization, "Bearer secret");
 assert.ok(!calls[0].url.includes("secret"));
});
test("provider failures, mismatched IDs, missing permalink and 404 remain unknown", async () => {
 for (const fetcher of [
   async () => { throw new Error("provider timeout"); },
   async () => ({ ok: false, json: async () => ({ error: "permission denied" }) }),
   async () => ({ ok: true, json: async () => ({ id: "222222222222222", permalink_url: "https://www.facebook.com/reel/222222222222222/" }) }),
   async () => ({ ok: true, json: async () => ({ id: "123456789012345" }) }),
   async () => ({ ok: true, json: async () => ({ id: "123456789012345", permalink_url: "https://www.facebook.com/reel/123456789012345/" }) }),
   async () => ({ ok: true, json: async () => ({ id: "123456789012345", permalink_url: "https://www.facebook.com/reel/123456789012345/", status: "PROCESSING" }) }),
 ]) {
   const result = await verifyFacebookReelByVideoId({ videoId: "123456789012345", token: "secret", fetcher });
   assert.equal(result.verdict, "unknown");
 }
});

test("positive publication receipt requires stable exact ID, holds and unchanged counters", () => {
  const fields = { Do_Not_Publish:true, Publish_Retry_Eligible:false,
    Publish_Error_Stage:"FBS3_RATE_LIMIT", Publish_Attempt_Count:1,
    Studio_Publish_Dispatch_Count:1, FB_Slideshow_Meta_Video_ID:"123456789012345" };
  const original = { id:"rec12345678901234", fields };
  const latest = { id:original.id, fields:{...fields} };
  const receipt = { verdict:"remote_identity_confirmed", video_id:"123456789012345",
    provider_status:"PUBLISHED", published_at:"2026-10-21T12:00:00.000Z",
    permalink_url:"https://www.facebook.com/reel/123456789012345/" };
  const ok = reelPublishedReconciliationEvidence({original,latest,receipt});
  assert.equal(ok.authorized,true);
  assert.equal(ok.graph_create_authorized,false);
  for (const update of [
    { Publish_Attempt_Count:2 }, {Do_Not_Publish:false},
    { Studio_Publish_Dispatch_Count:2 },
    { FB_Slideshow_Meta_Video_ID:"987654321098765" },
  ]) {
    const failed = reelPublishedReconciliationEvidence({original,
      latest:{...latest,fields:{...fields,...update}},receipt});
    assert.equal(failed.authorized,false);
  }
  assert.equal(reelPublishedReconciliationEvidence({original,latest,receipt:{...receipt,verdict:"unknown"}}).authorized,false);
});
test("provider 429 or 500 and publication without provider timestamp fail closed", async () => {
  for (const status of [429,500]) {
    const result = await verifyFacebookReelByVideoId({videoId:"123456789012345",
      token:"t",fetcher:async()=>({ok:false,status,json:async()=>({error:"provider"})})});
    assert.equal(result.verdict,"unknown");
  }
  const result=await verifyFacebookReelByVideoId({videoId:"123456789012345",
    token:"t",fetcher:async()=>({ok:true,json:async()=>({id:"123456789012345",
      status:"PUBLISHED",permalink_url:"https://www.facebook.com/reel/123456789012345/"})})});
  assert.equal(result.verdict,"unknown");
});
