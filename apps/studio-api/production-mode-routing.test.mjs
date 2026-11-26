import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blocksAutonomousProduction, autoLaneModeFilter, manualProductionListEnabled,
  manualProductionListQuery, verifiedManualProductionRow } from "./production-mode-routing.mjs";
import { listSupabaseManualProductionRequests } from "./supabase-pipeline-reads.mjs";

const capture={STUDIO_PRODUCTION_MODE_CAPTURE:"true"};
const enabled={...capture,STUDIO_MANUAL_PRODUCTION_LIST:"true",
  SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"sb_secret_test"};
const profileUuid="e7f79313-8f90-4f69-8d46-539d70a118c2";
const ideaUuid="d110cc19-14e7-4a48-b114-0d724da5eacb";
const scope={profileUuid,profileRecordId:"rec00000000000001",orgRecordId:"rec00000000000002",
  brandRecordIds:["rec00000000000003"],limit:2};
const row={airtable_record_id:"rec00000000000004",idea_candidate_id:ideaUuid,
  request_status:"Draft",requested_title:"Nighttime in Chicago",production_notes:"",
  publish_status:{Idea_Candidate:["rec00000000000009"],idea_candidate_airtable_id:"rec00000000000009",Organization:["rec00000000000009"]},
  organizations:{airtable_record_id:scope.orgRecordId},brands:{airtable_record_id:scope.brandRecordIds[0]},
  idea_candidates:{id:ideaUuid,airtable_record_id:"rec00000000000005",content_profile_id:profileUuid,
    production_mode:"manual",production_source:"idea",candidate_title:"Nighttime in Chicago"}};

