import test from "node:test";
import assert from "node:assert/strict";
import {buildCreativeAlignmentContext,assessCreativeAlignmentShadow} from "./creative-alignment-shadow.mjs";

const base={profile:{id:"chicago-profile",scope:"Chicago city, neighborhoods and architecture",city:"Chicago"},
  title:"Nighttime in Chicago",caption:"Experience the city after dark.",platform:"Instagram",format:"Reel"};
const fountain={id:"fountain",use:"primary",
  classification:{city:"Chicago",subject:"Buckingham Fountain",time_of_day:"night"},
  visual_evidence:{description:"Illuminated fountain and Chicago skyline"}};
const skyline={id:"skyline",use:"b-roll",classification:{city:"Chicago",subject:"Skyline",time_of_day:"night"}};
const support=(asset_id,verdict="supports")=>({asset_id,verdict,evidence:[
  {source:"classification",reason:"Chicago landmark at night supports the broad city theme"}]});
const contradiction=(asset_id)=>({asset_id,verdict:"material_contradiction",material_to_story:true,
  required_relationship:"Primary footage must show Zoo Miami, within the Miami profile",
  reason:"Independently classified and visually identified Chicago landmark is unrelated to the required zoo",
  evidence:[{source:"classification",reason:"Chicago location"},
    {source:"visual",reason:"Buckingham Fountain recognized"}]});

function assertShadow(result,disposition) {
  assert.equal(result.proposed_disposition,disposition);
  assert.equal(result.mode,"shadow");
  assert.equal(result.creative_enforcement_enabled,false);
  assert.equal(result.repair_authorized,false);
  assert.equal(result.creates_publishing_hold,false);
  assert.equal(result.requires_manual_production,false);
  for (const key of ["approval_actions","schedule_actions","publish_actions"]) assert.equal(result[key],0);
}

test("Nighttime in Chicago accepts Buckingham Fountain without literal title overlap",()=>{
  const context=buildCreativeAlignmentContext({...base,assets:[fountain,skyline]});
  assert.equal(context.profile.id,"chicago-profile");
  assert.equal(context.title,base.title);
  assert.equal(context.caption,base.caption);
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[support("fountain"),support("skyline","plausible_b_roll")]}),"pass");
});
test("wrong city and specific landmark contradiction proposes targeted repair only",()=>{
  const context=buildCreativeAlignmentContext({...base,
    profile:{id:"miami-profile",scope:"Miami",city:"Miami"},title:"A day at Zoo Miami",
    caption:"Discover Zoo Miami's wildlife.",assets:[fountain]});
  const result=assessCreativeAlignmentShadow(context,{findings:[contradiction("fountain")]});
  assertShadow(result,"repair");
  assert.deepEqual(result.findings.map(f=>f.asset_id),["fountain"]);
});
test("specific scene contradiction may use exact approved scene and actual visual evidence",()=>{
  const context=buildCreativeAlignmentContext({...base,storyboard:{scenes:[{id:"s1",visual:"Show the Wrigley clock"}]},
    assets:[{...fountain,scene_ids:["s1"]}]});
  const finding={...contradiction("fountain"),required_relationship:"Scene s1 specifically requires Wrigley clock",
    evidence:[{source:"approved_scene",reason:"Approved scene calls for clock"},{source:"visual",reason:"Actual footage shows fountain"}]};
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[finding]}),"repair");
});
test("unverified, missing or repeated evidence is a nonblocking advisory",()=>{
  const context=buildCreativeAlignmentContext({...base,assets:[{...fountain,visual_evidence:null}]});
  const finding=contradiction("fountain");
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[finding]}),"warn_pass_through");
  const repeated={...finding,evidence:[finding.evidence[0],finding.evidence[0]]};
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[repeated]}),"warn_pass_through");
  const unknown=buildCreativeAlignmentContext({...base,assets:[{id:"unknown"}]});
  assertShadow(assessCreativeAlignmentShadow(unknown,{findings:[{asset_id:"unknown",verdict:"uncertain"}]}),"warn_pass_through");
});
test("mixed assets warn only when one lacks sufficient assessment; valid B-roll passes",()=>{
  const context=buildCreativeAlignmentContext({...base,assets:[fountain,skyline]});
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[support("fountain")]}),"warn_pass_through");
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[support("fountain"),support("skyline","plausible_b_roll")]}),"pass");
});
test("fabricated or duplicate reviewer asset IDs never yield repair authority",()=>{
  const context=buildCreativeAlignmentContext({...base,assets:[fountain]});
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[contradiction("unknown")]}),"warn_pass_through");
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[support("fountain"),contradiction("fountain")]}),"warn_pass_through");
});
test("technical or rights failures remain exceptions independent of creative relevance",()=>{
  const context=buildCreativeAlignmentContext({...base,assets:[fountain],technicalFailures:["source rights not verified"]});
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[support("fountain")]}),"exception");
});
test("unknown profile and incomplete context cannot produce a creative block",()=>{
  const context=buildCreativeAlignmentContext({...base,profile:{},assets:[fountain]});
  assertShadow(assessCreativeAlignmentShadow(context,{findings:[contradiction("fountain")]}),"warn_pass_through");
});
test("actual selected asset identity must be exact and review budget cannot silently truncate",()=>{
  assert.throws(()=>buildCreativeAlignmentContext({...base,assets:[fountain,fountain]}),/identities/);
  assert.throws(()=>buildCreativeAlignmentContext({...base,assets:[]}),/inventory/);
  assert.throws(()=>buildCreativeAlignmentContext({...base,assets:Array.from({length:101},(_,i)=>({id:String(i)}))}),/budget/);
});
