import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FACEBOOK_REEL_POLL_FORMULA, facebookReelPollEligible, facebookReelPollVideoId, selectFacebookReelPollBatch } from "./facebook-reel-finalize-priority.mjs";

const now=Date.parse("2026-10-22T17:00:00.000Z");
const make=(num,fields={})=>({id:"rec"+String(num).padEnd(14,"0"),fields:{
  Platform:"Facebook",Platform_Output_Type:"Facebook Reel",Review_Status:"Approved",
  Publish_Status:"Publishing",Output_Status:"Approved for Publishing",
  FB_Slideshow_Status:"Reel Processing",FB_Slideshow_Meta_Video_ID:String(num).padEnd(16,"0"),
  Publish_Next_Retry_At:"2026-10-22T16:00:00.000Z",
  ...fields,
}});
test("FBS4 only examines known existing Meta videos after their retry time",()=>{
  assert.match(FACEBOOK_REEL_POLL_FORMULA,/FB_Slideshow_Meta_Video_ID/);
  assert.match(FACEBOOK_REEL_POLL_FORMULA,/Publish_Next_Retry_At/);
  assert.equal(facebookReelPollEligible(make(2301),now),true);
  for(const fields of [
    {Platform:"Instagram"},{Platform_Output_Type:"Facebook Photo Set"},
    {FB_Slideshow_Status:"Video Ready"},{Publish_Status:"Published"},
    {Output_Status:"Published"},{Published_At:"2026-10-22T15:00Z"},
    {Do_Not_Publish:true},{Test_Run_ID:"test"},
    {Publish_Next_Retry_At:"2026-10-22T18:00Z"},
    {Publish_Locked_By:"FBS4"},{Publish_Locked_At:"2026-10-22T16:00Z"},
    {FB_Slideshow_Meta_Video_ID:"" ,Platform_Post_ID:""},
    {FB_Slideshow_Meta_Video_ID:"29351606447777227",Platform_Post_ID:"wrong"},
  ])assert.equal(facebookReelPollEligible(make(2301,fields),now),false,JSON.stringify(fields));
});
test("FBS4 refuses mismatched remote video identity",()=>{
  assert.equal(facebookReelPollVideoId(make(2301,{Platform_Post_ID:"2301000000000000"})),"2301000000000000");
  assert.equal(facebookReelPollVideoId(make(2301,{Platform_Post_ID:"OTHER"})),"");
});
test("oldest unpolled eligible Reels first, bounded and no new upload",()=>{
  const rows=[make(2301,{FB_Slideshow_Last_Checked_At:"2026-10-22T16:40Z"}),
    make(1691,{FB_Slideshow_Last_Checked_At:"2026-10-22T15:35Z"}),
    make(2900,{FB_Slideshow_Last_Checked_At:"2026-10-22T15:36Z"})];
  assert.deepEqual(selectFacebookReelPollBatch(rows,{limit:2,nowMs:now}).map(x=>x.id),[rows[1].id,rows[2].id]);
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const worker=fs.readFileSync(path.join(dir,"worker.js"),"utf8");
  const ops=fs.readFileSync(path.join(dir,"worker-functions-04.mjs"),"utf8");
  const fn=ops.slice(ops.indexOf("export async function studioReconcileFacebookReelFinalizes("),
    ops.indexOf("/*__STUDIO_WORKER_END:studioReconcileFacebookReelFinalizes__*/"));
  assert.match(fn,/studioPulseFbs4\(env, latest\)/);
  assert.match(fn,/persistVerifiedRecoveryInAirtable/);
  assert.match(fn,/airtable_existing_publication_receipt/);
  assert.match(fn,/durable_recovery_recorded/);
  assert.doesNotMatch(fn,/studioPulseFbs3|studioPulseFbs2|studioPulseFb2\(/);
  const cron=worker.slice(worker.indexOf("const cadence = studioCronAirtableCadence(cadenceNow"),
    worker.indexOf("await factoryBatchCronResume(env, ctx)",worker.indexOf("const cadence = studioCronAirtableCadence(cadenceNow")));
  assert.match(cron,/studioReconcileFacebookReelFinalizes\(env, \{ limit: 3 \}\)/);
});
