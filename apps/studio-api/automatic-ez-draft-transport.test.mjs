import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automaticEzIdeaFields, verifiedAutomaticEzDraftReceipt, automaticEzExistingDraftId } from "./automatic-ez-intake.mjs";
import { dedicatedProductionRoute, dedicatedRouteEnabled, verifyDedicatedProductionAccess } from "./dedicated-production-routes.mjs";
const env={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",STUDIO_PRODUCTION_EDITOR_GUARD:"true",STUDIO_AUTOMATIC_EZ_INTAKE:"true"};
const auth={permissions:{ideas_create:true,production_configure:true}};
const profile="recProfile0000001",id="recIdea0000000001",requestId="recRequest0000001";
const fields=automaticEzIdeaFields(env,auth,{automatic_ez_intake:true,production_mode:"automatic",input_kind:"single-photo",content_profile_id:profile},{source:"idea",mode:"automatic",profileId:profile});
const idea={id,fields:{...fields,Content_Profile:[profile],Studio_Production_Mode:"automatic",Studio_Production_Source:"idea",Candidate_Status:"Generated"}};
const body={idea_record_id:id,content_profile_id:profile,production_notes:"origin=ez-wizard; ez-input=single-photo"};
const receipt={id:requestId,fields:{Request_Status:"Draft",Active:true,Idea_Candidate:[id],Production_Notes:body.production_notes}};
test("dedicated draft alias is POST only, independently gated, and does not expose ordinary editor operations",async()=>{
  const route=dedicatedProductionRoute("/api/automatic-ez/production-requests","POST");
  assert.equal(route.allowed,true);
  assert.equal(dedicatedRouteEnabled(env,route),true);
  assert.equal(dedicatedRouteEnabled({...env,STUDIO_AUTOMATIC_EZ_INTAKE:"false"},route),false);
  assert.equal(dedicatedProductionRoute("/api/automatic-ez/production-requests","GET").allowed,false);
  for(const suffix of ["promote","outputs","plan","variants","assets/upload-session"])
    assert.equal(dedicatedProductionRoute("/api/automatic-ez/production-requests/"+requestId+"/"+suffix,"POST").allowed,false);
  const canonical={airtable_record_id:id,production_source:"idea",production_mode:"automatic",content_profile_id:"p",content_profiles:{id:"p",airtable_record_id:profile}};
  const verify=(b=body,row=idea,c=canonical)=>verifyDedicatedProductionAccess({route,body:b,scope:{profiles:[{id:profile,brandIds:["brand"]}]},read:async()=>[c],loadIdea:async()=>row});
  assert.equal(await verify(),true);
  for(const patch of [{production_notes:"origin=az-finished-video; ez-input=single-photo"},{production_notes:"origin=ez-wizard; ez-input=multiple-photos"},{production_notes:body.production_notes+"; az-publish-mode=immediate"},{publish_now:true},{content_profile_id:"recOther000000001"}])
    assert.equal(await verify({...body,...patch}),false);
  for(const patch of [{Studio_Production_Mode:"manual"},{Studio_Production_Source:"finished_video"},{Production_Config_Notes:""},{Candidate_Status:"Approved"},{Test_Run_ID:"test"},{Idea_Summary:"origin=ez-wizard"}])
    assert.equal(await verify(body,{...idea,fields:{...idea.fields,...patch}}),false);
  assert.equal(await verify(body,idea,{...canonical,production_mode:"manual"}),false);
});
test("read errors, ambiguous owners, and conflicting reciprocal links never create another draft",()=>{
  assert.equal(automaticEzExistingDraftId([],idea),null);
  assert.equal(automaticEzExistingDraftId([receipt],idea),requestId);
  for(const rows of [null,[receipt,receipt],[{id:"invalid"}]])
    assert.throws(()=>automaticEzExistingDraftId(rows,idea));
  assert.throws(()=>automaticEzExistingDraftId([], {...idea,fields:{...idea.fields,"Production Requests":[requestId]}}));
  assert.throws(()=>automaticEzExistingDraftId([receipt], {...idea,fields:{...idea.fields,"Production Requests":["recOther000000001"]}}));
});
test("replay only accepts an exact active unpromoted verified Draft",()=>{
  assert.equal(verifiedAutomaticEzDraftReceipt(receipt,idea,body),true);
  for(const patch of [{Request_Status:"Promoted"},{Active:false},{Idea_Candidate:[id,"recOther000000001"]},{Production_Notes:"origin=prepare-to-review; ez-input=single-photo"},{Studio_Publish_Batch_ID:"batch"},{Test_Run_ID:"test"}])
    assert.equal(verifiedAutomaticEzDraftReceipt({...receipt,fields:{...receipt.fields,...patch}},idea,body),false);
});
test("shared create rechecks authorized intake under Idea lock before canonical lookup and write",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const drafts=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  assert.match(worker,/withOutputApprovalLock\(env\.STUDIO_MEDIA,ideaId,[\s\S]*?automaticEzIntake:true/);
  const draft=drafts.slice(drafts.indexOf("export async function createProductionRequestFromBody("),drafts.indexOf("/*__STUDIO_WORKER_END:createProductionRequestFromBody__*/"));
  assert.ok(draft.indexOf("verifiedAutomaticEzDraftInput(")<draft.indexOf("createDraftForIdea("));
  assert.ok(draft.indexOf("automaticEzExistingDraftId(")<draft.indexOf("createDraftForIdea("));
  assert.match(draft,/verifiedAutomaticEzDraftReceipt\(existing,idea,payload\)/);
  assert.match(draft,/verifiedAutomaticEzDraftReceipt\(saved,idea,payload\)/);
});
