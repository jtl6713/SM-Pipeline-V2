from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_anchor = '          repair_make_module_inspector_v1: true,\n'
health_line = '          repair_r4_exact_output_entry_v1: true,\n'
if health_line not in text:
    if health_anchor not in text:
        raise SystemExit('health anchor not found')
    text = text.replace(health_anchor, health_anchor + health_line, 1)

helper_marker = 'async function repairR4ExactOutputEntry(env) {'
if helper_marker not in text:
    anchor = 'async function adminRepairControlStatus(request, env) {'
    if anchor not in text:
        raise SystemExit('adminRepairControlStatus anchor not found')
    helper = r'''
function repairR4FindModule(blueprint, moduleId) {
  const matches = [];
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      if (Number(node?.id) === Number(moduleId)) matches.push(node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  if (matches.length !== 1) throw new HttpError(409, `Expected exactly one R4 module ${moduleId}; found ${matches.length}`);
  return matches[0];
}

function repairR4ModuleMap(blueprint) {
  const map = new Map();
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      const id = Number(node?.id);
      if (!Number.isInteger(id) || map.has(id)) throw new HttpError(409, `R4 blueprint contains an invalid or duplicate module id: ${node?.id}`);
      map.set(id, node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  return map;
}

function repairR4HooksArray(body) {
  const hooks = body?.hooks || body?.response?.hooks || body?.result?.hooks || [];
  return Array.isArray(hooks) ? hooks : [];
}

async function repairR4ExactOutputEntry(env) {
  const scenarioId = 5556716;
  const expectedNamePrefix = 'R4 - Start Remotion Render';
  const hookName = 'R4 Exact Output Trigger';
  const outputTableId = 'tblrlPeboBthkplH0';
  const outputBaseId = 'appe33zkZn35yirTL';
  const expectedFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';

  const stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, 'R4 must be OFF before exact-output entrance repair');
  const scenarioName = String(stateBefore?.scenario?.name || '');
  if (!scenarioName.startsWith(expectedNamePrefix)) throw new HttpError(409, `R4 scenario name changed unexpectedly: ${scenarioName}`);
  const teamId = String(stateBefore?.scenario?.teamId || stateBefore?.scenario?.team?.id || '');
  if (!teamId) throw new HttpError(502, 'R4 scenario metadata did not expose teamId required for a dedicated webhook');

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== 'object') throw new HttpError(502, 'R4 live blueprint response did not contain a blueprint object');

  const existingMap = repairR4ModuleMap(liveBlueprint);
  const existing900 = existingMap.get(900);
  const existing1 = existingMap.get(1);
  if (!existing1) throw new HttpError(409, 'R4 module 1 is missing');

  if (existing900?.module === 'gateway:CustomWebHook' && existing1?.module === 'airtable:ActionGetRecord' && existing1?.mapper?.id === '{{900.output_record_id}}') {
    const hookId = Number(existing900?.parameters?.hook);
    if (!Number.isInteger(hookId) || hookId <= 0) throw new HttpError(409, 'R4 exact webhook module has an invalid hook id');
    const ping = await phase6MakeApiJson(env, `/hooks/${hookId}/ping`, { method: 'GET' });
    const pingBody = ping?.response || ping;
    const stateAlready = await phase6ScenarioState(env, scenarioId);
    if (stateAlready?.isActive) throw new HttpError(409, 'R4 became active during idempotent exact-entry verification');
    if (pingBody?.attached !== true) throw new HttpError(409, 'R4 exact webhook exists but is not attached');
    return {
      scenario_id: scenarioId,
      scenario_name: scenarioName,
      already_repaired: true,
      changed_modules: [900, 1],
      hook_id: hookId,
      hook_attached: true,
      hook_url_present: Boolean(pingBody?.address),
      scenario_off_before: true,
      scenario_off_after: true,
    };
  }

  if (existing900) throw new HttpError(409, 'R4 module 900 already exists but is not the approved exact-output webhook entrance');
  if (existing1?.module !== 'airtable:ActionSearchRecords') throw new HttpError(409, `R4 module 1 type changed unexpectedly: ${existing1?.module}`);
  if (String(existing1?.metadata?.designer?.name || '') !== 'Find One Platform Output Ready for Render - Rerender Safe - Cache Concurrency Guard') {
    throw new HttpError(409, 'R4 module 1 name changed unexpectedly');
  }
  if (String(existing1?.mapper?.formula || '') !== expectedFormula || String(existing1?.mapper?.maxRecords || '') !== '1') {
    throw new HttpError(409, 'R4 module 1 broad selector no longer matches the approved repair baseline');
  }
  const module2 = existingMap.get(2);
  if (module2?.module !== 'airtable:ActionUpdateRecords' || module2?.mapper?.id !== '{{1.id}}') {
    throw new HttpError(409, 'R4 module 2 no longer consumes module 1 by exact record id');
  }

  const hookListBody = await phase6MakeApiJson(
    env,
    `/hooks?teamId=${encodeURIComponent(teamId)}&typeName=gateway-webhook&viewForScenarioId=${scenarioId}`,
    { method: 'GET' },
  );
  const namedHooks = repairR4HooksArray(hookListBody).filter((h) => String(h?.name || '') === hookName);
  if (namedHooks.length > 1) throw new HttpError(409, `Found multiple Make hooks named ${hookName}`);
  let hook = namedHooks[0] || null;
  let hookCreated = false;
  if (!hook) {
    const created = await phase6MakeApiJson(env, '/hooks', {
      method: 'POST',
      body: JSON.stringify({ name: hookName, teamId, typeName: 'gateway-webhook', method: false, headers: false, stringify: false }),
    });
    hook = created?.hook || created?.response?.hook || created?.result?.hook || null;
    hookCreated = true;
  }
  const hookId = Number(hook?.id);
  if (!Number.isInteger(hookId) || hookId <= 0) {
    if (hookCreated && hook?.id) {
      try { await phase6MakeApiJson(env, `/hooks/${hook.id}?confirmed=true`, { method: 'DELETE' }); } catch {}
    }
    throw new HttpError(502, 'Make did not return a valid R4 exact webhook id');
  }

  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const patched = JSON.parse(JSON.stringify(liveBlueprint));
  if (!Array.isArray(patched.flow) || Number(patched.flow?.[0]?.id) !== 1) {
    if (hookCreated) try { await phase6MakeApiJson(env, `/hooks/${hookId}?confirmed=true`, { method: 'DELETE' }); } catch {}
    throw new HttpError(409, 'R4 module 1 is no longer the root entrance module');
  }
  const exactRecord = repairR4FindModule(patched, 1);
  const originalX = Number(exactRecord?.metadata?.designer?.x || 0);
  const originalY = Number(exactRecord?.metadata?.designer?.y || 0);
  exactRecord.module = 'airtable:ActionGetRecord';
  exactRecord.mapper = { id: '{{900.output_record_id}}', base: outputBaseId, table: outputTableId, useColumnId: false };
  exactRecord.metadata = { designer: { x: originalX, y: originalY, name: '1 - Get Exact Platform Output' } };
  const webhookModule = {
    id: 900,
    module: 'gateway:CustomWebHook',
    parameters: { hook: hookId, maxResults: 1 },
    mapper: {},
    metadata: {
      restore: { parameters: { hook: { data: { editable: 'true' }, label: 'R4 Exact Output Webhook' } } },
      designer: { x: originalX - 300, y: originalY, name: 'Webhook - R4 Exact Output Trigger' },
      parameters: [
        { name: 'hook', type: 'hook:gateway-webhook', label: 'Webhook', required: true },
        { name: 'maxResults', type: 'number', label: 'Maximum number of results' },
      ],
    },
  };
  patched.flow.unshift(webhookModule);

  const patchedMap = repairR4ModuleMap(patched);
  const originalMap = repairR4ModuleMap(original);
  if (patchedMap.size !== originalMap.size + 1) throw new HttpError(500, 'R4 exact-entry patch changed the module count unexpectedly');
  for (const [id, module] of originalMap) {
    if (id === 1) continue;
    if (JSON.stringify(module) !== JSON.stringify(patchedMap.get(id))) throw new HttpError(500, `R4 exact-entry patch changed unrelated module ${id}`);
  }
  const originalTop = JSON.parse(JSON.stringify(original)); delete originalTop.flow;
  const patchedTop = JSON.parse(JSON.stringify(patched)); delete patchedTop.flow;
  if (JSON.stringify(originalTop) !== JSON.stringify(patchedTop)) throw new HttpError(500, 'R4 exact-entry patch changed unrelated blueprint metadata');

  let applied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
      method: 'PATCH',
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    applied = true;
    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
    const actual = after?.response?.blueprint || after?.blueprint;
    if (!actual || typeof actual !== 'object') throw new HttpError(502, 'R4 post-write blueprint could not be read');
    const actualMap = repairR4ModuleMap(actual);
    const actual900 = actualMap.get(900);
    const actual1 = actualMap.get(1);
    if (actual900?.module !== 'gateway:CustomWebHook' || Number(actual900?.parameters?.hook) !== hookId) throw new HttpError(502, 'R4 exact webhook module did not verify');
    if (actual1?.module !== 'airtable:ActionGetRecord' || actual1?.mapper?.id !== '{{900.output_record_id}}' || actual1?.mapper?.base !== outputBaseId || actual1?.mapper?.table !== outputTableId) {
      throw new HttpError(502, 'R4 exact GetRecord module did not verify');
    }
    if (actualMap.size !== originalMap.size + 1) throw new HttpError(502, 'R4 post-write module count changed unexpectedly');
    for (const [id, module] of originalMap) {
      if (id === 1) continue;
      if (JSON.stringify(module) !== JSON.stringify(actualMap.get(id))) throw new HttpError(502, `R4 post-write verification found unrelated module change ${id}`);
    }
    const ping = await phase6MakeApiJson(env, `/hooks/${hookId}/ping`, { method: 'GET' });
    const pingBody = ping?.response || ping;
    if (pingBody?.attached !== true || !pingBody?.address) throw new HttpError(502, 'R4 exact webhook is not attached with a usable address');
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, 'R4 became active during exact-output entrance repair');
    return {
      scenario_id: scenarioId,
      scenario_name: scenarioName,
      changed_modules: [900, 1],
      preserved_module_count: originalMap.size - 1,
      hook_id: hookId,
      hook_created: hookCreated,
      hook_attached: true,
      hook_url_present: true,
      scenario_off_before: true,
      scenario_off_after: true,
      exact_postwrite_verification: true,
    };
  } catch (error) {
    if (applied) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
          method: 'PATCH',
          body: JSON.stringify({ blueprint: JSON.stringify(original) }),
        });
        const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
        const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
        const rolledState = await phase6ScenarioState(env, scenarioId);
        if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || rolledState?.isActive) throw new Error('R4 blueprint rollback verification failed');
      } catch (rollbackError) {
        throw new HttpError(500, `R4 exact-entry repair failed and blueprint rollback could not be verified: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    if (hookCreated) {
      try { await phase6MakeApiJson(env, `/hooks/${hookId}?confirmed=true`, { method: 'DELETE' }); } catch {}
    }
    throw error;
  }
}

'''
    text = text.replace(anchor, helper + anchor, 1)

action_marker = 'if (action === "repair_r4_exact_output_entry") {'
if action_marker not in text:
    action_anchor = '  const action = repairString(input?.action, "action", 40).toLowerCase();\n'
    if action_anchor not in text:
        raise SystemExit('admin repair action anchor not found')
    block = '''  if (action === "repair_r4_exact_output_entry") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "REPAIR-R4-EXACT-OUTPUT-ENTRY-V1") throw new HttpError(400, "Exact R4 entrance repair confirmation is required");\n    const repaired = await repairR4ExactOutputEntry(env);\n    return respond(request, env, { ok: true, action, repaired });\n  }\n'''
    text = text.replace(action_anchor, action_anchor + block, 1)

path.write_text(text)
