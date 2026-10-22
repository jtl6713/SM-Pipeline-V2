import test from "node:test";
import assert from "node:assert/strict";
import { verifyFacebookReelByVideoId } from "./facebook-reel-remote-verification.mjs";
test("missing identity fails closed without provider calls", async () => {
 let calls = 0;
 const result = await verifyFacebookReelByVideoId({ videoId: "", token: "secret", fetcher: async () => { calls++; } });
 assert.equal(result.verdict, "unknown"); assert.equal(calls, 0);
});
test("exact Meta GET corroborates permalink without creating a post", async () => {
 const calls = [];
 const fetcher = async (url, options) => { calls.push({ url, options });
   return { ok: true, json: async () => ({ id: "123456789012345", permalink_url: "https://www.facebook.com/reel/123456789012345/", status:"PUBLISHED" }) };
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