test("mode fence rejects explicit manual, does not newly authorize unknown legacy",()=>{
  assert.equal(blocksAutonomousProduction({fields:{Studio_Production_Mode:"manual",Studio_Production_Source:"idea"}}),true);
  for(const fields of [{},{Studio_Production_Mode:"automatic",Studio_Production_Source:"idea"},{Studio_Production_Mode:"automatic",Studio_Production_Source:"script_a_short"}]){
    assert.equal(blocksAutonomousProduction({fields}),false);
  }
  assert.equal(autoLaneModeFilter({},"ready_production"),"");
  assert.match(autoLaneModeFilter(capture,"ready_production"),/production_mode\.neq\.manual/);
  assert.match(autoLaneModeFilter(capture,"photo_ready"),/production_mode\.is\.null/);
  for(const lane of ["photo_waiting","photo_quality","autonomous_open","photo_unconfigured"]){
    assert.equal(autoLaneModeFilter(capture,lane),"");
  }
});
test("strict list feature is disabled until both flags explicitly enabled",()=>{
  assert.equal(manualProductionListEnabled({}),false);
  assert.equal(manualProductionListEnabled(capture),false);
  assert.equal(manualProductionListEnabled({STUDIO_MANUAL_PRODUCTION_LIST:"true"}),false);
  assert.equal(manualProductionListEnabled(enabled),true);
});
test("list uses canonical inner joins and all scope filters before bounded limit",()=>{
  const q=new URL("https://example.supabase.co/rest/v1/"+manualProductionListQuery(scope));
  assert.match(q.searchParams.get("select"),/idea_candidates!inner\(id,/);
  assert.equal(q.searchParams.get("idea_candidates.production_mode"),"eq.manual");
  assert.equal(q.searchParams.get("idea_candidates.production_source"),"eq.idea");
  assert.equal(q.searchParams.get("idea_candidates.content_profile_id"),"eq."+profileUuid);
  assert.equal(q.searchParams.get("organizations.airtable_record_id"),"eq."+scope.orgRecordId);
  assert.equal(q.searchParams.get("brands.airtable_record_id"),"in.("+scope.brandRecordIds[0]+")");
  assert.equal(q.searchParams.get("limit"),"2");
  assert.match(q.searchParams.get("and"),/az-finished-video/);
  assert.match(q.searchParams.get("or"),/factory-revision-open/);
  assert.throws(()=>manualProductionListQuery({...scope,brandRecordIds:[]}),/scope/);
  assert.throws(()=>manualProductionListQuery({...scope,profileUuid:"invalid"}),/scope/);
});
test("readback denies automatic, dedicated, legacy, mismatched owner and unrelated profiles",()=>{
  assert.equal(verifiedManualProductionRow(row,scope),true);
  for(const ideaPatch of [{production_mode:"automatic"},{production_mode:null},{production_source:"script_a_short"},
    {production_source:"finished_video"},{content_profile_id:ideaUuid},{id:profileUuid}]){
    assert.equal(verifiedManualProductionRow({...row,idea_candidates:{...row.idea_candidates,...ideaPatch}},scope),false);
  }
  for(const notes of ["origin=az-finished-video; ez-input=video","scripted-short=proposal","origin=ez-wizard; ez-input=vibe-cut","[story-first-production.1] {}"]){
    assert.equal(verifiedManualProductionRow({...row,production_notes:notes},scope),false);
  }
  assert.equal(verifiedManualProductionRow({...row,organizations:{airtable_record_id:row.airtable_record_id}},scope),false);
  assert.equal(verifiedManualProductionRow({...row,request_status:"Promoted"},scope),false);
  assert.equal(verifiedManualProductionRow({...row,request_status:"Promoted",production_notes:"[factory-revision-open]"},scope),true);
});
test("canonical collection excludes a stale unfiltered response and replaces conflicting bag links",async()=>{
  const original=globalThis.fetch;
  const queries=[];
  try{
    globalThis.fetch=async (url)=>{
      const u=new URL(url);queries.push(u);
      const rows=u.pathname.endsWith("/content_profiles")?[{id:profileUuid,airtable_record_id:scope.profileRecordId}]:
        [row,{...row,airtable_record_id:"rec00000000000008",idea_candidates:{...row.idea_candidates,production_mode:"automatic"}}];
      return new Response(JSON.stringify(rows),{status:200,headers:{"content-type":"application/json"}});
    };
    const result=await listSupabaseManualProductionRequests(enabled,scope);
    assert.equal(result.length,1);
    assert.deepEqual(result[0].fields.Idea_Candidate,[row.idea_candidates.airtable_record_id]);
    assert.deepEqual(result[0].fields.Organization,[scope.orgRecordId]);
    assert.equal(result[0].fields.Studio_Production_Mode,"manual");
    assert.equal(queries[1].searchParams.get("idea_candidates.production_mode"),"eq.manual");
  }finally{globalThis.fetch=original;}
});
test("strict collection rejects canonical read failures instead of falling back",async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response("[]",{status:200,headers:{"content-type":"application/json"}});
    await assert.rejects(()=>listSupabaseManualProductionRequests(enabled,scope),/scope/);
  }finally{globalThis.fetch=original;}
});
test("mode check is wired before autonomous mutation and in ordinary list, not operations queries",()=>{
  const api04=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const api02=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const claim=api04.slice(api04.indexOf("async function processReadyProductionClaim("),api04.indexOf("async function studioReadyProductionCronResume("));
  assert.ok(claim.indexOf("blocksAutonomousProduction(idea)")>0);
  assert.ok(claim.indexOf("blocksAutonomousProduction(idea)")<claim.indexOf("createDraftForIdea("));
  assert.match(claim,/completed_reason:"manual_production"/);
  const finish=api04.slice(api04.indexOf("export async function finishAutonomousProductionRequest("));
  assert.ok(finish.indexOf("blocksAutonomousProduction(liveIdea)")<finish.indexOf("ensureAutonomousSelectedMusic("));
  const route=api02.slice(api02.indexOf("export async function listProductionRequests("),api02.indexOf("export async function getProductionRequest("));
  assert.match(route,/manualProductionListEnabled\(env\)/);
  assert.ok(route.indexOf("listSupabaseManualProductionRequests(")<route.indexOf("studioReadCoalesce("));
});
