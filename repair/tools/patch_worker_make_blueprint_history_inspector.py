#!/usr/bin/env python3
from pathlib import Path

path=Path('apps/studio-api/worker.js')
source=path.read_text()

# Migrate the first inspector implementation to Make's documented response shape.
old='''  const candidates = rawVersions?.response?.scenariosBlueprints\n    || rawVersions?.scenariosBlueprints\n    || rawVersions?.response?.blueprints\n    || rawVersions?.blueprints\n    || (Array.isArray(rawVersions?.response) ? rawVersions.response : null)\n    || (Array.isArray(rawVersions) ? rawVersions : null)\n    || [];\n  if (!Array.isArray(candidates)) throw new HttpError(502, "Make blueprint versions response was not an array");\n\n  const versions = [];\n  const recent = candidates.slice(0, 60);\n  for (const version of recent) {\n    const blueprintId = Number(version?.id ?? version?.blueprintId ?? version?.blueprint_id);\n'''
new='''  const rawCandidates = rawVersions?.response?.scenariosBlueprints\n    ?? rawVersions?.scenariosBlueprints\n    ?? rawVersions?.response?.blueprints\n    ?? rawVersions?.blueprints\n    ?? (Array.isArray(rawVersions?.response) ? rawVersions.response : null)\n    ?? (Array.isArray(rawVersions) ? rawVersions : null)\n    ?? [];\n  const candidates = Array.isArray(rawCandidates) ? rawCandidates : (rawCandidates && typeof rawCandidates === "object" ? [rawCandidates] : []);\n\n  const versions = [];\n  const recent = candidates.slice(0, 60);\n  for (const version of recent) {\n    const blueprintId = Number(version?.id ?? version?.blueprintId ?? version?.blueprint_id ?? version?.version);\n'''
if old in source:
    source=source.replace(old,new,1)

old_created='''      created_at: String(version?.createdAt || version?.created_at || version?.timestamp || ""),\n'''
new_created='''      created_at: String(version?.createdAt || version?.created_at || version?.created || version?.timestamp || ""),\n'''
if old_created in source:
    source=source.replace(old_created,new_created,1)

helper_anchor='async function adminRepairControlStatus(request, env) {'
helper_marker='async function repairInspectMakeBlueprintHistory(env, scenarioId, moduleId) {'
helper=r'''
async function repairInspectMakeBlueprintHistory(env, scenarioId, moduleId) {
  const id = Number(scenarioId);
  const targetModuleId = Number(moduleId || 900);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  if (!Number.isInteger(targetModuleId) || targetModuleId <= 0) throw new HttpError(400, "module_id must be a positive integer");

  const rawVersions = await phase6MakeApiJson(env, `/scenarios/${id}/blueprints`, { method: "GET" });
  const rawCandidates = rawVersions?.response?.scenariosBlueprints
    ?? rawVersions?.scenariosBlueprints
    ?? rawVersions?.response?.blueprints
    ?? rawVersions?.blueprints
    ?? (Array.isArray(rawVersions?.response) ? rawVersions.response : null)
    ?? (Array.isArray(rawVersions) ? rawVersions : null)
    ?? [];
  const candidates = Array.isArray(rawCandidates) ? rawCandidates : (rawCandidates && typeof rawCandidates === "object" ? [rawCandidates] : []);

  const versions = [];
  const recent = candidates.slice(0, 60);
  for (const version of recent) {
    const blueprintId = Number(version?.id ?? version?.blueprintId ?? version?.blueprint_id ?? version?.version);
    if (!Number.isInteger(blueprintId) || blueprintId <= 0) continue;
    const body = await phase6MakeApiJson(env, `/scenarios/${id}/blueprint?blueprintId=${blueprintId}`, { method: "GET" });
    const blueprint = body?.response?.blueprint || body?.blueprint;
    let target = null;
    const walk = (flow) => {
      for (const node of Array.isArray(flow) ? flow : []) {
        if (Number(node?.id) === targetModuleId) target = node;
        for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
      }
    };
    if (blueprint && typeof blueprint === "object") walk(blueprint.flow);
    versions.push({
      blueprint_id: blueprintId,
      created_at: String(version?.createdAt || version?.created_at || version?.created || version?.timestamp || ""),
      is_draft: Boolean(version?.draft ?? version?.isDraft ?? version?.is_draft),
      target_module_present: Boolean(target),
      target_module_type: target ? String(target?.module || "") : null,
      target_hook_id: target ? Number(target?.parameters?.hook || target?.mapper?.hook || 0) || null : null,
      target_module_name: target ? String(target?.metadata?.designer?.name || "") : null,
    });
  }
  return {
    scenario_id: id,
    module_id: targetModuleId,
    version_count_returned: versions.length,
    versions,
  };
}

'''
if helper_marker not in source:
    if helper_anchor not in source: raise SystemExit('helper anchor missing')
    source=source.replace(helper_anchor,helper+helper_anchor,1)

control_anchor='''  if (action === "inspect_make_scenario") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "INSPECT-MAKE-MODULES-V1") throw new HttpError(400, "Exact Make module inspection confirmation is required");\n    const inspected = await repairInspectMakeScenarioModules(env, input?.scenario_id, input?.module_ids);\n    return respond(request, env, { ok: true, action, inspected });\n  }\n'''
control_block='''  if (action === "inspect_make_blueprint_history") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "INSPECT-MAKE-BLUEPRINT-HISTORY-V1") throw new HttpError(400, "Make blueprint history inspection confirmation is required");\n    const inspected = await repairInspectMakeBlueprintHistory(env, input?.scenario_id, input?.module_id);\n    return respond(request, env, { ok: true, action, inspected });\n  }\n'''
if control_block not in source:
    if control_anchor not in source: raise SystemExit('control anchor missing')
    source=source.replace(control_anchor,control_anchor+control_block,1)

path.write_text(source)
print('worker_make_blueprint_history_inspector_patch=PASS')
