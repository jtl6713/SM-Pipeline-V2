#!/usr/bin/env python3
from pathlib import Path

path = Path("apps/studio-api/worker.js")
source = path.read_text()

health_anchor = "          repair_make_module_inspector_v1: true,\n"
health_line = "          repair_make_execution_inspector_v1: true,\n"
if health_line not in source:
    if health_anchor not in source:
        raise SystemExit("health anchor missing")
    source = source.replace(health_anchor, health_anchor + health_line, 1)

helper_anchor = "async function adminRepairControlStatus(request, env) {"
helper_marker = "async function repairInspectMakeExecution(env, scenarioId, executionId) {"
helper = r'''
async function repairInspectMakeExecution(env, scenarioId, executionId) {
  const id = Number(scenarioId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  const execution = repairString(executionId, "execution_id", 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(execution)) throw new HttpError(400, "execution_id format is invalid");
  const body = await phase6MakeApiJson(env, `/scenarios/${id}/executions/${execution}`, { method: "GET" });
  const details = body?.response || body?.execution || body || {};
  return {
    scenario_id: id,
    execution_id: execution,
    status: String(details?.status || ""),
    details: repairInspectorClone(details),
  };
}

'''
if helper_marker not in source:
    if helper_anchor not in source:
        raise SystemExit("helper anchor missing")
    source = source.replace(helper_anchor, helper + helper_anchor, 1)

control_anchor = '  if (action === "inspect_make_scenario") {\n'
control_marker = '  if (action === "inspect_make_execution") {\n'
control_block = '''  if (action === "inspect_make_execution") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "INSPECT-MAKE-EXECUTION-V1") throw new HttpError(400, "Exact Make execution inspection confirmation is required");
    const inspected = await repairInspectMakeExecution(env, input?.scenario_id, input?.execution_id);
    return respond(request, env, { ok: true, action, inspected });
  }
'''
if control_marker not in source:
    if control_anchor not in source:
        raise SystemExit("control anchor missing")
    source = source.replace(control_anchor, control_block + control_anchor, 1)

path.write_text(source)
print("worker_make_execution_inspector_patch=PASS")
