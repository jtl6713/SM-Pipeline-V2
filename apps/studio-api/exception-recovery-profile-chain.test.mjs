import test from "node:test";import assert from "node:assert/strict";
import {contentIdForRecoveryOutput,verifyRecoveryProfileChain,withVerifiedRecoveryProfile} from "./exception-recovery-profile-chain.mjs";
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
