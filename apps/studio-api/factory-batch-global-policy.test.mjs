import test from "node:test";
import assert from "node:assert/strict";
import {factoryGlobalPolicy,factoryGlobalAcceptsOutput,FACTORY_GLOBAL_MODE} from "./factory-batch-global-policy.mjs";
import {FACTORY_BATCH_PRODUCTION_BASE_ID,FACTORY_BATCH_STAGING_BASE_ID} from "./factory-batch-rollout.mjs";
const config=(base)=>({AIRTABLE_BASE_ID:base,
  FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:"true",
  FACTORY_BATCH_GLOBAL_MODE:FACTORY_GLOBAL_MODE,
  FACTORY_BATCH_GLOBAL_MAX_TOTAL:"20",
  FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"10"});
test("production stays fail-closed unless all independent global gates agree",()=>{
  const valid={...config(FACTORY_BATCH_PRODUCTION_BASE_ID),
    FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:"explicit-review"};
  assert.equal(factoryGlobalPolicy(valid).enabled,true);
  for(const change of [
    {AIRTABLE_BASE_ID:"appInvalid"},
    {FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:"false"},
    {FACTORY_BATCH_GLOBAL_MODE:"unreviewed"},
    {FACTORY_BATCH_GLOBAL_MAX_TOTAL:"21"},
    {FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:"11"},
    {FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:""},
  ]) assert.equal(factoryGlobalPolicy({...valid,...change}).enabled,false);
  assert.equal(factoryGlobalPolicy({}).enabled,false);
  assert.equal(factoryGlobalPolicy(config(FACTORY_BATCH_STAGING_BASE_ID)).enabled,true);
});
test("global formats are restricted to Instagram Reels and Stories",()=>{
  const policy=factoryGlobalPolicy(config(FACTORY_BATCH_STAGING_BASE_ID));
  for(const kind of ["Reel","Story"]) assert.equal(factoryGlobalAcceptsOutput(
    policy,{fields:{Platform:"Instagram",Studio_Output_Type:kind}}),true);
  for(const [platform,kind] of [["TikTok","Reel"],["Instagram","Carousel"],["YouTube","Short"]])
    assert.equal(factoryGlobalAcceptsOutput(policy,{fields:{Platform:platform,Studio_Output_Type:kind}}),false);
  assert.equal(factoryGlobalAcceptsOutput(factoryGlobalPolicy({}),{fields:{Platform:"Instagram",Studio_Output_Type:"Reel"}}),false);
});
