#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-standalone-selector-recovery-v6.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()
marker = "ITEM7_STANDALONE_SELECTOR_RECOVERY_V6"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

anchor = '''async function repairControlAction(env, input) {
  const action = repairString(input.action, "action", 40).toLowerCase();
  const lease = await repairFindLease(env, input);
'''
if text.count(anchor) != 1:
    raise SystemExit(f"expected one repairControlAction anchor; found {text.count(anchor)}")

replacement = r'''// ITEM7_STANDALONE_SELECTOR_RECOVERY_V6: safety-only recovery for an exact selector
// stranded by a failed Item 7 pulse. This path intentionally does not load or consume
// a lease and can never activate/run a Make scenario.
async function repairRecoverItem7ExactSelector(env, input) {
  const confirm = repairString(input.confirm, "confirm", 96);
  if (confirm !== "RECOVER-ITEM7-EXACT-SELECTOR-V1") throw new HttpError(400, "Item 7 exact selector recovery confirmation is required");
  const scenarioId = Number(input.scenario_id);
  const config = ITEM7_EXACT_STAGE_CONFIG[scenarioId];
  if (!config) throw new HttpError(403, `Scenario ${scenarioId} is outside the Item 7 exact-stage allowlist`);
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  const testRunId = repairString(input.test_run_id, "test_run_id", 160);
  const output = await repairVerifyOutputRecord(env, recordId, false, testRunId);
  if (output?.fields?.Do_Not_Publish !== true) throw new HttpError(409, "Standalone selector recovery requires Do_Not_Publish=true on the exact test output");

  const beforeState = await phase6ScenarioState(env, scenarioId);
  if (beforeState.isActive) throw new HttpError(409, `${config.stage} must be inactive before standalone selector recovery`);
  const schedulingBefore = JSON.stringify(beforeState?.scenario?.scheduling || {});

  const read = await repairReadMakeBlueprint(env, scenarioId);
  const blueprint = read.blueprint;
  const root = repairScenarioModuleById(blueprint?.flow || [], 1);
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);
  const formula = String(root?.mapper?.formula || "");
  if (String(root?.mapper?.maxRecords || "") !== "1") throw new HttpError(409, `${config.stage} selector maxRecords is not 1`);

  if (formula.includes('{Test_Run_ID}=BLANK()')) {
    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical selector is missing Do_Not_Publish exclusion");
    return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: testRunId, scenario_stopped: true, selector_restored: true, already_canonical: true, schedule_preserved: true };
  }

  const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;
  const exactRunToken = `{Test_Run_ID}=${JSON.stringify(testRunId)}`;
  if (!formula.startsWith(exactWrapper) || !formula.endsWith(")") || !formula.includes(exactRunToken)) {
    throw new HttpError(409, `${config.stage} recovery refused selector: it is not the exact requested Output/Test_Run_ID selector`);
  }
  if (scenarioId === 5569495 && !formula.includes('{Do_Not_Publish}=1')) throw new HttpError(409, "R2 exact selector does not carry the required Do_Not_Publish=1 test guard");

  let canonical = formula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');
  if (scenarioId === 5569495) canonical = canonical.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');
  if (!canonical.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} could not reconstruct the production Test_Run_ID exclusion`);
  if (scenarioId === 5569495 && !canonical.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 could not reconstruct the production Do_Not_Publish exclusion");

  const patched = JSON.parse(JSON.stringify(blueprint));
  const patchedRoot = repairScenarioModuleById(patched?.flow || [], 1);
  patchedRoot.mapper.formula = canonical;
  patchedRoot.mapper.maxRecords = "1";
  await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(patched) }) });

  const verifyRead = await repairReadMakeBlueprint(env, scenarioId);
  const verifyRoot = repairScenarioModuleById(verifyRead.blueprint?.flow || [], 1);
  const afterState = await phase6ScenarioState(env, scenarioId);
  const schedulePreserved = JSON.stringify(afterState?.scenario?.scheduling || {}) === schedulingBefore;
  const selectorRestored = afterState.isActive === false && String(verifyRoot?.mapper?.formula || "") === canonical && String(verifyRoot?.mapper?.maxRecords || "") === "1";
  if (!selectorRestored) throw new HttpError(502, `${config.stage} standalone selector recovery did not verify live`);
  if (!schedulePreserved) throw new HttpError(502, `${config.stage} standalone selector recovery changed scenario scheduling`);

  return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: testRunId, scenario_stopped: true, selector_restored: true, already_canonical: false, schedule_preserved: true };
}

async function repairControlAction(env, input) {
  const action = repairString(input.action, "action", 40).toLowerCase();
  if (action === "recover_item7_exact_selector") return repairRecoverItem7ExactSelector(env, input);
  const lease = await repairFindLease(env, input);
'''
text = text.replace(anchor, replacement, 1)

health = "          repair_item7_fresh_invocation_cleanup_v5: true,\n"
if text.count(health) != 1:
    raise SystemExit(f"expected one v5 health marker; found {text.count(health)}")
text = text.replace(health, health + "          repair_item7_standalone_selector_recovery_v6: true,\n", 1)

path.write_text(text)
print(f"{path}: patched Item 7 standalone selector recovery v6")
