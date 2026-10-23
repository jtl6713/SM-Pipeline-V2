import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { interpretFactoryProducerFeedback } from "./factory-producer-feedback.mjs";
import { applyGroundedMediaEdits } from "./factory-producer-media-edits.mjs";
import { validateProducerPlan, planSelectiveRework } from "./conversational-producer-plan.mjs";

// Evaluates the actual production functions using hermetic Airtable/R2/runner
// adapters. No real Airtable records, scheduled posts, or external calls.
const source = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const marker = new RegExp(`export async function ${name}\\(`);
  const match = marker.exec(source);
  if (!match) throw new Error("missing Worker function " + name);
  const end = source.indexOf(`/*__STUDIO_WORKER_END:${name}__*/`, match.index);
  if (end < 0) throw new Error("missing end marker " + name);
  return source.slice(match.index, end).replace(/^export /, "");
}
const functions = ["factorySendBackContent","factoryVerifyProducerRevisions"].map(functionSource).join("\n");
const REQUEST = "recRequest0000001",CONTENT = "recContent0000001",OUTPUT = "recOutput00000001",IDEA = "recIdea000000001";
const movie = {id:"video000000000001",order:2,name:"original clip",media_kind:"video",mime_type:"video/mp4",duration_seconds:12,in_seconds:0,out_seconds:12,google_drive_file_id:"drive-original-video",media_asset_record_id:"recAssetVideo0001"};
const photo = {id:"photo000000000001",order:1,name:"original still",media_kind:"photo",mime_type:"image/jpeg",google_drive_file_id:"drive-original-photo",media_asset_record_id:"recAssetPhoto0001"};

function harness() {
  const env = {AIRTABLE_OUTPUT_TABLE_ID:"outputs",AIRTABLE_CONTENT_TABLE_ID:"contents",AIRTABLE_IDEA_TABLE_ID:"ideas",STUDIO_MEDIA:{}};
  const request = {id:REQUEST,fields:{Request_Status:"Promoted",Promoted_Content_Item:[CONTENT],Idea_Candidate:[IDEA],Production_Notes:"",Studio_Master_Assets_JSON:JSON.stringify([photo,movie])}};
  const outputs = [{id:OUTPUT,fields:{Production_Request:[REQUEST],Content_Item:[CONTENT],Enabled:true,Output_Status:"Ready for Review",Render_Status:"Rendered",Publish_Status:"Not Ready",Review_Status:"Review Sent",Do_Not_Publish:false,Final_File_URL:"https://example.test/old.mp4",Studio_Preview_URL:"https://example.test/old-preview.mp4"}}];
  const parent = {id:CONTENT,fields:{}};
  const records = new Map([[REQUEST,request],[CONTENT,parent],[OUTPUT,outputs[0]],[IDEA,{id:IDEA,fields:{}}]]);
  const f = (r,name)=>r?.fields?.[name];
  const links = v => Array.isArray(v) ? v[0] : null;
  const patch=(row,options)=>{Object.assign(row.fields,JSON.parse(options.body).fields);return row;};
  const ctx={
    crypto:webcrypto,Date,JSON,Math,String,Number,Boolean,Map,Set,Array,Object,RegExp,Error,console,
    HttpError:class HttpError extends Error {constructor(status,message){super(message);this.status=status;}},
    PRODUCTION_REQUEST_TABLE:"requests",f,studioFirstLinkedId:links,
    airtableFetch:async (_env,_table,id,options)=>{const row=records.get(id);if(!row)throw Error("unknown Airtable row "+id);return options?.method==="PATCH"?patch(row,options):row;},
    airtableBatchUpdate:async (_env,_table,updates)=>{for(const item of updates){const row=records.get(item.id);assert.ok(row);Object.assign(row.fields,item.fields);}},
    withOutputApprovalLock:async (_store,_id,action)=>action(),
    outputRowsForProductionRequest:async ()=>[{id:"recPRO0000000001",fields:{Enabled:true,Platform_Output:[OUTPUT]}}],
    loadContentPlatformOutputs:async ()=>outputs,
    arrayOrEmpty:v=>Array.isArray(v)?v:[],
    outputAlreadyApprovedForPublishing:()=>false,
    item4ProductionProfileRecord:async ()=>({id:"recProfile0000001"}),
    item4AssetManifest:row=>JSON.parse(f(row,"Studio_Master_Assets_JSON")||"[]"),
    applyGroundedMediaEdits,validateProducerPlan,planSelectiveRework,
    factoryLatestReviewFeedback:()=>null,
    factoryAppendFeedback:(before,note)=>[before,`[factory-review-feedback]\n${note}\n[/factory-review-feedback]`].filter(Boolean).join("\n"),
    withFactoryRevisionOpen:notes=>notes+"\n[factory-revision-open]",
    listRecords:async ()=>[request],
  };
  const api=runInNewContext(functions+"\n({factorySendBackContent,factoryVerifyProducerRevisions})",ctx);
  return {api,env,request,outputs,parent,records};
}

