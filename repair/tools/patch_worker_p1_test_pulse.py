from pathlib import Path

PATH = Path('apps/studio-api/worker.js')
s = PATH.read_text(encoding='utf-8')
original = s


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one marker, found {count}')
    s = s.replace(old, new, 1)


def insert_before(marker: str, text: str, label: str):
    global s
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one marker, found {count}')
    s = s.replace(marker, text + marker, 1)

# Idempotent no-op if already fully installed.
if 'repair_p1_test_selector_pulse_v1: true' in s and 'pulse_p1_test_selector' in s and 'allowed_content_item_record_ids' in s:
    print('P1 Test Mode pulse already installed; no change')
    raise SystemExit(0)

replace_once(
    '          repair_r4_scheduled_selector_pulse_v1: true,\n          repair_exact_output_test_mode_v1: true,',
    '          repair_r4_scheduled_selector_pulse_v1: true,\n          repair_p1_test_selector_pulse_v1: true,\n          repair_exact_output_test_mode_v1: true,',
    'health flag',
)

replace_once(
    '  5556716, // R4 renderer handoff\n',
    '  5556716, // R4 renderer handoff\n  5528742, // P1 content package scheduled root (Test Mode exact selector pulse only)\n',
    'repair scenario allowlist',
)

replace_once(
    '    allowed_platform_output_record_ids: l.contract.allowed_platform_output_record_ids || [],\n    allow_public_publish: l.contract.allow_public_publish === true,',
    '    allowed_platform_output_record_ids: l.contract.allowed_platform_output_record_ids || [],\n    allowed_content_item_record_ids: l.contract.allowed_content_item_record_ids || [],\n    allow_public_publish: l.contract.allow_public_publish === true,',
    'repair control status resource allowlists',
)

replace_once(
    '  const allowedOutputs = repairRecordIds(input.allowed_platform_output_record_ids, "allowed_platform_output_record_ids");\n  const denyFixtures = Array.isArray(input.deny_fixture_record_ids) ? input.deny_fixture_record_ids.map(String) : [];',
    '  const allowedOutputs = Array.isArray(input.allowed_platform_output_record_ids) && input.allowed_platform_output_record_ids.length\n    ? repairRecordIds(input.allowed_platform_output_record_ids, "allowed_platform_output_record_ids")\n    : [];\n  const allowedContentItems = Array.isArray(input.allowed_content_item_record_ids) && input.allowed_content_item_record_ids.length\n    ? repairRecordIds(input.allowed_content_item_record_ids, "allowed_content_item_record_ids")\n    : [];\n  const denyFixtures = Array.isArray(input.deny_fixture_record_ids) ? input.deny_fixture_record_ids.map(String) : [];',
    'optional lease resource allowlists',
)

replace_once(
    '  if (denyFixtures.some((id) => allowedOutputs.includes(id))) throw new HttpError(400, "deny fixture cannot also be allowlisted");\n  if (allowPublicPublish) {\n    if (allowedOutputs.length !== 1 || !repairString(input.explicit_publish_platform, "explicit_publish_platform", 40)) {',
    '  if (!allowedOutputs.length && !allowedContentItems.length) throw new HttpError(400, "A repair lease requires at least one exact resource allowlist");\n  if (denyFixtures.some((id) => allowedOutputs.includes(id) || allowedContentItems.includes(id))) throw new HttpError(400, "deny fixture cannot also be allowlisted");\n  if (allowPublicPublish) {\n    if (allowedContentItems.length || allowedOutputs.length !== 1 || !repairString(input.explicit_publish_platform, "explicit_publish_platform", 40)) {',
    'lease allowlist validation',
)

