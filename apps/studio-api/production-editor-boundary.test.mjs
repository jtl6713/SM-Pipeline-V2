import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyProductionEditorHttp,editorGuardEnabled,assertEditorGuardReady,
  parseNewIdeaModeChoice,manualEditorAuthority,verifyEditorHttpAccess,
  childEditorParent,manualIdeaAuthority} from "./production-editor-boundary.mjs";
import {newIdeaProductionCapture,splitIdeaProductionCapture} from "./production-mode-capture.mjs";
const flags={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",
  STUDIO_PRODUCTION_EDITOR_GUARD:"true",STUDIO_MANUAL_IDEA_CREATE:"true"};
const id=n=>"rec"+String(n).padStart(14,"0");
const uuid=n=>String(n).padStart(8,"0")+"-1111-1111-1111-111111111111";
const scope={organizationId:id(1),profiles:[{id:id(2),brandIds:[id(3)]}]};
const idea={id:uuid(4),airtable_record_id:id(4),production_mode:"manual",
  production_source:"idea",content_profile_id:uuid(2),
  content_profiles:{id:uuid(2),airtable_record_id:id(2)}};
const request={id:uuid(5),airtable_record_id:id(5),request_status:"Draft",
  organization_id:uuid(1),brand_id:uuid(3),idea_candidate_id:uuid(4),
  organizations:{id:uuid(1),airtable_record_id:id(1)},brands:{id:uuid(3),airtable_record_id:id(3)},
  idea_candidates:idea,publish_status:{Active:true}};
const child={airtable_record_id:id(6),production_request_id:uuid(5),organization_id:uuid(1),brand_id:uuid(3),
  production_request_airtable_id:id(5),production_request_airtable_ids:[id(5)],
  production_requests:{id:uuid(5),airtable_record_id:id(5)}};
