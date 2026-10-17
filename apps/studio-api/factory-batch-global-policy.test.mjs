import test from "node:test";
import assert from "node:assert/strict";
import {factoryGlobalPolicy,factoryGlobalAcceptsOutput,FACTORY_GLOBAL_MODE,FACTORY_GLOBAL_STAGES} from "./factory-batch-global-policy.mjs";
import {FACTORY_BATCH_PRODUCTION_BASE_ID,FACTORY_BATCH_STAGING_BASE_ID} from "./factory-batch-rollout.mjs";
const config=(base,stage="pilot")=>({AIRTABLE_BASE_ID:base,
  FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:"true",
  FACTORY_BATCH_GLOBAL_MODE:FACTORY_GLOBAL_MODE,
  FACTORY_BATCH_GLOBAL_MAX_TOTAL:String(FACTORY_GLOBAL_STAGES[stage].max_total),
  FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:String(FACTORY_GLOBAL_STAGES[stage].max_per_profile)});
test("production pilot is bounded 4 total, 2 per profile and requires explicit signoff",()=>{
  const valid={...config(FACTORY_BATCH_PRODUCTION_BASE_ID),
    FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:"explicit-review"};
  const policy=factoryGlobalPolicy(valid);
  assert.equal(policy.enabled,true);
  assert.equal(policy.stage,"pilot");
  assert.equal(policy.max_total,4);
  assert.equal(policy.max_per_profile,2);
  for(const change of [
    {AIRTABLE_BASE_ID:"appInvalid"},
    {FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:"false"},
    {FACTORY_BATCH_GLOBAL_MODE:"unreviewed"},
    {FACTORY_BATCH_GLOBAL_MAX_TOTAL:"20"},
    {FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"10"},
    {FACTORY_BATCH_GLOBAL_MAX_TOTAL:"5"},
    {FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"3"},
    {FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:""},
    {FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:"disabled"},
  ]) assert.equal(factoryGlobalPolicy({...valid,...change}).enabled,false);
  assert.equal(factoryGlobalPolicy({}).enabled,false);
  assert.equal(factoryGlobalPolicy(config(FACTORY_BATCH_STAGING_BASE_ID)).enabled,true);
});
test("wider release activates only with exact 20 / 10 signed pair",()=>{
  const full={...config(FACTORY_BATCH_PRODUCTION_BASE_ID,"expanded"),
    FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:"explicit-review"};
  assert.deepEqual(Object.fromEntries(["enabled","stage","max_total","max_per_profile"].map(k=>[k,factoryGlobalPolicy(full)[k]])),
    {enabled:true,stage:"expanded",max_total:20,max_per_profile:10});
  for(const drift of [
    {FACTORY_BATCH_GLOBAL_MAX_TOTAL:"4"},
    {FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"2"},
    {FACTORY_BATCH_GLOBAL_MAX_TOTAL:"21"},
    {FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"11"},
    {FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:"disabled"},
  ]) assert.equal(factoryGlobalPolicy({...full,...drift}).enabled,false);
});
test("global approvals accept only Instagram Reels and Stories in both stages",()=>{
  for(const stage of ["pilot","expanded"]){
    const policy=factoryGlobalPolicy(config(FACTORY_BATCH_STAGING_BASE_ID,stage));
    for(const kind of ["Reel","Story"]) assert.equal(factoryGlobalAcceptsOutput(
      policy,{fields:{Platform:"Instagram",Studio_Output_Type:kind}}),true);
    for(const [platform,kind] of [["TikTok","Reel"],["Instagram","Carousel"],["YouTube","Short"]])
      assert.equal(factoryGlobalAcceptsOutput(policy,{fields:{Platform:platform,Studio_Output_Type:kind}}),false);
  }
  assert.equal(factoryGlobalAcceptsOutput(factoryGlobalPolicy({}),{fields:{Platform:"Instagram",Studio_Output_Type:"Reel"}}),false);
});
