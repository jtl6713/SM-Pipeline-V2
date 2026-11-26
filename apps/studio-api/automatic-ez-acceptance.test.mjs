import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { automaticEzAcceptanceNotes, automaticEzAcceptedContext, queueAcceptedAutomaticEz, automaticEzMediaContext, automaticEzDestinationPlan, automaticEzDestinationPlanMatches } from "./automatic-ez-intake.mjs";
const ideaId="recIdea0000000001",profileId="recProfile0000001",requestId="recRequest0000001",assetId="recAsset000000001";
const idea={id:ideaId,fields:{Content_Profile:[profileId],Studio_Production_Mode:"automatic",Studio_Production_Source:"idea",Candidate_Status:"Generated",Studio_Photo_Wait_Status:"Not Needed",Production_Config_Notes:"[automatic-ez-intake.1] single-photo"}};
const assets=[{id:"asset",order:1,media_asset_record_id:assetId,google_drive_file_id:"drive",content_profile_id:profileId,media_kind:"photo"}];
const draft={id:requestId,fields:{Request_Status:"Draft",Active:true,Idea_Candidate:[ideaId],Production_Notes:"origin=ez-wizard; ez-input=single-photo; ez-package=slides",Target_Platforms:["Instagram"],Master_Content_Type:"Feed Post",Studio_Master_Asset_Status:"Ready",Studio_Master_Asset_Count:1,Studio_Master_Assets_JSON:JSON.stringify(assets),Studio_Master_Media_Assets:[assetId]}};
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

test("explicit EZ package and selected platforms are frozen in the acceptance receipt",()=>{
 const note=automaticEzAcceptanceNotes(draft,idea);
 const accepted={...draft,fields:{...draft.fields,Production_Notes:note}};
 const context=automaticEzAcceptedContext(accepted,idea);
 assert.deepEqual(context.destination.items,[{platform:"Instagram",output_type:"Single Image"}]);
 for(const patch of [{Target_Platforms:["Facebook"]},{Target_Platforms:["Instagram","Facebook"]},{Master_Content_Type:"Photo Set"}])
  assert.equal(automaticEzAcceptedContext({...accepted,fields:{...accepted.fields,...patch}},idea),null);
 for(const patch of [{Target_Platforms:[]},{Target_Platforms:["X"]},{Target_Platforms:["YouTube"]},
  {Production_Notes:"origin=ez-wizard; ez-input=single-photo; ez-package=custom"},
  {Production_Notes:"origin=ez-wizard; ez-input=single-photo; ez-package=slides; ez-package=video"}])
  assert.throws(()=>automaticEzAcceptanceNotes({...draft,fields:{...draft.fields,...patch}},idea));
});
test("standard video and slide destinations retain exact browser format choices, including only selected companion stories",()=>{
 const plan=(pkg,count,platforms,kind="multiple-photos")=>automaticEzDestinationPlan({fields:{...draft.fields,
  Production_Notes:"origin=ez-wizard; ez-input="+kind+"; ez-package="+pkg,Studio_Master_Asset_Count:count,Target_Platforms:platforms}},kind);
 assert.deepEqual(plan("video",3,["Facebook","YouTube"]).items,[
  {platform:"Facebook",output_type:"Reel"},{platform:"YouTube",output_type:"Short"},{platform:"Facebook",output_type:"Story"}]);
 assert.deepEqual(plan("slides",3,["Instagram","Facebook","TikTok","YouTube"]).items,[
  {platform:"Instagram",output_type:"Carousel"},{platform:"Facebook",output_type:"Multi-Image Post"},
  {platform:"TikTok",output_type:"Multi-Photo"},{platform:"YouTube",output_type:"Slideshow Video"}]);
 assert.equal(plan("slides",2,["Facebook"],"video-clips"),null);
 assert.equal(plan("video",2,["Instagram","Instagram"]),null);
});
test("saved output plan must match every accepted destination without duplicates or spillover",()=>{
 const destination=automaticEzDestinationPlan(draft,"single-photo");
 const saved=items=>({fields:{...draft.fields,Studio_Output_Plan_Status:"Ready",Studio_Output_Plan_JSON:JSON.stringify({items})}});
 assert.equal(automaticEzDestinationPlanMatches(saved(destination.items),destination),true);
 for(const items of [[],[{platform:"Instagram",output_type:"Reel"}],
  [...destination.items,{platform:"Facebook",output_type:"Story"}],[...destination.items,...destination.items]])
  assert.equal(automaticEzDestinationPlanMatches(saved(items),destination),false);
});

test("both producer plan paths use accepted formats and Item4 fences writes before creating destinations",()=>{
 const producer=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
 const claim=producer.slice(producer.indexOf("async function processReadyProductionClaim("),producer.indexOf("async function studioReadyProductionCronResume("));
 const finish=producer.slice(producer.indexOf("export async function finishAutonomousProductionRequest("));
 for(const path of [claim,finish]){
  assert.match(path,/overrides: acceptedEz\?acceptedEz\.destination\.overrides/);
  assert.match(path,/extras: acceptedEz\?acceptedEz\.destination\.extras/);
  assert.match(path,/automaticEzDestinationPlanMatches\(/);
 }
 const worker=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
 const plan=worker.slice(worker.indexOf("function buildItem4OutputPlan("),worker.indexOf("/*__STUDIO_WORKER_END:buildItem4OutputPlan__*/"));
 assert.ok(plan.indexOf("automaticEzDestinationItemsMatch(plannedItems,acceptedEz.destination)")>0);
 assert.ok(plan.indexOf("automaticEzDestinationItemsMatch(plannedItems,acceptedEz.destination)")<plan.indexOf("await item4SyncPlanOutputs("));
 assert.match(plan,/Target_Platforms:acceptedEz\?acceptedEz\.destination\.platforms/);
 assert.match(plan,/schedules: acceptedEz\?undefined:payload\.schedules/);
});
