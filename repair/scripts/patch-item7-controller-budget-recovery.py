from pathlib import Path

p = Path("apps/studio-api/worker.js")
s = p.read_text()

begin = s.find("// ITEM7_EXACT_STAGE_TEST_MODE_V1_BEGIN")
end = s.find("// ITEM7_EXACT_STAGE_TEST_MODE_V1_END")
if begin < 0 or end < 0 or end <= begin:
    raise SystemExit("Item 7 controller marker block not found")
block = s[begin:end]

# Keep each Worker invocation comfortably below Cloudflare's subrequest ceiling.
block = block.replace(
    '5565333: Object.freeze({ stage: "R5", max_cycles: 12, wait_ms_per_cycle: 18000 })',
    '5565333: Object.freeze({ stage: "R5", max_cycles: 5, wait_ms_per_cycle: 18000 })',
)
block = block.replace(
    'await new Promise((resolve) => setTimeout(resolve, 2000));',
    'await new Promise((resolve) => setTimeout(resolve, 6000));',
)

old = '''  const read = await repairReadMakeBlueprint(env, scenarioId);\n  const originalBlueprint = read.blueprint;\n  const originalSerialized = JSON.stringify(originalBlueprint);\n  const originalIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);\n  const root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);\n  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);\n  const originalFormula = String(root?.mapper?.formula || "");\n  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);\n  if (scenarioId === 5569495 && !originalFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 production selector no longer contains the verified Do_Not_Publish exclusion");\n'''
new = '''  let read = await repairReadMakeBlueprint(env, scenarioId);\n  let originalBlueprint = read.blueprint;\n  let root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);\n  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);\n  let originalFormula = String(root?.mapper?.formula || "");\n  let strandedSelectorRecovered = false;\n\n  // A prior invocation can hit a platform subrequest ceiling after installing the exact selector but before rollback.\n  // Recover only the exact selector for this same output + Test_Run_ID, while the scenario is already verified OFF.\n  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) {\n    const exactRunToken = `{Test_Run_ID}=${JSON.stringify(lease.test_run_id)}`;\n    const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;\n    if (!originalFormula.startsWith(exactWrapper) || !originalFormula.endsWith(")") || !originalFormula.includes(exactRunToken)) {\n      throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);\n    }\n    let recoveredFormula = originalFormula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');\n    if (scenarioId === 5569495) recoveredFormula = recoveredFormula.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');\n    if (!recoveredFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} stranded selector recovery could not reconstruct Test_Run_ID exclusion`);\n    if (scenarioId === 5569495 && !recoveredFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 stranded selector recovery could not reconstruct Do_Not_Publish exclusion");\n\n    const recoveredBlueprint = JSON.parse(JSON.stringify(originalBlueprint));\n    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);\n    recoveredRoot.mapper.formula = recoveredFormula;\n    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });\n    read = await repairReadMakeBlueprint(env, scenarioId);\n    originalBlueprint = read.blueprint;\n    root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);\n    originalFormula = String(root?.mapper?.formula || "");\n    if (originalFormula !== recoveredFormula) throw new HttpError(502, `${config.stage} stranded selector recovery did not verify live`);\n    strandedSelectorRecovered = true;\n  }\n\n  const originalSerialized = JSON.stringify(originalBlueprint);\n  const originalIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);\n  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);\n  if (scenarioId === 5569495 && !originalFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 production selector no longer contains the verified Do_Not_Publish exclusion");\n'''
if old not in block:
    raise SystemExit("Item 7 selector baseline block did not match expected source")
block = block.replace(old, new, 1)

old_return = 'return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: lease.test_run_id, cycles_run: cyclesRun, checkpoint: observed?.checkpoint?.summary || null, scenario_started: true, scenario_stopped: stop?.inactive === true, selector_restored: true, schedule_preserved: true, do_not_publish_preserved: true };'
new_return = 'return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: lease.test_run_id, cycles_run: cyclesRun, checkpoint: observed?.checkpoint?.summary || null, scenario_started: true, scenario_stopped: stop?.inactive === true, selector_restored: true, schedule_preserved: true, do_not_publish_preserved: true, stranded_selector_recovered: strandedSelectorRecovered };'
if old_return not in block:
    raise SystemExit("Item 7 return block did not match expected source")
block = block.replace(old_return, new_return, 1)

s = s[:begin] + block + s[end:]
p.write_text(s)
print("item7_controller_budget_recovery_patch=PASS")