test("Factory → persisted Producer media changes → isolated render evidence → independent QA → human review",async()=>{
  const {api,env,request,outputs,records}=harness();
  const note="Move existing asset video000000000001 to position 1.";
  const interpretation=interpretFactoryProducerFeedback(note);
  assert.equal(interpretation.automatic,true);
  const receipt=await api.factorySendBackContent(env,REQUEST,[OUTPUT],"staging-user",note,interpretation);
  assert.equal(receipt.producer_queued,true);
  assert.equal(outputs[0].fields.Do_Not_Publish,true);
  assert.equal(outputs[0].fields.Output_Status,"Changes Requested");
  const revised=JSON.parse(request.fields.Studio_Master_Assets_JSON);
  assert.deepEqual(revised.map(x=>x.id),["video000000000001","photo000000000001"]);
  const job=JSON.parse(request.fields.Studio_Production_Job_JSON);
  assert.deepEqual(job.producer_changes,["reorder_media"]);
  assert.equal(job.previous_outputs[0].final_file_url,"https://example.test/old.mp4");
  // No false positive: runner has not completed yet.
  const before=await api.factoryVerifyProducerRevisions(env);
  assert.equal(before.length,0);
  assert.equal(outputs[0].fields.Do_Not_Publish,true);
  // Mimic a successful existing runner handoff; the QA function itself is REAL.
  request.fields.Request_Status="Promoted";
  request.fields.Studio_Production_Job_JSON=JSON.stringify({...job,step:"done"});
  outputs[0].fields.Output_Status="Ready for Review";
  outputs[0].fields.Render_Status="Rendered";
  outputs[0].fields.Final_File_URL="https://example.test/new.mp4";
  const completed=await api.factoryVerifyProducerRevisions(env);
  assert.deepEqual(JSON.parse(JSON.stringify(completed)),[{request_id:REQUEST,quality:"passed"}]);
  assert.equal(outputs[0].fields.Publish_Status,"Not Ready");
  assert.equal(outputs[0].fields.Do_Not_Publish,false);
  assert.notEqual(outputs[0].fields.Review_Status,"Approved");
  assert.match(request.fields.Production_Notes,/state=completed/);
  assert.equal(JSON.parse(request.fields.Studio_Production_Job_JSON).producer_quality.passed,true);
});

test("Factory fails before changing any outputs if a clip trim exceeds the verified source",async()=>{
 const {api,env,request,outputs}=harness();
 const original=JSON.stringify(request.fields);
 const note="Trim existing clip video000000000001 from 1 to 30 seconds.";
 const p=interpretFactoryProducerFeedback(note);
 assert.equal(p.automatic,true);
 await assert.rejects(()=>api.factorySendBackContent(env,REQUEST,[OUTPUT],"staging",note,p),/outside the verified clip duration/);
 assert.equal(JSON.stringify(request.fields),original);
 assert.equal(outputs[0].fields.Do_Not_Publish,false);
});

test("Quality gate never releases the publish hold for a stale render",async()=>{
 const {api,env,request,outputs}=harness();
 const note="Move existing asset video000000000001 to position 1";
 const accepted=await api.factorySendBackContent(env,REQUEST,[OUTPUT],"staging",note,interpretFactoryProducerFeedback(note));
 const job=JSON.parse(request.fields.Studio_Production_Job_JSON);
 request.fields.Request_Status="Promoted";
 request.fields.Studio_Production_Job_JSON=JSON.stringify({...job,step:"done"});
 outputs[0].fields.Output_Status="Ready for Review";
 outputs[0].fields.Render_Status="Rendered";
 const res=await api.factoryVerifyProducerRevisions(env);
 assert.equal(res[0].quality,"retry_pending");
 assert.equal(outputs[0].fields.Do_Not_Publish,true);
 assert.equal(JSON.parse(request.fields.Studio_Production_Job_JSON).producer_quality.passed,false);
});

test("Named creative direction → authoritative asset IDs → revision job → fresh render verification",async()=>{
 const {api,env,request,outputs}=harness();
 const note="Move the original still photo to position 2";
 const directive=interpretFactoryProducerFeedback(note);
 assert.equal(directive.automatic,true);
 assert.equal(directive.media_edits[0].asset_name,"original still");
 const receipt=await api.factorySendBackContent(env,REQUEST,[OUTPUT],"staging-user",note,directive);
 assert.equal(receipt.producer_queued,true);
 const manifest=JSON.parse(request.fields.Studio_Master_Assets_JSON);
 assert.deepEqual(manifest.map(x=>x.id),["video000000000001","photo000000000001"]);
 const job=JSON.parse(request.fields.Studio_Production_Job_JSON);
 assert.deepEqual(job.producer_changes,["reorder_media"]);
 assert.equal(job.producer_media_expectations[0].id,"video000000000001");
 assert.equal(outputs[0].fields.Do_Not_Publish,true);
 request.fields.Request_Status="Promoted";
 request.fields.Studio_Production_Job_JSON=JSON.stringify({...job,step:"done"});
 outputs[0].fields.Output_Status="Ready for Review";
 outputs[0].fields.Render_Status="Rendered";
 outputs[0].fields.Final_File_URL="https://example.test/new-render.mp4";
 const completed=await api.factoryVerifyProducerRevisions(env);
 assert.equal(completed[0].quality,"passed",JSON.stringify(JSON.parse(request.fields.Studio_Production_Job_JSON).producer_quality));
 assert.equal(outputs[0].fields.Publish_Status,"Not Ready");
 assert.notEqual(outputs[0].fields.Review_Status,"Approved");
});
test("Unmatched named asset rejects before changing Airtable",async()=>{
 const {api,env,request,outputs}=harness();
 const old=JSON.stringify(request.fields);
 const note="Move the missing skyline photo to position 1";
 await assert.rejects(
  ()=>api.factorySendBackContent(env,REQUEST,[OUTPUT],"staging-user",note,interpretFactoryProducerFeedback(note)),
  /not uniquely resolved/
 );
 assert.equal(JSON.stringify(request.fields),old);
 assert.equal(outputs[0].fields.Do_Not_Publish,false);
});
