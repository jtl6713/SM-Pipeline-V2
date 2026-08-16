#!/usr/bin/env python3
from pathlib import Path

path=Path('apps/studio-api/worker.js')
source=path.read_text()

health_anchor='          repair_make_admin_module19_v1: true,\n'
health_line='          repair_make_module_inspector_v1: true,\n'
if health_line not in source:
    if health_anchor not in source: raise SystemExit('health anchor missing')
    source=source.replace(health_anchor,health_anchor+health_line,1)

helper_anchor='async function adminRepairControlStatus(request, env) {'
helper_marker='async function repairInspectMakeScenarioModules(env, scenarioId, requestedIds) {'
helper=r'''
function repairInspectorClone(value, depth = 0) {
  if (depth > 10) return "[depth-limit]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}...[truncated:${value.length}]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => repairInspectorClone(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = repairInspectorClone(child, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

async function repairInspectMakeScenarioModules(env, scenarioId, requestedIds) {
  const id = Number(scenarioId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  const wanted = new Set((Array.isArray(requestedIds) ? requestedIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  if (wanted.size > 20) throw new HttpError(400, "At most 20 module_ids may be inspected");
  const state = await phase6ScenarioState(env, id);
  const live = await phase6MakeApiJson(env, `/scenarios/${id}/blueprint?draft=false`, { method: "GET" });
  const blueprint = live?.response?.blueprint || live?.blueprint;
  if (!blueprint || typeof blueprint !== "object") throw new HttpError(502, "Make blueprint response did not contain a blueprint object");
  const found = [];
  const walk = (flow, routePath = []) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      const nodeId = Number(node?.id);
      if (!wanted.size || wanted.has(nodeId)) {
        found.push({
          route_path: routePath,
          module: repairInspectorClone({
            id: node?.id,
            module: node?.module,
            version: node?.version,
            parameters: node?.parameters,
            mapper: node?.mapper,
            metadata: node?.metadata,
          }),
        });
      }
      const routes = Array.isArray(node?.routes) ? node.routes : [];
      routes.forEach((route, index) => walk(route?.flow, [...routePath, { parent_module_id: node?.id, route_index: index, filter: repairInspectorClone(route?.filter || null) }]));
    }
  };
  walk(blueprint?.flow);
  if (wanted.size) {
    const foundIds = new Set(found.map((x) => Number(x?.module?.id)));
    const missing = [...wanted].filter((x) => !foundIds.has(x));
    if (missing.length) throw new HttpError(404, `Requested Make module(s) not found: ${missing.join(",")}`);
  }
  return {
    scenario_id: id,
    scenario_name: String(state?.scenario?.name || ""),
    scenario_active: Boolean(state?.isActive),
    module_count_returned: found.length,
    modules: found,
  };
}

'''
if helper_marker not in source:
    if helper_anchor not in source: raise SystemExit('helper anchor missing')
    source=source.replace(helper_anchor,helper+helper_anchor,1)

control_anchor='  const action = repairString(input?.action, "action", 40).toLowerCase();\n'
control_block='''  if (action === "inspect_make_scenario") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "INSPECT-MAKE-MODULES-V1") throw new HttpError(400, "Exact Make module inspection confirmation is required");\n    const inspected = await repairInspectMakeScenarioModules(env, input?.scenario_id, input?.module_ids);\n    return respond(request, env, { ok: true, action, inspected });\n  }\n'''
if control_block not in source:
    if control_anchor not in source: raise SystemExit('control anchor missing')
    source=source.replace(control_anchor,control_anchor+control_block,1)

path.write_text(source)
print('worker_make_module_inspector_patch=PASS')
