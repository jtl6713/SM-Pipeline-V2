from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_anchor = '          repair_make_module_inspector_v1: true,\n'
health_line = '          repair_make_scenario_inventory_v1: true,\n'
if health_line not in text:
    if health_anchor not in text:
        raise SystemExit('health anchor not found')
    text = text.replace(health_anchor, health_anchor + health_line, 1)

helper_marker = 'async function repairListMakeScenariosCompact(env) {'
if helper_marker not in text:
    anchor = 'async function repairInspectMakeScenarioModules(env, scenarioId, requestedIds) {'
    if anchor not in text:
        raise SystemExit('inspector anchor not found')
    helper = r'''
async function repairListMakeScenariosCompact(env) {
  const anchorScenarioId = 5556716;
  const anchorState = await phase6ScenarioState(env, anchorScenarioId);
  const teamId = Number(anchorState?.scenario?.teamId || anchorState?.scenario?.team?.id || 0);
  if (!Number.isInteger(teamId) || teamId <= 0) throw new HttpError(502, 'Make scenario metadata did not expose a usable teamId');

  const body = await phase6MakeApiJson(
    env,
    `/scenarios?teamId=${teamId}&pg%5Blimit%5D=100&pg%5Boffset%5D=0&pg%5BsortBy%5D=id&pg%5BsortDir%5D=desc`,
    { method: 'GET' },
  );
  const scenarios = body?.scenarios || body?.response?.scenarios || [];
  if (!Array.isArray(scenarios)) throw new HttpError(502, 'Make list scenarios response did not contain scenarios');
  const compact = scenarios.slice(0, 100).map((scenario) => ({
    id: Number(scenario?.id || 0),
    name: String(scenario?.name || ''),
    is_active: scenario?.isActive === true,
    scheduling_type: String(scenario?.scheduling?.type || ''),
    hook_id_present: scenario?.hookId != null,
    type: String(scenario?.type || ''),
  }));
  const onDemand = compact.filter((scenario) => scenario.scheduling_type === 'on-demand').slice(0, 30);
  const inputDetails = [];
  for (const scenario of onDemand) {
    try {
      const ifaceBody = await phase6MakeApiJson(env, `/scenarios/${scenario.id}/interface`, { method: 'GET' });
      const iface = ifaceBody?.interface || ifaceBody?.response?.interface || {};
      const input = Array.isArray(iface?.input) ? iface.input : [];
      inputDetails.push({
        id: scenario.id,
        name: scenario.name,
        is_active: scenario.is_active,
        input_count: input.length,
        inputs: input.slice(0, 20).map((item) => ({
          name: String(item?.name || ''),
          type: String(item?.type || ''),
          required: item?.required === true,
        })),
      });
    } catch (error) {
      inputDetails.push({
        id: scenario.id,
        name: scenario.name,
        is_active: scenario.is_active,
        input_count: null,
        inputs: [],
        interface_error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      });
    }
  }
  return {
    team_id: teamId,
    returned_count: compact.length,
    page_limit: 100,
    scenarios: compact,
    on_demand_with_interfaces: inputDetails,
  };
}

'''
    text = text.replace(anchor, helper + anchor, 1)

action_marker = 'if (action === "list_make_scenarios_compact") {'
if action_marker not in text:
    action_anchor = '  const action = repairString(input?.action, "action", 40).toLowerCase();\n'
    if action_anchor not in text:
        raise SystemExit('action anchor not found')
    block = '''  if (action === "list_make_scenarios_compact") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "LIST-MAKE-SCENARIOS-COMPACT-V1") throw new HttpError(400, "Compact Make scenario inventory confirmation is required");\n    const inventory = await repairListMakeScenariosCompact(env);\n    return respond(request, env, { ok: true, action, inventory });\n  }\n'''
    text = text.replace(action_anchor, action_anchor + block, 1)

path.write_text(text)