replace_once(
    '  const outputs = [];\n  for (const id of allowedOutputs) outputs.push(await repairVerifyOutputRecord(env, id, allowPublicPublish, testRunId));\n\n  const contract = {',
    '  const outputs = [];\n  for (const id of allowedOutputs) outputs.push(await repairVerifyOutputRecord(env, id, allowPublicPublish, testRunId));\n  const contentItems = [];\n  for (const id of allowedContentItems) contentItems.push(await repairVerifyContentItemRecord(env, id, testRunId));\n\n  const contract = {',
    'lease resource verification',
)

replace_once(
    '    allowed_platform_output_record_ids: allowedOutputs,\n    deny_fixture_record_ids: denyFixtures,',
    '    allowed_platform_output_record_ids: allowedOutputs,\n    allowed_content_item_record_ids: allowedContentItems,\n    deny_fixture_record_ids: denyFixtures,',
    'lease content-item contract',
)

replace_once(
    '      Notes: `${REPAIR_LEASE_NOTE_PREFIX} ${leaseId}; exact output allowlist enforced; RUN disabled until stage addressing is verified.`,',
    '      Notes: `${REPAIR_LEASE_NOTE_PREFIX} ${leaseId}; exact resource allowlist enforced; standalone RUN disabled; only stage-specific guarded pulses permitted.`,',
    'lease audit note',
)

replace_once(
    '  return { lease: repairLeaseState(record), outputs };\n}',
    '  return { lease: repairLeaseState(record), outputs, content_items: contentItems };\n}',
    'lease acquire return resources',
)

content_helper = r'''
async function repairVerifyContentItemRecord(env, recordId, expectedTestRunId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(recordId || ""))) throw new HttpError(400, "Invalid Content Item record ID");
  const record = await airtableFetch(env, "Content Items", recordId);
  const fields = record?.fields || {};
  const durableTestRunId = String(fields.Test_Run_ID || "").trim();
  if (!durableTestRunId || durableTestRunId !== String(expectedTestRunId || "").trim()) {
    throw new HttpError(403, `Content Item ${recordId} Test_Run_ID does not exactly match the repair lease`);
  }
  return record;
}

'''
insert_before('async function repairAcquireLease(env, input, authorization) {', content_helper, 'content item verifier insertion')