test("guard disabled by default and requires capture and routing",()=>{
  assert.equal(editorGuardEnabled({}),false);
  assert.throws(()=>assertEditorGuardReady({STUDIO_PRODUCTION_EDITOR_GUARD:"true"}));
  assert.doesNotThrow(()=>assertEditorGuardReady(flags));
});
test("direct editor paths and writes all route through the guard, even malformed identities",()=>{
  for(const suffix of ["","/item4","/plan","/variants","/assets","/assets/library",
    "/assets/upload-session/abc/parts/1","/outputs","/promote","/producer-conversation","/sync-directives"]) {
    for(const verb of ["GET","POST","PATCH","PUT","DELETE"])
      assert.deepEqual(classifyProductionEditorHttp("/api/production-requests/"+id(5)+suffix,verb,new URLSearchParams("scope=dedicated")),{kind:"request",id:id(5)});
  }
  assert.deepEqual(classifyProductionEditorHttp("/api/production-requests/recShort","GET"),{kind:"request",id:"recShort"});
  assert.deepEqual(classifyProductionEditorHttp("/api/production-request-outputs/"+id(6),"PATCH"),{kind:"output",id:id(6)});
  assert.deepEqual(classifyProductionEditorHttp("/api/ideas/"+id(4)+"/production-request","POST"),{kind:"idea_draft",id:id(4)});
  assert.deepEqual(classifyProductionEditorHttp("/api/production-requests","POST"),{kind:"create_request"});
});
test("existing operational-only projection and Factory routes are outside editor guard",()=>{
  const progress=new URLSearchParams("fields=producer-progress");
  assert.equal(classifyProductionEditorHttp("/api/production-requests/"+id(5),"GET",progress),null);
  assert.equal(classifyProductionEditorHttp("/api/production-requests/"+id(5),"PATCH",progress).kind,"request");
  assert.equal(classifyProductionEditorHttp("/api/production-requests","GET"),null);
  assert.equal(classifyProductionEditorHttp("/api/factory/outputs/"+id(6)+"/preview","GET"),null);
  assert.equal(classifyProductionEditorHttp("/api/production-requests/"+id(5),"GET",new URLSearchParams("fields=light")).kind,"request");
});
test("exact request must be manual, same tenant/profile/brand, with consistent compatibility links",()=>{
  assert.equal(manualEditorAuthority(request,{...scope,requestId:id(5)}),true);
  for(const patch of [
    {idea_candidates:{...idea,production_mode:"automatic"}},{idea_candidates:{...idea,production_mode:null}},
    {idea_candidates:{...idea,production_source:"script_a_short"}},
    {idea_candidates:{...idea,production_source:"finished_video"}},
    {idea_candidate_id:uuid(9)},{organization_id:uuid(9)},{brand_id:uuid(9)},
    {idea_candidates:{...idea,content_profile_id:uuid(9)}},
    {publish_status:{Idea_Candidate:[id(9)]}},
    {publish_status:{Organization:[id(9)]}},{publish_status:{Brand:[id(9)]}},
    {publish_status:{content_profile_airtable_id:id(9)}},
    {production_notes:"origin=az-finished-video"},{request_status:"Cancelled"},
  ]) assert.equal(manualEditorAuthority({...request,...patch},{...scope,requestId:id(5)}),false,JSON.stringify(patch));
  assert.equal(manualEditorAuthority(request,{...scope,requestId:id(5),profiles:[]}),false);
});
test("child output cannot redirect through stale parent or mismatched tenant",async()=>{
  assert.equal(childEditorParent(child,id(6)),id(5));
  assert.equal(childEditorParent({...child,production_request_airtable_ids:[id(9)]},id(6)),null);
  const call=async row=>verifyEditorHttpAccess({route:{kind:"output",id:id(6)},scope,
    read:async path=>path.startsWith("production_request_outputs?")?[row]:[request]});
  assert.equal(await call(child),true);
  assert.equal(await call({...child,brand_id:uuid(9)}),false);
  assert.equal(await call({...child,production_request_id:uuid(9)}),false);
});
test("direct draft creation also requires exact manual Idea and matching authorized projection",async()=>{
  const route={kind:"idea_draft",id:id(4)};
  const shaped={id:id(4),fields:{Studio_Production_Mode:"manual",Studio_Production_Source:"idea",Content_Profile:[id(2)]}};
  assert.equal(manualIdeaAuthority(idea,id(4),scope),true);
  const call=(row,projection=shaped)=>verifyEditorHttpAccess({route,scope,read:async()=>[row],loadIdea:async()=>projection});
  assert.equal(await call(idea),true);
  assert.equal(await call({...idea,production_mode:"automatic"}),false);
  assert.equal(await call(idea,{...shaped,fields:{...shaped.fields,Content_Profile:[id(9)]}}),false);
});
test("only human ordinary Idea creation can explicitly capture manual when all flags enabled",()=>{
  assert.equal(parseNewIdeaModeChoice({}, {source:"idea"}),"automatic");
  assert.equal(parseNewIdeaModeChoice(flags,{source:"idea",requestedMode:"manual",canConfigure:true}),"manual");
  for(const f of Object.keys(flags)) assert.throws(()=>parseNewIdeaModeChoice({...flags,[f]:"false"},
    {source:"idea",requestedMode:"manual",canConfigure:true}),/not yet enabled/);
  for(const source of ["script_a_short","finished_video","vibe_cut"]) assert.throws(()=>parseNewIdeaModeChoice(flags,
    {source,requestedMode:"manual",canConfigure:true}),/authorized ordinary Idea/);
  assert.throws(()=>parseNewIdeaModeChoice(flags,{source:"idea",requestedMode:"manual",canConfigure:false}));
  assert.throws(()=>parseNewIdeaModeChoice(flags,{source:"idea",requestedMode:"yes",canConfigure:true}));
  const marker=newIdeaProductionCapture(flags,"idea",{requestedMode:"manual",humanChoice:true});
  assert.deepEqual(splitIdeaProductionCapture(flags,marker,{creating:true}).typed,{production_mode:"manual",production_source:"idea"});
  assert.deepEqual(splitIdeaProductionCapture(flags,marker,{creating:false}).typed,{});
  assert.throws(()=>newIdeaProductionCapture(flags,"idea",{requestedMode:"manual",humanChoice:false}));
  assert.throws(()=>newIdeaProductionCapture(flags,"script_a_short",{requestedMode:"manual",humanChoice:true}));
  assert.equal(newIdeaProductionCapture(flags,"idea").Studio_Production_Mode,"automatic");
});
test("actual Worker gate runs after authenticated authorization and before ordinary handlers",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const a=worker.indexOf("if (editorGuardEnabled(env) && !dedicatedRoute)");
  const dedicated=worker.indexOf("const allowed=await verifyDedicatedProductionAccess({");
  assert.ok(dedicated>0 && dedicated<a);
  assert.ok(worker.lastIndexOf("if (!authorization.authorized)",dedicated)>0);
  assert.match(worker.slice(dedicated,a),/if\(!allowed\)throw new HttpError\(403/);
  assert.ok(a>0);
  assert.ok(worker.lastIndexOf("if (!authorization.authorized)",a)>0);
  assert.ok(a<worker.indexOf("if (isIdeaProductionRequestRoute) {"));
  assert.ok(a<worker.indexOf("if (isProductionRequestPromoteRoute) {"));
  assert.match(worker.slice(a,a+2400),/verifyEditorHttpAccess/);
  const ideas=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  const create=ideas.slice(ideas.indexOf("export async function createIdea("),ideas.indexOf("/*__STUDIO_WORKER_END:createIdea__*/"));
  assert.match(create,/requestedMode:payload\?\.production_mode/);
  assert.match(create,/canConfigure:authorization\?\.permissions\?\.production_configure===true/);
  assert.match(create,/production_mode_verified: modeVerified/);
});
