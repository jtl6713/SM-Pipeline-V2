from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_anchor = '          repair_make_scenario_inventory_v1: true,\n'
health_line = '          repair_make_start_scenario_probe_v1: true,\n'
if health_line not in text:
    if health_anchor not in text:
        raise SystemExit('health anchor not found')
    text = text.replace(health_anchor, health_anchor + health_line, 1)

helper_marker = 'async function repairProbeMakeStartScenarioSchema(env) {'
if helper_marker not in text:
    anchor = 'async function repairListMakeScenariosCompact(env) {'
    if anchor not in text:
        raise SystemExit('inventory anchor not found')
    helper = r'''
function repairProbeModuleIndex(blueprint) {
  const found = [];
  const walk = (flow, routePath = []) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      found.push({
        id: Number(node?.id || 0),
        module: String(node?.module || ''),
        version: node?.version ?? null,
        name: String(node?.metadata?.designer?.name || ''),
        parameters: repairInspectorClone(node?.parameters || {}),
        mapper: repairInspectorClone(node?.mapper || {}),
        route_path: routePath,
      });
      const routes = Array.isArray(node?.routes) ? node.routes : [];
      routes.forEach((route, index) => walk(route?.flow, [...routePath, { parent_module_id: node?.id, route_index: index }]));
    }
  };
  walk(blueprint?.flow);
  return found;
}

async function repairProbeMakeStartScenarioSchema(env) {
  const anchorState = await phase6ScenarioState(env, 5556716);
  const teamId = Number(anchorState?.scenario?.teamId || anchorState?.scenario?.team?.id || 0);
  if (!Number.isInteger(teamId) || teamId <= 0) throw new HttpError(502, 'Make scenario metadata did not expose a usable teamId');

  const evidence = {
    team_id: teamId,
    template_catalog: { attempted: true, accessible: false, templates_scanned: 0, scenario_service_modules: [], error: null },
    scratch: { created: false, deleted: false, scenario_id: null, interface_set: false, scheduling_type: 'on-demand', modules_after_interface: [] },
  };

  try {
    const list = await phase6MakeApiJson(
      env,
      '/templates/public?usedApps%5B%5D=scenario-service&pg%5Blimit%5D=20&pg%5Boffset%5D=0',
      { method: 'GET' },
    );
    const templates = list?.templatesPublic || list?.response?.templatesPublic || [];
    if (Array.isArray(templates)) {
      evidence.template_catalog.accessible = true;
      const moduleMap = new Map();
      for (const template of templates.slice(0, 20)) {
        const templateUrl = String(template?.url || '');
        if (!templateUrl) continue;
        try {
          const bpBody = await phase6MakeApiJson(env, `/templates/public/${encodeURIComponent(templateUrl)}/blueprint`, { method: 'GET' });
          const bp = bpBody?.blueprint || bpBody?.response?.blueprint;
          if (!bp || typeof bp !== 'object') continue;
          evidence.template_catalog.templates_scanned += 1;
          for (const mod of repairProbeModuleIndex(bp)) {
            if (!/scenario/i.test(mod.module) && !/scenario/i.test(mod.name)) continue;
            const key = `${mod.module}|${mod.version}|${mod.name}`;
            if (!moduleMap.has(key)) moduleMap.set(key, mod);
          }
        } catch {}
      }
      evidence.template_catalog.scenario_service_modules = [...moduleMap.values()].slice(0, 40);
    }
  } catch (error) {
    evidence.template_catalog.error = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
  }

  const scratchName = `REPAIR-SCRATCH-START-SCENARIO-PROBE-${Date.now()}`;
  const scratchBlueprint = {
    name: scratchName,
    flow: [],
    metadata: {
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: false,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false,
      },
      designer: { orphans: [] },
    },
  };

  let scratchId = null;
  try {
    const created = await phase6MakeApiJson(env, '/scenarios?confirmed=true', {
      method: 'POST',
      body: JSON.stringify({
        blueprint: JSON.stringify(scratchBlueprint),
        teamId,
        scheduling: JSON.stringify({ type: 'on-demand' }),
      }),
    });
    scratchId = Number(created?.scenario?.id || created?.response?.scenario?.id || 0);
    if (!Number.isInteger(scratchId) || scratchId <= 0) throw new HttpError(502, 'Make scratch scenario creation did not return an id');
    evidence.scratch.created = true;
    evidence.scratch.scenario_id = scratchId;

    const iface = await phase6MakeApiJson(env, `/scenarios/${scratchId}/interface`, {
      method: 'PATCH',
      body: JSON.stringify({
        interface: {
          input: [{ name: 'output_record_id', type: 'text', default: null, required: true, multiline: false }],
          output: null,
        },
      }),
    });
    const ifaceObj = iface?.interface || iface?.response?.interface || {};
    evidence.scratch.interface_set = Array.isArray(ifaceObj?.input) && ifaceObj.input.some((item) => item?.name === 'output_record_id');

    const after = await phase6MakeApiJson(env, `/scenarios/${scratchId}/blueprint?draft=false`, { method: 'GET' });
    const bp = after?.response?.blueprint || after?.blueprint;
    evidence.scratch.modules_after_interface = repairProbeModuleIndex(bp || {}).slice(0, 20);
  } finally {
    if (Number.isInteger(scratchId) && scratchId > 0) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scratchId}`, { method: 'DELETE' });
        evidence.scratch.deleted = true;
      } catch (error) {
        evidence.scratch.delete_error = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      }
    }
  }

  if (evidence.scratch.created && !evidence.scratch.deleted) throw new HttpError(500, 'Disposable Make scratch scenario could not be verified deleted');
  return evidence;
}

'''
    text = text.replace(anchor, helper + anchor, 1)

action_marker = 'if (action === "probe_make_start_scenario_schema") {'
if action_marker not in text:
    action_anchor = '  const action = repairString(input?.action, "action", 40).toLowerCase();\n'
    if action_anchor not in text:
        raise SystemExit('action anchor not found')
    block = '''  if (action === "probe_make_start_scenario_schema") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "PROBE-MAKE-START-SCENARIO-SCHEMA-V1") throw new HttpError(400, "Start Scenario schema probe confirmation is required");\n    const probe = await repairProbeMakeStartScenarioSchema(env);\n    return respond(request, env, { ok: true, action, probe });\n  }\n'''
    text = text.replace(action_anchor, action_anchor + block, 1)

path.write_text(text)
