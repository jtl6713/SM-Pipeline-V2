import test from "node:test";
import assert from "node:assert/strict";
import { exceptionRecoveryMutationsEnabled } from "./exception-recovery-rollout.mjs";
test("mutations are unavailable by default, even to administrators",()=>{
  for(const config of [undefined,null,{},{
    EXCEPTION_RECOVERY_ACTIONS_ENABLED:"false"
  },{EXCEPTION_RECOVERY_ACTIONS_ENABLED:true},
  {EXCEPTION_RECOVERY_ACTIONS_ENABLED:"TRUE"},
  {EXCEPTION_RECOVERY_ACTIONS_ENABLED:"1"}]){
    assert.equal(exceptionRecoveryMutationsEnabled(config),false);
  }
});
test("only explicit Worker environment opt-in can enable recovery actions",()=>{
  assert.equal(exceptionRecoveryMutationsEnabled({EXCEPTION_RECOVERY_ACTIONS_ENABLED:"true"}),true);
});
