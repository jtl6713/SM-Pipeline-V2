import test from "node:test";
import assert from "node:assert/strict";
import { automaticEzAcceptanceNotes, automaticEzAcceptedContext, queueAcceptedAutomaticEz, automaticEzMediaContext } from "./automatic-ez-intake.mjs";
const ideaId="recIdea0000000001",profileId="recProfile0000001",requestId="recRequest0000001",assetId="recAsset000000001";
const idea={id:ideaId,fields:{Content_Profile:[profileId],Studio_Production_Mode:"automatic",Studio_Production_Source:"idea",Candidate_Status:"Generated",Studio_Photo_Wait_Status:"Not Needed",Production_Config_Notes:"[automatic-ez-intake.1] single-photo"}};
const assets=[{id:"asset",order:1,media_asset_record_id:assetId,google_drive_file_id:"drive",content_profile_id:profileId,media_kind:"photo"}];
const draft={id:requestId,fields:{Request_Status:"Draft",Active:true,Idea_Candidate:[ideaId],Production_Notes:"origin=ez-wizard; ez-input=single-photo",Studio_Master_Asset_Status:"Ready",Studio_Master_Asset_Count:1,Studio_Master_Assets_JSON:JSON.stringify(assets),Studio_Master_Media_Assets:[assetId]}};
test("acceptance requires exact saved original, profile and canonical media links, not just Ready",()=>{
 const notes=automaticEzAcceptanceNotes(draft,idea);
 const accepted={...draft,fields:{...draft.fields,Production_Notes:notes}};
 assert.equal(automaticEzAcceptedContext(accepted,idea).ids[0],assetId);
 assert.equal(automaticEzMediaContext(accepted,idea),null);
 for(const patch of [{Studio_Master_Asset_Status:"Uploading"},{Studio_Master_Asset_Count:2},{Studio_Master_Media_Assets:[]},{Studio_Master_Assets_JSON:JSON.stringify([{...assets[0],content_profile_id:"other"}])},{Studio_Master_Assets_JSON:JSON.stringify([{...assets[0],compression_needed:true}])}])
  assert.throws(()=>automaticEzAcceptanceNotes({...draft,fields:{...draft.fields,...patch}},idea));
 assert.equal(automaticEzAcceptedContext({...accepted,fields:{...accepted.fields,Studio_Master_Media_Assets:[]}},idea),null);
});
test("receipt -> accepted Idea -> durable queue; replay does not recreate or republish",async()=>{
 let saved=draft,owner=idea,job=null;const calls=[];
 const run=()=>queueAcceptedAutomaticEz({idea:owner,draft:saved,listRequests:async()=>[saved],
  readJob:async()=>job,commitDraft:async(row,notes)=>{calls.push("draft");return saved={...row,fields:{...row.fields,Production_Notes:notes}};},
  commitIdea:async(row)=>{calls.push("idea");return owner={...row,fields:{...row.fields,Candidate_Status:"Approved"}};},
  enqueue:async()=>{calls.push("queue");return job={idea_id:ideaId,profile_id:profileId,status:"queued"};}});
 const result=await run();assert.deepEqual(calls,["draft","idea","queue"]);assert.equal(result.publishing,false);assert.equal(result.requires_factory_approval,true);
 await run();assert.deepEqual(calls,["draft","idea","queue"]);
});
test("unverified existing job or canonical lookup does not write acceptance",async()=>{
 for(const existing of [null,[draft,draft],[draft]]) {
  await assert.rejects(queueAcceptedAutomaticEz({idea,draft,listRequests:async()=>existing,readJob:async()=>({status:"queued"}),commitDraft:async()=>assert.fail("write"),commitIdea:async()=>assert.fail("write"),enqueue:async()=>assert.fail("enqueue")}));
 }
});
