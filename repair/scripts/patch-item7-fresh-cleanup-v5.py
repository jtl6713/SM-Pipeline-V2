#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-fresh-cleanup-v5.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()
marker = "ITEM7_FRESH_INVOCATION_CLEANUP_V5"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

end_marker = "// ITEM7_EXACT_STAGE_TEST_MODE_V1_END"
if text.count(end_marker) != 1:
    raise SystemExit(f"expected one Item7 end marker; found {text.count(end_marker)}")

cleanup_fn = r'''
// ITEM7_FRESH_INVOCATION_CLEANUP_V5: cleanup is intentionally a separate request so
// a long stage pulse cannot consume the subrequest capacity needed to stop, restore,
// verify, and terminalize its own exact lease.
async function repairCleanupItem7ExactStage(env, lease, input) {
  const scenarioId = Number(input.scenario_id);
  const config = ITEM7_EXACT_STAGE_CONFIG[scenarioId];
  if (!config || lease.scenario_id !== scenarioId) throw new HttpError(403, `cleanup_item7_exact_stage is not authorized for scenario ${scenarioId}`);
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_platform_output_record_ids) ? lease.contract.allowed_platform_output_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is outside this Item 7 lease allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
  await repairVerifyOutputRecord(env, recordId, false, lease.test_run_id);

  const beforeState = await phase6ScenarioState(env, scenarioId);
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});
  const stop = await phase6StopScenarioVerified(env, scenarioId, 4);
  if (stop?.inactive !== true) throw new HttpError(502, `${config.stage} cleanup did not verify inactive`);

  let read = await repairReadMakeBlueprint(env, scenarioId);
  let blueprint = read.blueprint;
  let root = repairScenarioModuleById(blueprint?.flow || [], 1);
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);
  let formula = String(root?.mapper?.formula || "");
  let selectorRestored = false;
  let alreadyCanonical = false;

  if (formula.includes('{Test_Run_ID}=BLANK()')) {
    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical cleanup selector is missing Do_Not_Publish exclusion");
    selectorRestored = true;
    alreadyCanonical = true;
  } else {
    const exactRunToken = `{Test_Run_ID}=${JSON.stringify(lease.test_run_id)}`;
    const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;
    if (!formula.startsWith(exactWrapper) || !formula.endsWith(")") || !formula.includes(exactRunToken)) {
      throw new HttpError(409, `${config.stage} cleanup refused a selector that is not the exact leased Output/Test_Run_ID selector`);
    }
    let recoveredFormula = formula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');
    if (scenarioId === 5569495) recoveredFormula = recoveredFormula.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');
    if (!recoveredFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} cleanup could not reconstruct Test_Run_ID exclusion`);
    if (scenarioId === 5569495 && !recoveredFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 cleanup could not reconstruct Do_Not_Publish exclusion");

    const recoveredBlueprint = JSON.parse(JSON.stringify(blueprint));
    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);
    recoveredRoot.mapper.formula = recoveredFormula;
    recoveredRoot.mapper.maxRecords = "1";
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });

    const verify = await repairReadMakeBlueprint(env, scenarioId);
    const verifyRoot = repairScenarioModuleById(verify.blueprint?.flow || [], 1);
    const verifyState = await phase6ScenarioState(env, scenarioId);
    selectorRestored = String(verifyRoot?.mapper?.formula || "") === recoveredFormula && String(verifyRoot?.mapper?.maxRecords || "") === "1" && verifyState.isActive === false;
    if (!selectorRestored) throw new HttpError(502, `${config.stage} cleanup selector restoration did not verify live`);
    if (JSON.stringify(verifyState?.scenario?.scheduling || {}) !== originalScheduling) throw new HttpError(502, `${config.stage} cleanup changed scenario scheduling`);
  }

  await repairCloseLease(env, lease, "failed", {
    reason: "item7-exact-stage-fresh-cleanup",
    stage: config.stage,
    scenario_stopped: true,
    selector_restored: selectorRestored,
    exact_platform_output_record_id: recordId,
    cleanup_only: true,
  });

  return {
    stage: config.stage,
    scenario_id: scenarioId,
    platform_output_record_id: recordId,
    test_run_id: lease.test_run_id,
    scenario_stopped: true,
    selector_restored: selectorRestored,
    already_canonical: alreadyCanonical,
    lease_terminalized: true,
  };
}

'''
text = text.replace(end_marker, cleanup_fn + end_marker, 1)

old_route = '''  if (action === "pulse_item7_exact_stage") {
    return await repairPulseItem7ExactStage(env, lease, input, action);
  }

  if (action === "pulse_r4_scheduled_selector") {'''
new_route = '''  if (action === "pulse_item7_exact_stage") {
    return await repairPulseItem7ExactStage(env, lease, input, action);
  }

  if (action === "cleanup_item7_exact_stage") {
    return await repairCleanupItem7ExactStage(env, lease, input);
  }

  if (action === "pulse_r4_scheduled_selector") {'''
if text.count(old_route) != 1:
    raise SystemExit(f"expected one Item7 route block; found {text.count(old_route)}")
text = text.replace(old_route, new_route, 1)

old_health = "          repair_item7_subrequest_reserve_v4: true,\n"
new_health = old_health + "          repair_item7_fresh_invocation_cleanup_v5: true,\n"
if text.count(old_health) != 1:
    raise SystemExit(f"expected one Item7 v4 health marker; found {text.count(old_health)}")
text = text.replace(old_health, new_health, 1)

path.write_text(text)
print(f"{path}: patched Item 7 fresh-invocation cleanup v5")
