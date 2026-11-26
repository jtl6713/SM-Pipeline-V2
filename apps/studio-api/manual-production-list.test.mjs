import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manualProductionListQuery, manualProductionRowVerified,
  assertManualListSchemaReady,productionModeRoutingEnabled } from "./manual-production-list.mjs";
import { listSupabaseManualProductionRequests } from "./supabase-pipeline-reads.mjs";
import { isExplicitManualIdea,projectIdeaProductionMode } from "./production-mode-capture.mjs";

const profileUuid="11111111-1111-1111-1111-111111111111";
const organizationUuid="22222222-2222-2222-2222-222222222222";
const brandUuid="33333333-3333-3333-3333-333333333333";
const ideaUuid="44444444-4444-4444-4444-444444444444";
const profileId="recProfile0000001",organizationId="recOrg00000000001",brandId="recBrand000000001";
const ideaId="recIdea0000000001",requestId="recRequest0000001";
const scope={profileUuid,organizationUuid,brandUuids:[brandUuid]};
const enabled={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",
 SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-key"};
const valid={
  airtable_record_id:requestId,organization_id:organizationUuid,brand_id:brandUuid,
  idea_candidate_id:ideaUuid,request_status:"Ready",publish_status:{Active:true},
  idea_candidates:{id:ideaUuid,airtable_record_id:ideaId,content_profile_id:profileUuid,
    production_source:"idea",production_mode:"manual",candidate_title:"Manual review"},
};
test("manual list flag remains off by default and cannot activate without capture",()=>{
  assert.equal(productionModeRoutingEnabled({}),false);
  assert.throws(()=>assertManualListSchemaReady({STUDIO_PRODUCTION_MODE_ROUTING:"true"}),/not ready/);
  assert.doesNotThrow(()=>assertManualListSchemaReady(enabled));
});
test("manual and exact tenant/profile/brand filters are applied at the database before LIMIT",()=>{
  const query=manualProductionListQuery({scope,requestSelect:"id,idea_candidates(airtable_record_id)",limit:20});
  const p=new URLSearchParams(query.split("?")[1]);
  assert.equal(p.get("idea_candidates.production_mode"),"eq.manual");
  assert.equal(p.get("idea_candidates.production_source"),"eq.idea");
  assert.equal(p.get("idea_candidates.content_profile_id"),"eq."+profileUuid);
  assert.equal(p.get("organization_id"),"eq."+organizationUuid);
  assert.equal(p.get("brand_id"),"in.("+brandUuid+")");
  assert.match(p.get("select"),/idea_candidates!inner\(/);
  assert.match(p.get("and"),/request_status.in.\(Draft,Ready,Submitted\)/);
  assert.match(p.get("and"),/production_notes.not.ilike.\*ez-input=finished-video\*/);
  assert.match(p.get("and"),/production_notes.not.ilike.\*ez-input=vibe-cut\*/);
  assert.equal(p.get("limit"),"20");
  assert.throws(()=>manualProductionListQuery({scope:{...scope,profileUuid:null},requestSelect:"id,idea_candidates(airtable_record_id)"}),/scope/);
});
test("exact receipt independently verifies canonical manual authority",()=>{
  assert.equal(manualProductionRowVerified(valid,scope),true);
  for(const patch of [
    {idea_candidate_id:brandUuid},{organization_id:brandUuid},{brand_id:ideaUuid},
    {idea_candidates:null},{idea_candidates:{...valid.idea_candidates,production_mode:"automatic"}},
    {idea_candidates:{...valid.idea_candidates,production_mode:null}},
    {idea_candidates:{...valid.idea_candidates,production_source:"script_a_short"}},
    {idea_candidates:{...valid.idea_candidates,production_source:"vibe_cut"}},
    {origin:"vibe_cut"},{origin:"vibe-cut"},{production_notes:"origin=ez-wizard; ez-input=vibe-cut"},
    {idea_candidates:{...valid.idea_candidates,content_profile_id:brandUuid}},
    {origin:"az-finished-video"},{production_notes:"origin=az-finished-video"},
    {production_notes:"origin=ez-wizard; ez-input=finished-video"},
    {production_notes:"[story-first-production.1] {}"},
    {production_notes:"scripted-short=proposal"},
    {publish_status:{Active:false}},{publish_status:{Test_Run_ID:"test"}},
    {request_status:"Cancelled"},{request_status:"Promoted"},
  ]) assert.equal(manualProductionRowVerified({...valid,...patch},scope),false,JSON.stringify(patch));
  assert.equal(manualProductionRowVerified({...valid,request_status:"Promoted",production_notes:"[factory-revision-open] at=2026-11-25"},scope),true);
});
test("scoped manual list refuses bad data and overwrites misleading compatibility links",async()=>{
  const previous=globalThis.fetch;
  const requests=[];
  try {
    globalThis.fetch=async(url,init)=>{
      const u=new URL(url);requests.push(u);
      assert.equal(init.method,"GET");
      if(u.pathname.endsWith("/content_profiles"))return Response.json([{id:profileUuid,airtable_record_id:profileId}]);
      if(u.pathname.endsWith("/organizations"))return Response.json([{id:organizationUuid,airtable_record_id:organizationId}]);
      if(u.pathname.endsWith("/brands"))return Response.json([{id:brandUuid,airtable_record_id:brandId}]);
      assert.ok(u.pathname.endsWith("/production_requests"));
      assert.equal(u.searchParams.get("idea_candidates.production_mode"),"eq.manual");
      return Response.json([{...valid,publish_status:{Active:true,Idea_Candidate:["recWrong"],idea_candidate_airtable_id:"recWrong",Organization:["recWrong"]}},
        {...valid,airtable_record_id:"recRequest0000002",idea_candidates:{...valid.idea_candidates,production_mode:"automatic"}}]);
    };
    const rows=await listSupabaseManualProductionRequests(enabled,{profileId,organizationId,brandIds:[brandId],limit:10});
    assert.equal(rows.length,1);
    assert.equal(rows[0].ideaTitle,"Manual review");
    assert.deepEqual(rows[0].record.fields.Idea_Candidate,[ideaId]);
    assert.deepEqual(rows[0].record.fields.Organization,[organizationId]);
    assert.deepEqual(rows[0].record.fields.Content_Profile,[profileId]);
    assert.equal(rows[0].record.fields.Studio_Production_Mode,"manual");
    assert.equal(requests.filter(u=>u.pathname.endsWith("/production_requests")).length,1);
  } finally {globalThis.fetch=previous;}
});
test("manual list is isolated from existing operational list and old response cache",()=>{
  const code=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const from=code.indexOf("export async function listProductionRequests(");
  const to=code.indexOf("/*__STUDIO_WORKER_END:listProductionRequests__*/",from);
  const route=code.slice(from,to);
  assert.ok(route.indexOf("if (productionModeRoutingEnabled(env))")<route.indexOf("studioReadCoalesce("));
  assert.match(route,/listSupabaseManualProductionRequests/);
  assert.match(route,/membershipAllowsBrand\(authorization, \[id\]\)/);
  assert.match(route,/production_mode_scope: "manual"/);
  assert.match(route,/photo_watch_waiting_count: 0/);
  const old=code.slice(code.indexOf("export async function listOpenProductionRequests("),code.indexOf("/*__STUDIO_WORKER_END:listOpenProductionRequests__*/"));
  assert.doesNotMatch(old,/productionModeRoutingEnabled|listSupabaseManualProductionRequests/);
});

test("manual opt-in is a veto, not new authority for any other Idea",()=>{
  for(const [mode,source,wanted] of [["manual","idea",true],["automatic","idea",false],
    [null,null,false],["manual","script_a_short",false],["manual","finished_video",false]]) {
    assert.equal(isExplicitManualIdea({fields:projectIdeaProductionMode({production_mode:mode,production_source:source})}),wanted);
  }
});
test("manual Idea admission veto covers discovery, stale claims, direct paths and autonomous handoff",()=>{
  const auto=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const photo=readFileSync(new URL("./worker-functions-03.mjs",import.meta.url),"utf8");
  const direct=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const supabase=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  const section=(s,begin,end)=>s.slice(s.indexOf(begin),s.indexOf(end,s.indexOf(begin)));
  const eligibility=section(auto,"function readyProductionIdeaEligible(","async function discoverReadyProductionIdeas(");
  assert.match(eligibility,/!idea\?\.id \|\| isExplicitManualIdea\(idea\)/);
  const claim=section(auto,"async function processReadyProductionClaim(","async function studioReadyProductionCronResume(");
  assert.ok(claim.indexOf("monitorReadyProductionRequest(")<claim.indexOf("isExplicitManualIdea(idea)"));
  assert.ok(claim.indexOf("isExplicitManualIdea(idea)")<claim.indexOf("createDraftForIdea("));
  assert.match(claim,/stage: "manual_production"/);
  const finish=section(auto,"export async function finishAutonomousProductionRequest(","/*__STUDIO_WORKER_END:finishAutonomousProductionRequest__*/");
  assert.ok(finish.indexOf("await verifyAutomaticMode(requestRecord)")<finish.indexOf("ensureAutonomousSelectedMusic("));
  assert.ok(finish.indexOf("await verifyAutomaticMode(current)")<finish.indexOf("promoteProductionRequestViaI3I4("));
  assert.match(finish,/isExplicitManualIdea\(canonical\)/);
  const prepare=section(auto,"export async function prepareIdeaToReview(","/*__STUDIO_WORKER_END:prepareIdeaToReview__*/");
  assert.ok(prepare.indexOf("isExplicitManualIdea(idea)")<prepare.indexOf('method: "PATCH"'));
  const promote=section(direct,"export async function promoteIdeaViaI3I4(","/*__STUDIO_WORKER_END:promoteIdeaViaI3I4__*/");
  assert.ok(promote.indexOf("approveIdeaAndWaitForPhotos(")<promote.indexOf("isExplicitManualIdea(record)"));
  assert.ok(promote.indexOf("isExplicitManualIdea(record)")<promote.indexOf("fetchPromotionHandoff("));
  assert.match(photo,/if \(env\.STUDIO_MEDIA && !isExplicitManualIdea\(updated\)\)/);
  assert.match(photo,/const autonomousAdmitted = !isExplicitManualIdea\(ideaReady\) && !exploreIdeaNeedsApproval/);
  assert.match(supabase,/or=\(production_mode\.is\.null,production_mode\.neq\.manual\)/);
});
