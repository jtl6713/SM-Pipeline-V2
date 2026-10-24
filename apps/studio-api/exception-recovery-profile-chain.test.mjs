import test from "node:test";import assert from "node:assert/strict";
import {contentIdForRecoveryOutput,verifyRecoveryProfileChain,withVerifiedRecoveryProfile} from "./exception-recovery-profile-chain.mjs";
import { receiptBlock } from "./exception-recovery-autonomous.mjs";
const id="recAAAAAAAAAAAAAA",contentId="recBBBBBBBBBBBBBB",profileId="recCCCCCCCCCCCCCC";
const output={id,fields:{Content_Item:[contentId],Content_Profile:["LA - Los Angeles"],Platform:"YouTube"}};
const content={id:contentId,fields:{Content_Profile:[profileId]}};
const profile={id:profileId,fields:{Profile_Name:"LA - Los Angeles"}};
test("lookup display label is not mistaken for canonical Content Profiles record id",()=>{
 assert.equal(contentIdForRecoveryOutput(output),contentId);
 const chain=verifyRecoveryProfileChain(output,content,profile);
 assert.equal(chain.ok,true);assert.equal(chain.profile_id,profileId);
 const normalized=withVerifiedRecoveryProfile(output,chain);
 assert.deepEqual(normalized.fields.Content_Profile,[profileId]);
 assert.deepEqual(output.fields.Content_Profile,["LA - Los Angeles"]);
});
test("ambiguous source links, ambiguous profile links and conflicting profiles fail closed",()=>{
 for(const out of [ {...output,fields:{Content_Item:[]}}, {...output,fields:{Content_Item:[contentId,"recDDDDDDDDDDDDDD"]}} ])
   assert.equal(verifyRecoveryProfileChain(out,content,profile).ok,false);
 assert.equal(verifyRecoveryProfileChain(output,{...content,fields:{Content_Profile:[profileId,"recDDDDDDDDDDDDDD"]}},profile).ok,false);
 assert.equal(verifyRecoveryProfileChain(output,content,{...profile,id:"recDDDDDDDDDDDDDD"}).ok,false);
 assert.throws(()=>withVerifiedRecoveryProfile(output,{ok:false}),/unverified/);
});
test("invalid record identity cannot pass through a display-only profile name",()=>{
 assert.equal(verifyRecoveryProfileChain({...output,id:"LA"},content,profile).ok,false);
});

test("GET-only canary must use normalized canonical owner in post-readback receipt check",()=>{
 const raw={...output,fields:{...output.fields,YouTube_Video_ID:"a1B2c3D4e5F",Review_Status:"Approved"}};
 const now=Date.parse("2026-10-24T16:00:00Z");
 const receipt={platform:"YouTube",verified_delivery:true,ownership_verified:true,
  verified_public:false,profile_id:profileId,remote_id:"a1B2c3D4e5F",
  checked_at:new Date(now).toISOString(),scheduled_at:null};
 assert.equal(receiptBlock(raw,receipt,now),"provider_profile_mismatch");
 const canonical=withVerifiedRecoveryProfile(raw,verifyRecoveryProfileChain(raw,content,profile));
 assert.equal(receiptBlock(canonical,receipt,now),null);
});
