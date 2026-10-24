import test from "node:test";
import assert from "node:assert/strict";
import { verifyExistingProviderReceipt } from "./exception-recovery-receipt.mjs";
const row=(fields)=>({id:"recAAAAAAAAAAAAAA",fields});
const fake=(data,ok=true)=>async(url,options)=>{
 assert.equal(options.method,"GET");
 assert.ok(String(url).startsWith("https://"));
 return {ok,json:async()=>data};
};
test("Facebook public receipt requires exact id + Graph is_published + trusted link",async()=>{
 const r=await verifyExistingProviderReceipt(row({Platform:"Facebook",Platform_Post_ID:"123456789_987654321"}),{
 settings:{FACEBOOK_PAGE_ACCESS_TOKEN:"private",FACEBOOK_GRAPH_API_VERSION:"v26.0"},
 fetcher:fake({id:"123456789_987654321",is_published:true,permalink_url:"https://www.facebook.com/123456789/posts/987654321"})});
 assert.equal(r.status,"verified_existing_post");
 assert.equal(r.verified_public,true);
 assert.equal(r.read_only,true);
 assert.ok(!JSON.stringify(r).includes("private"));
});
test("private, forged-domain and mismatched Facebook records never verify",async()=>{
 const fields={Platform:"Facebook",Platform_Post_ID:"123456789_987654321"};
 for(const evidence of [
  {id:"123456789_987654321",is_published:false,permalink_url:"https://www.facebook.com/post/3"},
  {id:"123456789_987654321",is_published:true,permalink_url:"https://www.facebook.com.evil.example/post/3"},
  {id:"999999999",is_published:true,permalink_url:"https://www.facebook.com/post/3"},
 ]){const r=await verifyExistingProviderReceipt(row(fields),{settings:{FACEBOOK_PAGE_ACCESS_TOKEN:"secret"},fetcher:fake(evidence)});assert.equal(r.verified_public,false);}
});
test("YouTube private upload is not published; exact public listing is verified",async()=>{
 const rowData=row({Platform:"YouTube",YouTube_Video_ID:"a1B2c3D4e5F"});
 const settings={YOUTUBE_API_KEY:"secret"};
 assert.equal((await verifyExistingProviderReceipt(rowData,{settings,fetcher:fake({items:[{id:"a1B2c3D4e5F",status:{privacyStatus:"private"}}]})})).verified_public,false);
 const yes=await verifyExistingProviderReceipt(rowData,{settings,fetcher:fake({items:[{id:"a1B2c3D4e5F",status:{privacyStatus:"public"}}]})});
 assert.equal(yes.verified_public,true);
 assert.equal(yes.permalink,"https://www.youtube.com/watch?v=a1B2c3D4e5F");
});
test("unknown platform and failed provider access fail closed without printing secrets",async()=>{
 assert.equal((await verifyExistingProviderReceipt(row({Platform:"TikTok",Platform_Post_ID:"15"}))).status,"unavailable");
 const r=await verifyExistingProviderReceipt(row({Platform:"Facebook",Platform_Post_ID:"123456789_987654321"}),{
 settings:{FACEBOOK_PAGE_ACCESS_TOKEN:"secret"},fetcher:async()=>{throw Error("secret");}
 });
 assert.equal(r.status,"unavailable");assert.ok(!JSON.stringify(r).includes("secret"));
});
