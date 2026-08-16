#!/usr/bin/env python3
from pathlib import Path

path = Path('apps/studio-api/worker.js')
source = path.read_text()

health_anchor = '          repair_activation_leases_v1: true,\n'
health_line = '          repair_make_admin_module19_v1: true,\n'
if health_line not in source:
    if health_anchor not in source:
        raise SystemExit('repair health anchor not found')
    source = source.replace(health_anchor, health_anchor + health_line, 1)

helper_anchor = 'async function adminRepairControlStatus(request, env) {'
helper_marker = 'async function repairMakeAdminModule19(env) {'
helper = r'''
async function repairSha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function repairMakeAdminFindModule19(blueprint) {
  const matches = [];
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      if (Number(node?.id) === 19) matches.push(node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  if (matches.length !== 1) throw new HttpError(409, `Expected exactly one MAKE-ADMIN module 19; found ${matches.length}`);
  const module = matches[0];
  if (module?.module !== "airtable:ActionUpdateRecords") throw new HttpError(409, "MAKE-ADMIN module 19 type changed unexpectedly");
  if (module?.metadata?.designer?.name !== "19 - Record GET_BLUEPRINT Result") throw new HttpError(409, "MAKE-ADMIN module 19 name changed unexpectedly");
  return module;
}

async function repairMakeAdminModule19(env) {
  const scenarioId = 5893243;
  const expectedScenarioName = "MAKE-ADMIN-BRIDGE v1.3 - Airtable Controlled Make API - Direct Webhook Runner";
  const resultField = "fldduyTQgkdN6E1wI";
  const errorField = "fld6x1xtUD3CxmXdv";
  const oldResult = "{{18.data}}";
  const oldError = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; 18.data); 18.data)}}';
  const newResult = '{"blueprint_omitted":true,"scenario_id":"{{1.Scenario_ID}}","http_status":"{{18.statusCode}}"}';
  const newError = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; "GET_BLUEPRINT failed; response body omitted"); "GET_BLUEPRINT failed; response body omitted")}}';

  const stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE must be OFF before module 19 repair");
  if (String(stateBefore?.scenario?.name || "") !== expectedScenarioName) throw new HttpError(409, "MAKE-ADMIN-BRIDGE scenario name changed unexpectedly");

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== "object") throw new HttpError(502, "Make blueprint response did not contain a blueprint object");
  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const patched = JSON.parse(JSON.stringify(liveBlueprint));
  const module = repairMakeAdminFindModule19(patched);
  const record = module?.mapper?.record || {};

  if (record[resultField] === newResult && record[errorField] === newError) {
    const stateAlready = await phase6ScenarioState(env, scenarioId);
    if (stateAlready?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE became active during idempotent verification");
    return {
      scenario_id: scenarioId,
      scenario_name: expectedScenarioName,
      module_id: 19,
      already_repaired: true,
      scenario_off_before: true,
      scenario_off_after: true,
      full_blueprint_omitted: true,
      blueprint_sha256: await repairSha256Hex(JSON.stringify(liveBlueprint)),
    };
  }

  if (record[resultField] !== oldResult) throw new HttpError(409, "MAKE-ADMIN module 19 Result_JSON mapping no longer matches the expected unsafe baseline");
  if (record[errorField] !== oldError) throw new HttpError(409, "MAKE-ADMIN module 19 Error_Message mapping no longer matches the expected unsafe baseline");
  record[resultField] = newResult;
  record[errorField] = newError;

  const reverted = JSON.parse(JSON.stringify(patched));
  const revertedRecord = repairMakeAdminFindModule19(reverted)?.mapper?.record || {};
  revertedRecord[resultField] = oldResult;
  revertedRecord[errorField] = oldError;
  if (JSON.stringify(reverted) !== JSON.stringify(original)) throw new HttpError(500, "Module 19 patch construction changed more than the two approved mappings");

  const originalSha = await repairSha256Hex(JSON.stringify(original));
  const patchedSha = await repairSha256Hex(JSON.stringify(patched));
  let applied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
      method: "PATCH",
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    applied = true;
    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
    const actual = after?.response?.blueprint || after?.blueprint;
    if (!actual || JSON.stringify(actual) !== JSON.stringify(patched)) throw new HttpError(502, "Post-write MAKE-ADMIN blueprint does not exactly match the intended module 19 patch");
    const actualRecord = repairMakeAdminFindModule19(actual)?.mapper?.record || {};
    if (actualRecord[resultField] !== newResult || actualRecord[errorField] !== newError) throw new HttpError(502, "MAKE-ADMIN module 19 bounded mappings did not verify");
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE became active during module 19 repair");
    return {
      scenario_id: scenarioId,
      scenario_name: expectedScenarioName,
      module_id: 19,
      changed_mapper_fields: [resultField, errorField],
      scenario_off_before: true,
      scenario_off_after: true,
      exact_postwrite_verification: true,
      full_blueprint_omitted: true,
      original_sha256: originalSha,
      patched_sha256: patchedSha,
    };
  } catch (error) {
    if (applied) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
          method: "PATCH",
          body: JSON.stringify({ blueprint: JSON.stringify(original) }),
        });
        const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
        const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
        const rolledState = await phase6ScenarioState(env, scenarioId);
        if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || rolledState?.isActive) {
          throw new Error("rollback verification failed");
        }
      } catch (rollbackError) {
        throw new HttpError(500, `MAKE-ADMIN module 19 repair failed and rollback could not be verified: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    throw error;
  }
}

'''
if helper_marker not in source:
    if helper_anchor not in source:
        raise SystemExit('adminRepairControlStatus anchor not found')
    source = source.replace(helper_anchor, helper + helper_anchor, 1)

control_anchor = '  const action = repairString(input?.action, "action", 40).toLowerCase();\n'
control_block = '''  if (action === "repair_make_admin_module19") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "REPAIR-MAKE-ADMIN-MODULE19-V1") throw new HttpError(400, "Exact module 19 repair confirmation is required");\n    const repaired = await repairMakeAdminModule19(env);\n    return respond(request, env, { ok: true, action, repaired });\n  }\n'''
if control_block not in source:
    if control_anchor not in source:
        raise SystemExit('adminRepairControl action anchor not found')
    source = source.replace(control_anchor, control_anchor + control_block, 1)

path.write_text(source)
print('worker_module19_repair_control_patch=PASS')
