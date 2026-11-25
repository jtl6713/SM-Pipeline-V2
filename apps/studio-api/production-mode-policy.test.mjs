import test from "node:test";
import assert from "node:assert/strict";
import { newProductionMode, productionRouting } from "./production-mode-policy.mjs";

test("new AI and user-entered ideas share the same automatic default", () => {
  for (const source of ["ai", "user"]) {
    assert.equal(newProductionMode({kind:"idea",source}),"automatic");
  }
  assert.equal(newProductionMode({kind:"idea",requestedMode:"manual"}),"manual");
  assert.throws(()=>newProductionMode({kind:"idea",requestedMode:"true"}));
  assert.throws(()=>newProductionMode({kind:"other"}));
});
test("dedicated workflows cannot opt in to manual", () => {
  for (const kind of ["scripted-short","finished-video"]) {
    assert.equal(newProductionMode({kind}),"automatic");
    assert.throws(()=>newProductionMode({kind,requestedMode:"manual"}));
    const result=productionRouting({kind,linkedRequest:true,requestMode:"automatic",ownershipVerified:true});
    assert.equal(result.showInProduction,false);
    assert.equal(result.eligibleForAutomaticProduction,true);
    assert.equal(productionRouting({kind,linkedRequest:true,requestMode:"manual",ideaMode:"manual",ownershipVerified:true}).showInProduction,false);
  }
});
test("only an explicitly manual, ownership-verified idea can enter Production", () => {
  for (const mode of ["automatic","manual"]) {
    const r=productionRouting({kind:"idea",ideaMode:mode,requestMode:mode,linkedRequest:true,ownershipVerified:true});
    assert.equal(r.showInProduction,mode==="manual");
    assert.equal(r.eligibleForManualProductionReview,mode==="manual");
    assert.equal(r.eligibleForAutomaticProduction,mode==="automatic");
    assert.equal(r.operationallyVisible,true);
    assert.equal(r.factoryApprovalRequired,true);
    assert.equal(r.schedulingAuthorized,false);
    assert.equal(r.publishingAuthorized,false);
  }
});
test("legacy null, missing ownership, stale or conflicting canonical modes cannot grant authority", () => {
  for (const overrides of [
    {ideaMode:null,requestMode:null},
    {requestMode:null},
    {requestMode:"automatic"},
    {ownershipVerified:false},
    {kind:"unknown"},
  ]) {
    const r=productionRouting({kind:"idea",ideaMode:"manual",requestMode:"manual",linkedRequest:true,ownershipVerified:true,...overrides});
    assert.equal(r.showInProduction,false);
    assert.equal(r.eligibleForAutomaticProduction,false);
    assert.equal(r.operationallyVisible,true);
  }
});
test("retry and lifecycle state never turn automatic into manual or grant publication", () => {
  for (const state of ["queued","running","retry_wait","blocked","completed","revision"]) {
    const r=productionRouting({kind:"idea",ideaMode:"automatic",requestMode:"automatic",linkedRequest:true,ownershipVerified:true,state});
    assert.equal(r.showInProduction,false);
    assert.equal(r.factoryApprovalRequired,true);
    assert.equal(r.publishingAuthorized,false);
  }
});
