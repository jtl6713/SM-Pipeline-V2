import test from "node:test";
import assert from "node:assert/strict";
import {
  initialProductionMode, productionRouting, canEnterAutomaticProduction,
  validateProductionModeChange,
} from "./production-mode-policy.mjs";

test("new human and AI Ideas both default to Automatic Production", () => {
  for (const humanChoice of [false,true]) {
    assert.equal(initialProductionMode({source:"idea",humanChoice}),"automatic");
  }
  assert.equal(initialProductionMode({source:"idea",requestedMode:"manual",humanChoice:true}),"manual");
  assert.throws(()=>initialProductionMode({source:"idea",requestedMode:"manual"}),/human Idea/);
});

test("dedicated workflows cannot opt in to Manual Production", () => {
  for (const source of ["script_a_short","finished_video"]) {
    assert.equal(initialProductionMode({source}),"automatic");
    assert.throws(()=>initialProductionMode({source,requestedMode:"manual",humanChoice:true}),/human Idea/);
    const route=productionRouting({source,persistedMode:"manual"});
    assert.equal(route.mode,"automatic");
    assert.equal(route.ordinary_production_visible,false);
    assert.equal(route.ordinary_production_mutation_allowed_by_mode,false);
    assert.equal(route.operational_monitoring_visible,true);
  }
});

test("only an explicit canonical Manual Idea may enter ordinary Production", () => {
  for (const source of ["idea","script_a_short","finished_video","unknown",undefined]) {
    for (const persistedMode of ["manual","automatic",null,"invalid"]) {
      const result=productionRouting({source,persistedMode});
      const visible=source==="idea"&&persistedMode==="manual";
      assert.equal(result.ordinary_production_visible,visible);
      assert.equal(result.ordinary_production_mutation_allowed_by_mode,visible);
      assert.equal(result.operational_monitoring_visible,true);
      assert.equal(result.grants_scheduling_or_publishing_authority,false);
    }
  }
});

test("legacy unknown ordinary Ideas cannot be silently auto-promoted", () => {
  for (const persistedMode of [undefined,null,"invalid",""]) {
    const result=productionRouting({source:"idea",persistedMode});
    assert.equal(result.needs_legacy_reconciliation,true);
    assert.equal(result.automatic_candidate,false);
    assert.equal(result.mode,null);
  }
});

test("automatic mode does not bypass existing acceptance or admission gates", () => {
  const ready={source:"idea",persistedMode:"automatic",existingEligibilityPassed:true,
    authorizedOwnerVerified:true,leaseAdmissionGranted:true};
  assert.equal(canEnterAutomaticProduction(ready),true);
  for (const key of ["existingEligibilityPassed","authorizedOwnerVerified","leaseAdmissionGranted"]) {
    assert.equal(canEnterAutomaticProduction({...ready,[key]:false}),false,key);
  }
  assert.equal(canEnterAutomaticProduction({...ready,persistedMode:"manual"}),false);
  assert.equal(canEnterAutomaticProduction({...ready,persistedMode:null}),false);
});

test("Finished Video retains existing approval/scheduling modes, not a new grant", () => {
  assert.equal(productionRouting({source:"finished_video"}).approval_policy,
    "preserve_existing_finished_video_mode");
  for (const source of ["idea","script_a_short"]) {
    assert.equal(productionRouting({source,persistedMode:"automatic"}).approval_policy,"human_factory");
  }
});

test("mode transitions require human intent, owner authorization, safe lease and editable state", () => {
  const allowed={source:"idea",persistedMode:"automatic",requestedMode:"manual",humanChoice:true,
    authorizedOwnerVerified:true,safeLeaseBoundary:true,editableIdea:true};
  assert.deepEqual(validateProductionModeChange(allowed),
    {previous_mode:"automatic",next_mode:"manual",requires_audit_and_compare_and_set:true});
  for (const key of ["humanChoice","authorizedOwnerVerified","safeLeaseBoundary","editableIdea"]) {
    assert.throws(()=>validateProductionModeChange({...allowed,[key]:false}),Error,key);
  }
  for (const source of ["finished_video","script_a_short"]) {
    assert.throws(()=>validateProductionModeChange({...allowed,source}),/authorized human Idea/);
  }
  assert.throws(()=>validateProductionModeChange({...allowed,requestedMode:"bad"}),/Invalid Production mode/);
});
