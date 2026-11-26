import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dedicatedProductionRoute, dedicatedProductionRoutesEnabled, verifyDedicatedProductionAccess } from "./dedicated-production-routes.mjs";
import { manualEditorAuthority } from "./production-editor-boundary.mjs";
const id="recRequest0000001",ideaId="recIdea0000000001",profileId="recProfile0000001",orgId="recOrg00000000001",brandId="recBrand000000001";
const scope={organizationId:orgId,profiles:[{id:profileId,brandIds:[brandId]}]};
const profile={id:"11111111-1111-1111-1111-111111111111",airtable_record_id:profileId};
const owner={id:"22222222-2222-2222-2222-222222222222",airtable_record_id:ideaId,content_profile_id:profile.id,content_profiles:profile,production_source:"finished_video",production_mode:"automatic"};
const row={id:"33333333-3333-3333-3333-333333333333",airtable_record_id:id,idea_candidate_id:owner.id,idea_candidates:owner,
 organization_id:"44444444-4444-4444-4444-444444444444",organizations:{id:"44444444-4444-4444-4444-444444444444",airtable_record_id:orgId},
 brand_id:"55555555-5555-5555-5555-555555555555",brands:{id:"55555555-5555-5555-5555-555555555555",airtable_record_id:brandId},
 request_status:"Draft",production_notes:"origin=az-finished-video; ez-input=finished-video; az-publish-mode=approval",publish_status:{}};
const path="/api/finished-video/production-requests/"+id;
test("Finished Video transport is independently disabled until capture and dedicated routing are enabled",()=>{
  assert.equal(dedicatedProductionRoutesEnabled({}),false);
  assert.equal(dedicatedProductionRoutesEnabled({STUDIO_DEDICATED_PRODUCTION_ROUTES:"true"}),false);
  assert.equal(dedicatedProductionRoutesEnabled({STUDIO_DEDICATED_PRODUCTION_ROUTES:"true",STUDIO_PRODUCTION_MODE_CAPTURE:"true"}),true);
});
test("only dedicated intake and progress operations normalize to existing handlers",()=>{
  for(const [suffix,method] of [["","GET"],["","PATCH"],["/item4","GET"],["/assets","POST"],["/outputs","GET"],["/assets/upload-session","POST"],["/assets/upload-session/source/parts/1","PUT"],["/assets/upload-session/source/complete","POST"],["/assets/upload-session/source","DELETE"]]) {
    const route=dedicatedProductionRoute(path+suffix,method);
    assert.equal(route.allowed,true,suffix);
    assert.equal(route.path,"/api/production-requests/"+id+suffix);
  }
  for(const [suffix,method] of [["/promote","POST"],["/producer-conversation","POST"],["/assets/library","POST"],["/generate-ai-masters","POST"],["/timed-script","POST"]])
    assert.equal(dedicatedProductionRoute(path+suffix,method).allowed,false,suffix);
  assert.equal(dedicatedProductionRoute("/api/finished-video/production-requests/recShort","GET").allowed,false);
  assert.equal(dedicatedProductionRoute("/api/production-requests/"+id,"GET"),null);
});
test("canonical finished source and exact owner are necessary; ordinary editor never admits finished",async()=>{
  const route=dedicatedProductionRoute(path,"GET");
  const verify=(r,s=scope)=>verifyDedicatedProductionAccess({route,scope:s,read:async()=>[r]});
  assert.equal(await verify(row),true);
  assert.equal(manualEditorAuthority(row,{...scope,requestId:id}),false);
  for(const patch of [{idea_candidates:{...owner,production_source:"idea"}},{idea_candidates:{...owner,production_mode:"manual"}},
    {production_notes:"origin=prepare-to-review"},{idea_candidate_id:profile.id},
    {publish_status:{Idea_Candidate:["recOther000000001"]}},{organizations:{...row.organizations,airtable_record_id:"recOther000000001"}}])
    assert.equal(await verify({...row,...patch}),false);
  assert.equal(await verify(row,{...scope,profiles:[]}),false);
});
test("dedicated creation validates canonical new Idea and AZ origin before calling generic create",async()=>{
  const route=dedicatedProductionRoute("/api/finished-video/production-requests","POST");
  const body={idea_record_id:ideaId,production_notes:row.production_notes};
  const loadIdea=async()=>({id:ideaId,fields:{Studio_Production_Mode:"automatic",Studio_Production_Source:"finished_video",Content_Profile:[profileId]}});
  const verify=(b,r=owner)=>verifyDedicatedProductionAccess({route,body:b,scope,read:async()=>[r],loadIdea});
  assert.equal(await verify(body),true);
  assert.equal(await verify({...body,production_notes:"origin=autonomous"}),false);
  assert.equal(await verify(body,{...owner,production_source:"idea"}),false);
  assert.equal(await verify(body,{...owner,production_mode:null}),false);
});
test("aliases require their own authority before shared route handlers and preserve all existing AZ mode decisions",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const source=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  assert.match(worker,/if \(dedicatedRoute\) \{[\s\S]*?verifyDedicatedProductionAccess\(/);
  assert.match(worker,/editorGuardEnabled\(env\) && !dedicatedRoute/);
  assert.ok(worker.indexOf("await verifyDedicatedProductionAccess(")<worker.indexOf("if (isProductionRequestCollectionRoute) {"));
  assert.match(source,/newIdeaProductionCapture\(env, "finished_video"\)/);
  assert.match(source,/finishedVideo && env\?\.STUDIO_DEDICATED_PRODUCTION_ROUTES/);
});
