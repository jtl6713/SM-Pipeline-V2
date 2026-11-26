import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyProductionEditorRoute, productionEditorDecision, authorizeProductionEditorHttp } from "./production-editor-boundary.mjs";
import { newIdeaProductionCapture,splitIdeaProductionCapture,manualProductionChoiceEnabled } from "./production-mode-capture.mjs";

const ids={org:"22222222-2222-2222-2222-222222222222",brand:"33333333-3333-3333-3333-333333333333",profile:"11111111-1111-1111-1111-111111111111",idea:"44444444-4444-4444-4444-444444444444",request:"55555555-5555-5555-5555-555555555555"};
const records={org:"recOrg00000000001",brand:"recBrand000000001",profile:"recProfile0000001",idea:"recIdea0000000001",request:"recRequest0000001",output:"recOutput00000001"};
const allowed={organizationRecordId:records.org,brandRecordIds:[records.brand],profileRecordIds:[records.profile]};
const org={id:ids.org,airtable_record_id:records.org};
const brand={id:ids.brand,airtable_record_id:records.brand,organization_id:ids.org};
const profile={id:ids.profile,airtable_record_id:records.profile,active:true,organization_id:ids.org,brand_id:ids.brand,organizations:org,brands:brand};
const idea={id:ids.idea,airtable_record_id:records.idea,content_profile_id:ids.profile,production_mode:"manual",production_source:"idea",content_profiles:profile};
const row={id:ids.request,airtable_record_id:records.request,idea_candidate_id:ids.idea,organization_id:ids.org,brand_id:ids.brand,organizations:org,brands:brand,request_status:"Draft",publish_status:{Active:true},idea_candidates:idea};
const env={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",STUDIO_PRODUCTION_MODE_EDITOR:"true"};
const u=(path)=>new URL("https://studio.example/"+path.replace(/^\//,""));
const requestPath="/api/production-requests/"+records.request;
const createPath="/api/ideas/"+records.idea+"/production-request";
const route=(path,verb="GET")=>classifyProductionEditorRoute(u(path),verb);
const decide=(path,verb="GET",r=row)=>productionEditorDecision(route(path,verb),r,allowed);
const typed=(mode,source)=>({...row,idea_candidates:{...idea,production_mode:mode,production_source:source}});

test("only exact authorized Manual Idea can open ordinary editor, assets, plan, outputs or approve",()=>{
  for(const [suffix,verb] of [["","GET"],["?fields=light","GET"],["","PATCH"],["/assets","GET"],["/assets/library","POST"],["/plan","POST"],["/variants","POST"],["/outputs","PUT"],["/promote","POST"],["/producer-conversation","POST"],["/item4","GET"]]) {
    assert.equal(decide(requestPath+suffix,verb),true,suffix);
    for(const [mode,source] of [["automatic","idea"],[null,null],["automatic","finished_video"],["automatic","script_a_short"]])
      assert.equal(decide(requestPath+suffix,verb,typed(mode,source)),false,suffix);
  }
});
test("dedicated finished intake cannot open ordinary editor or generic approval even with scope",()=>{
  const finished=typed("automatic","finished_video");
  for(const [suffix,verb] of [["","GET"],["","PATCH"],["/assets","POST"],["/assets/upload-session","POST"],["/assets/upload-session/x/parts/1","PUT"],["/assets/upload-session/x/complete","POST"],["/item4","GET"],["/outputs","GET"]])
    assert.equal(decide(requestPath+suffix+"?production_scope=finished-video",verb,finished),true,suffix);
  for(const [suffix,verb] of [["/promote","POST"],["/producer-conversation","POST"],["/generate-ai-masters","POST"],["/assets/library","POST"],["/timed-script","POST"]])
    assert.equal(decide(requestPath+suffix+"?production_scope=finished-video",verb,finished),false,suffix);
  assert.equal(decide(requestPath+"?production_scope=finished-video","GET",typed("automatic","idea")),false);
  assert.equal(decide(requestPath+"?production_scope=script-a-short","GET",typed("automatic","script_a_short")),false);
});
test("narrow operational progress stays available, forged scope or duplicate fields do not expose full detail",()=>{
  const automatic=typed("automatic","idea");
  assert.equal(decide(requestPath+"?fields=producer-progress","GET",automatic),true);
  assert.equal(decide(requestPath+"?production_scope=progress","GET",automatic),false);
  assert.equal(decide(requestPath+"?fields=producer-progress&fields=light","GET",automatic),false);
  assert.equal(decide(requestPath+"?fields=producer-progress","PATCH",automatic),false);
  assert.equal(decide(requestPath+"?production_scope=manual&production_scope=finished-video","GET",automatic),false);
});
test("exact tenant/profile/brand relationships reject cross-profile compatibility records",()=>{
  for(const mismatch of [{organization_id:ids.brand},{brand_id:ids.org},{idea_candidate_id:ids.brand},
    {idea_candidates:{...idea,content_profiles:{...profile,active:false}}},
    {idea_candidates:{...idea,content_profiles:{...profile,brand_id:ids.org}}},
    {brands:{...brand,organization_id:ids.profile}},
    {idea_candidates:{...idea,content_profiles:{...profile,airtable_record_id:"recOther000000001"}}}])
    assert.equal(decide(requestPath,"GET",{...row,...mismatch}),false);
});
test("creation scope only grants existing trusted source and explicit manual mode",()=>{
  assert.equal(decide(createPath,"POST",idea),true);
  assert.equal(decide(createPath,"POST",{...idea,production_mode:"automatic"}),false);
  assert.equal(decide(createPath+"?production_scope=script-a-short","POST",{...idea,production_mode:"automatic",production_source:"script_a_short"}),true);
  assert.equal(decide("/api/production-requests?production_scope=finished-video","POST",{...idea,production_mode:"automatic",production_source:"finished_video"}),true);
  assert.equal(decide("/api/production-requests?production_scope=finished-video","POST",idea),false);
});
test("HTTP gate is off by default, refuses partial activation and checks exact child FK",async()=>{
  const path="/api/production-request-outputs/"+records.output;
  const request=new Request(u(path),{method:"PATCH",body:"{}"});
  let calls=0;
  const read=async query=>{calls++;assert.match(query,/production_request_outputs\?/);return [{airtable_record_id:records.output,production_request_id:ids.request,organization_id:ids.org,brand_id:ids.brand,production_requests:row}]};
  assert.equal((await authorizeProductionEditorHttp({request,url:u(path),env:{},read,allowed})).allowed,true);
  assert.equal(calls,0);
  assert.equal((await authorizeProductionEditorHttp({request,url:u(path),env:{STUDIO_PRODUCTION_MODE_EDITOR:"true"},read,allowed})).status,503);
  assert.equal(calls,0);
  assert.equal((await authorizeProductionEditorHttp({request,url:u(path),env,read,allowed})).allowed,true);
  assert.equal(calls,1);
  const bad=async()=>[{airtable_record_id:records.output,production_request_id:ids.profile,organization_id:ids.org,brand_id:ids.brand,production_requests:row}];
  assert.equal((await authorizeProductionEditorHttp({request,url:u(path),env,read:bad,allowed})).allowed,false);
  const malformed=u("/api/production-requests/recShort");
  assert.equal((await authorizeProductionEditorHttp({request:new Request(malformed),url:malformed,env,read,allowed})).status,400);
});
test("collection create checks body Idea without consuming the handler request",async()=>{
  const url=u("/api/production-requests");
  const request=new Request(url,{method:"POST",body:JSON.stringify({idea_record_id:records.idea})});
  const read=async query=>{assert.match(query,/idea_candidates\?/);return [idea]};
  assert.equal((await authorizeProductionEditorHttp({request,url,env,read,allowed})).allowed,true);
  assert.equal((await request.json()).idea_record_id,records.idea);
});
test("explicit human Manual mode capture is gated and immutable on generic edit",()=>{
  assert.equal(manualProductionChoiceEnabled(env),true);
  assert.throws(()=>newIdeaProductionCapture({}, "idea",{requestedMode:"manual",humanChoice:true}),/not enabled/);
  assert.throws(()=>newIdeaProductionCapture(env,"idea",{requestedMode:"manual"}),/human Idea/);
  assert.throws(()=>newIdeaProductionCapture(env,"finished_video",{requestedMode:"manual",humanChoice:true}),/human Idea/);
  const manual=newIdeaProductionCapture(env,"idea",{requestedMode:"manual",humanChoice:true});
  assert.deepEqual(splitIdeaProductionCapture(env,manual,{creating:true}).typed,{production_mode:"manual",production_source:"idea"});
  assert.deepEqual(splitIdeaProductionCapture(env,manual,{creating:false}).typed,{});
  assert.deepEqual(newIdeaProductionCapture(env,"finished_video"),{Studio_Production_Mode:"automatic",Studio_Production_Source:"finished_video"});
});
test("HTTP boundary precedes all ordinary handlers, Finished Video scheduler remains unchanged",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  assert.ok(worker.indexOf("const access = await authorizeProductionEditorHttp(")<worker.indexOf("if (isIdeaProductionRequestRoute) {"));
  assert.ok(worker.indexOf("const access = await authorizeProductionEditorHttp(")<worker.indexOf("if (isProductionRequestRecordRoute) {"));
  assert.match(worker,/if \(!access\.allowed\) throw new HttpError/);
});