p1_helpers = r'''
function repairScenarioModuleById(flow, moduleId) {
  for (const node of flow || []) {
    if (Number(node?.id) === Number(moduleId)) return node;
    for (const route of node?.routes || []) {
      const found = repairScenarioModuleById(route?.flow || [], moduleId);
      if (found) return found;
    }
  }
  return null;
}

function repairScenarioModuleIds(flow, out = []) {
  for (const node of flow || []) {
    out.push(Number(node?.id));
    for (const route of node?.routes || []) repairScenarioModuleIds(route?.flow || [], out);
  }
  return out;
}

async function repairReadMakeBlueprint(env, scenarioId) {
  const raw = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
  const wrapped = raw?.blueprint ?? raw?.response?.blueprint ?? raw;
  const blueprint = typeof wrapped === "string" ? repairJson(wrapped, null) : wrapped;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new HttpError(502, `Make scenario ${scenarioId} returned an invalid blueprint`);
  return { blueprint, original_payload: typeof wrapped === "string" ? wrapped : JSON.stringify(blueprint) };
}

function repairP1Eligibility(fields) {
  const contentStatus = String(fields?.Content_Status || "");
  const scriptStatus = String(fields?.Script_Status || "");
  const linkedProfile = Array.isArray(fields?.Content_Profile) ? fields.Content_Profile.length > 0 : Boolean(fields?.Content_Profile);
  return (
    ["Idea Approved", "Ready for Script"].includes(contentStatus) &&
    linkedProfile &&
    Boolean(String(fields?.Content_Title || "").trim()) &&
    Boolean(String(fields?.Idea_Summary || "").trim()) &&
    fields?.Do_Not_Produce !== true &&
    !String(fields?.Script || "").trim() &&
    !String(fields?.Caption || "").trim() &&
    ["", "Not Started", "Ready"].includes(scriptStatus)
  );
}

async function repairWaitForP1Package(env, recordId, expectedTestRunId, timeoutMs = 90000) {
  const started = Date.now();
  let last = await airtableFetch(env, "Content Items", recordId);
  while (Date.now() - started < timeoutMs) {
    const fields = last?.fields || {};
    if (String(fields.Test_Run_ID || "") !== expectedTestRunId) throw new HttpError(409, "P1 target durable Test_Run_ID changed during pulse");
    if (String(fields.Script_Status || "") === "Generated" && String(fields.Script || "").trim()) {
      return { matched: true, record: last };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    last = await airtableFetch(env, "Content Items", recordId);
  }
  return { matched: false, record: last };
}

async function repairPulseP1TestSelector(env, lease, input, action) {
  const P1_SCENARIO_ID = 5528742;
  if (lease.scenario_id !== P1_SCENARIO_ID) throw new HttpError(403, `pulse_p1_test_selector is limited to P1 scenario ${P1_SCENARIO_ID}`);
  const recordId = repairString(input.content_item_record_id, "content_item_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_content_item_record_ids) ? lease.contract.allowed_content_item_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is outside this test_run_id allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is an explicit denial fixture`);

  const target = await repairVerifyContentItemRecord(env, recordId, lease.test_run_id);
  if (!repairP1Eligibility(target?.fields || {})) throw new HttpError(409, `Content Item ${recordId} does not satisfy the P1 package eligibility contract`);

  const beforeState = await phase6ScenarioState(env, P1_SCENARIO_ID);
  if (beforeState.isActive) throw new HttpError(409, "P1 must be OFF before Test Mode selector pulse");
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});
  const scheduling = beforeState?.scenario?.scheduling || {};
  if (String(scheduling.type || "") !== "indefinitely" || Number(scheduling.interval || 0) !== 900) {
    throw new HttpError(409, `P1 canonical 15-minute schedule is not present: ${originalScheduling}`);
  }
  if (beforeState?.scenario?.hookId != null) throw new HttpError(409, "P1 unexpectedly has a webhook identity; refusing selector pulse");

  const read = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
  const originalBlueprint = read.blueprint;
  const originalModuleIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);
  const root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);
  const mapper = root?.mapper || {};
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, "P1 Module 1 is not the expected Airtable Search Records selector");
  if (String(mapper.table || "") !== "Content Items" || String(mapper.view || "") !== "P1 - Ready for Package Generation") {
    throw new HttpError(409, "P1 Module 1 table/view contract drifted");
  }
  if (String(mapper.formula || "") !== "{Test_Run_ID}=BLANK()" || String(mapper.maxRecords || "") !== "10") {
    throw new HttpError(409, `P1 production selector is not at the verified baseline; formula=${String(mapper.formula || "")}, maxRecords=${String(mapper.maxRecords || "")}`);
  }

  const patched = JSON.parse(JSON.stringify(originalBlueprint));
  const patchedRoot = repairScenarioModuleById(patched?.flow || [], 1);
  patchedRoot.mapper.formula = `AND(RECORD_ID()=${JSON.stringify(recordId)},{Test_Run_ID}=${JSON.stringify(lease.test_run_id)})`;
  patchedRoot.mapper.maxRecords = "1";

  await repairReserveBudget(env, lease, { operationCost: 30, runCost: 1, action });

  let patchedLive = false;
  let started = false;
  let stop = null;
  let restored = false;
  let failure = null;
  let observed = null;
  try {
    await phase6MakeApiJson(env, `/scenarios/${P1_SCENARIO_ID}?confirmed=true`, {
      method: "PATCH",
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    patchedLive = true;

    const verifyPatched = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
    const verifyRoot = repairScenarioModuleById(verifyPatched.blueprint?.flow || [], 1);
    if (String(verifyRoot?.mapper?.formula || "") !== String(patchedRoot.mapper.formula) || String(verifyRoot?.mapper?.maxRecords || "") !== "1") {
      throw new HttpError(502, "P1 exact Test Mode selector did not verify live before activation");
    }
    const patchedIds = repairScenarioModuleIds(verifyPatched.blueprint?.flow || []).sort((a, b) => a - b);
    if (JSON.stringify(patchedIds) !== JSON.stringify(originalModuleIds)) throw new HttpError(502, "P1 module topology changed while installing exact selector");

    await phase6SetScenarioActive(env, P1_SCENARIO_ID, true);
    started = true;
    observed = await repairWaitForP1Package(env, recordId, lease.test_run_id, 90000);
    if (!observed?.matched) throw new HttpError(502, `P1 did not generate a package for exact Content Item ${recordId} within 90 seconds`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    try { stop = await phase6StopScenarioVerified(env, P1_SCENARIO_ID, 4); } catch (error) {
      if (!failure) failure = error instanceof Error ? error.message : String(error);
    }
    if (patchedLive) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${P1_SCENARIO_ID}?confirmed=true`, {
          method: "PATCH",
          body: JSON.stringify({ blueprint: read.original_payload }),
        });
        const verifyRestore = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
        const restoredRoot = repairScenarioModuleById(verifyRestore.blueprint?.flow || [], 1);
        const restoredIds = repairScenarioModuleIds(verifyRestore.blueprint?.flow || []).sort((a, b) => a - b);
        const finalState = await phase6ScenarioState(env, P1_SCENARIO_ID);
        restored = (
          String(restoredRoot?.mapper?.formula || "") === "{Test_Run_ID}=BLANK()" &&
          String(restoredRoot?.mapper?.maxRecords || "") === "10" &&
          JSON.stringify(restoredIds) === JSON.stringify(originalModuleIds) &&
          finalState.isActive === false &&
          JSON.stringify(finalState?.scenario?.scheduling || {}) === originalScheduling &&
          finalState?.scenario?.hookId == null
        );
        if (!restored && !failure) failure = "P1 production blueprint/state did not verify fully restored";
      } catch (error) {
        restored = false;
        if (!failure) failure = error instanceof Error ? error.message : String(error);
      }
    }

    if (stop?.inactive !== true && !failure) failure = "P1 did not verify inactive after pulse";
    if (failure || !restored) {
      try { await repairCloseLease(env, lease, "failed", { reason: "p1-test-selector-pulse-failed", scenario_stopped: stop?.inactive === true, selector_restored: restored, error: failure || "restore verification failed" }); } catch {}
    } else {
      try { await repairCloseLease(env, lease, "released", { reason: "p1-test-selector-one-run-complete", scenario_stopped: true, selector_restored: true, exact_content_item_record_id: recordId, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
    }
  }

  if (failure || !restored) throw new HttpError(502, failure || "P1 Test Mode selector pulse failed restoration verification");
  const finalFields = observed?.record?.fields || {};
  return {
    action,
    lease,
    target_record_id: recordId,
    exact_selector: true,
    observed_script_status: String(finalFields.Script_Status || ""),
    script_generated: Boolean(String(finalFields.Script || "").trim()),
    durable_test_run_id: String(finalFields.Test_Run_ID || ""),
    scenario_started: started,
    scenario_stopped: stop?.inactive === true,
    selector_restored: restored,
    schedule_preserved: true,
  };
}

'''
insert_before('async function repairControlAction(env, input) {', p1_helpers, 'P1 pulse helpers insertion')

p1_action = r'''  if (action === "pulse_p1_test_selector") {
    return await repairPulseP1TestSelector(env, lease, input, action);
  }

'''
insert_before('  if (action === "pulse_r4_scheduled_selector") {', p1_action, 'P1 action dispatch insertion')

if s == original:
    raise SystemExit('No changes made')
PATH.write_text(s, encoding='utf-8')
print('Installed lease-guarded exact P1 Test Mode selector pulse')
