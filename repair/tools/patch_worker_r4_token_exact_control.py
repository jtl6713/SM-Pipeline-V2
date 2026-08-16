from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_anchor = '          repair_r4_exact_output_entry_v1: true,\n'
health_line = '          repair_r4_token_exact_entry_v1: true,\n'
if health_line not in text:
    if health_anchor not in text:
        raise SystemExit('R4 health anchor not found')
    text = text.replace(health_anchor, health_anchor + health_line, 1)

# Exact blueprint repair: retain R4's existing flow, but make Module 1 consume only
# a uniquely tokened Platform Output and make Module 2 clear that token immediately.
action_anchor = '  if (action === "repair_r4_exact_output_entry") {\n'
selector_block = '''  if (action === "repair_r4_token_selector") {\n    const confirm = repairString(input?.confirm, "confirm", 80);\n    if (confirm !== "REPAIR-R4-TOKEN-SELECTOR-V1") throw new HttpError(400, "Exact R4 token selector confirmation is required");\n    const repaired = await repairR4TokenSelector(env);\n    return respond(request, env, { ok: true, action, repaired });\n  }\n'''
if 'action === "repair_r4_token_selector"' not in text:
    if action_anchor not in text:
        raise SystemExit('R4 admin action anchor not found')
    text = text.replace(action_anchor, selector_block + action_anchor, 1)

# Lease-aware exact R4 one-run pulse. This path refuses any second render token,
# writes only to the allowlisted output, and closes/cleans its own lease.
pulse_anchor = '  if (action === "pulse_admin_bridge") {\n'
pulse_block = r'''  if (action === "pulse_r4_exact_output") {
    if (lease.scenario_id !== 5556716) throw new HttpError(403, "pulse_r4_exact_output is limited to R4 scenario 5556716");
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    if (lease.contract.deny_fixture_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
    }
    const target = await airtableFetch(env, "Platform Outputs", recordId);
    const fields = target?.fields || {};
    if (lease.contract.allow_public_publish !== true && fields.Do_Not_Publish !== true) {
      throw new HttpError(403, "R4 repair pulse requires Do_Not_Publish=true unless the lease explicitly allows publishing");
    }
    if (String(fields.Render_Status || "") !== "Ready for Render") throw new HttpError(409, "Target output is not Ready for Render");
    for (const required of ["Composition_ID", "Output_Filename", "Render_Clip_List_JSON", "Render_Total_Frames"]) {
      if (fields[required] === null || fields[required] === undefined || fields[required] === "" || fields[required] === 0) {
        throw new HttpError(409, `Target output is missing required R4 field ${required}`);
      }
    }
    const tokenedBefore = await listRecords(env, "Platform Outputs", { limit: 10, filterFormula: '{Studio_Render_Request_ID}!=""' });
    if (tokenedBefore.length) throw new HttpError(409, `R4 exact pulse refused because ${tokenedBefore.length} render request token(s) already exist`);

    await repairReserveBudget(env, lease, { operationCost: 8, runCost: 1, action });
    const token = lease.lease_id;
    let failure = null;
    let stop = null;
    let selectionConfirmed = false;
    try {
      await airtableFetch(env, "Platform Outputs", recordId, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Studio_Render_Request_ID: token }, typecast: true }),
      });
      const tokened = await listRecords(env, "Platform Outputs", { limit: 10, filterFormula: '{Studio_Render_Request_ID}!=""' });
      if (tokened.length !== 1 || tokened[0]?.id !== recordId || String(tokened[0]?.fields?.Studio_Render_Request_ID || "") !== token) {
        throw new HttpError(409, "R4 exact token uniqueness verification failed before scenario activation");
      }
      const before = await phase6ScenarioState(env, lease.scenario_id);
      if (!before.isActive) await phase6SetScenarioActive(env, lease.scenario_id, true);
      const execution = await phase6RunScenario(env, lease.scenario_id, null);
      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const current = await airtableFetch(env, "Platform Outputs", recordId);
        if (!String(current?.fields?.Studio_Render_Request_ID || "")) { selectionConfirmed = true; break; }
      }
      if (!selectionConfirmed) throw new HttpError(504, "R4 did not consume and clear the exact render token within 30 seconds");
      return { action, lease, platform_output_record_id: recordId, execution_id: execution.executionId, exact_selector_consumed: true };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 2); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      try { await repairClearR4LeaseToken(env, lease); } catch (cleanupError) {
        if (!failure) failure = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      }
      if (stop?.inactive !== true || failure) {
        try { await repairCloseLease(env, lease, "failed", { reason: "r4-exact-pulse-failed", scenario_stopped: stop?.inactive === true, error: failure || "R4 did not verify inactive" }); } catch {}
      } else {
        try { await repairCloseLease(env, lease, "released", { reason: "r4-exact-one-run-complete", scenario_stopped: true, exact_selector_consumed: selectionConfirmed, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

'''
if 'action === "pulse_r4_exact_output"' not in text:
    if pulse_anchor not in text:
        raise SystemExit('pulse_admin_bridge anchor not found')
    text = text.replace(pulse_anchor, pulse_block + pulse_anchor, 1)

# Watchdog/lease-close cleanup for any abandoned R4 token. Token value equals lease ID,
# so cleanup cannot erase another run's marker.
close_anchor = 'async function repairCloseLease(env, lease, status, resultPatch = {}) {\n'
cleanup_helper = r'''async function repairClearR4LeaseToken(env, lease) {
  if (Number(lease?.scenario_id) !== 5556716) return { cleared: 0 };
  const token = String(lease?.lease_id || lease?.contract?.lease_id || "");
  if (!token) return { cleared: 0 };
  const allowed = Array.isArray(lease?.contract?.allowed_platform_output_record_ids) ? lease.contract.allowed_platform_output_record_ids : [];
  let cleared = 0;
  for (const recordId of allowed) {
    const record = await airtableFetch(env, "Platform Outputs", recordId);
    if (String(record?.fields?.Studio_Render_Request_ID || "") !== token) continue;
    await airtableFetch(env, "Platform Outputs", recordId, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Studio_Render_Request_ID: "" }, typecast: true }),
    });
    cleared += 1;
  }
  return { cleared };
}

'''
if 'async function repairClearR4LeaseToken' not in text:
    if close_anchor not in text:
        raise SystemExit('repairCloseLease anchor not found')
    text = text.replace(close_anchor, cleanup_helper + close_anchor, 1)

close_body_anchor = 'async function repairCloseLease(env, lease, status, resultPatch = {}) {\n  if (!lease?.record_id) return;\n'
close_body_new = 'async function repairCloseLease(env, lease, status, resultPatch = {}) {\n  if (!lease?.record_id) return;\n  await repairClearR4LeaseToken(env, lease);\n'
if close_body_new not in text:
    if close_body_anchor not in text:
        raise SystemExit('repairCloseLease body anchor not found')
    text = text.replace(close_body_anchor, close_body_new, 1)

# Blueprint selector repair helper.
helper_anchor = 'function repairR4HooksArray(body) {\n'
helper = r'''async function repairR4TokenSelector(env) {
  const scenarioId = 5556716;
  const expectedNamePrefix = 'R4 - Start Remotion Render';
  const tokenFieldId = 'fld8BooS423HQr3KS';
  const broadFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';
  const exactFormula = 'AND({Studio_Render_Request_ID}!="",{Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';

  const stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, 'R4 must be OFF before token-selector repair');
  const scenarioName = String(stateBefore?.scenario?.name || '');
  if (!scenarioName.startsWith(expectedNamePrefix)) throw new HttpError(409, `R4 scenario name changed unexpectedly: ${scenarioName}`);

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== 'object') throw new HttpError(502, 'R4 live blueprint response did not contain a blueprint object');
  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const originalMap = repairR4ModuleMap(original);
  const module1 = originalMap.get(1);
  const module2 = originalMap.get(2);
  if (module1?.module !== 'airtable:ActionSearchRecords' || String(module1?.mapper?.maxRecords || '') !== '1') throw new HttpError(409, 'R4 module 1 no longer matches the approved SearchRecords baseline');
  if (module2?.module !== 'airtable:ActionUpdateRecords' || module2?.mapper?.id !== '{{1.id}}') throw new HttpError(409, 'R4 module 2 no longer consumes module 1 by record id');

  const currentFormula = String(module1?.mapper?.formula || '');
  const currentClear = module2?.mapper?.record?.[tokenFieldId] === '';
  if (currentFormula === exactFormula && currentClear) {
    return { scenario_id: scenarioId, scenario_name: scenarioName, already_repaired: true, changed_modules: [1,2], scenario_off_before: true, scenario_off_after: true };
  }
  if (currentFormula !== broadFormula) throw new HttpError(409, 'R4 module 1 selector no longer matches the approved broad-selector baseline');

  const patched = JSON.parse(JSON.stringify(original));
  const patchedMap = repairR4ModuleMap(patched);
  const p1 = patchedMap.get(1);
  const p2 = patchedMap.get(2);
  p1.mapper.formula = exactFormula;
  p1.metadata = p1.metadata || {};
  p1.metadata.designer = p1.metadata.designer || {};
  p1.metadata.designer.name = 'Find Exact Tokened Platform Output Ready for Render - Rerender Safe';
  p2.mapper.record = p2.mapper.record || {};
  p2.mapper.record[tokenFieldId] = '';

  if (patchedMap.size !== originalMap.size) throw new HttpError(500, 'R4 token-selector repair changed module count');
  for (const [id, module] of originalMap) {
    if (id === 1 || id === 2) continue;
    if (JSON.stringify(module) !== JSON.stringify(patchedMap.get(id))) throw new HttpError(500, `R4 token-selector repair changed unrelated module ${id}`);
  }
  const originalTop = JSON.parse(JSON.stringify(original)); delete originalTop.flow;
  const patchedTop = JSON.parse(JSON.stringify(patched)); delete patchedTop.flow;
  if (JSON.stringify(originalTop) !== JSON.stringify(patchedTop)) throw new HttpError(500, 'R4 token-selector repair changed unrelated blueprint metadata');

  let applied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: 'PATCH', body: JSON.stringify({ blueprint: JSON.stringify(patched) }) });
    applied = true;
    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
    const actual = after?.response?.blueprint || after?.blueprint;
    const actualMap = repairR4ModuleMap(actual);
    const a1 = actualMap.get(1), a2 = actualMap.get(2);
    if (String(a1?.mapper?.formula || '') !== exactFormula || a2?.mapper?.record?.[tokenFieldId] !== '') throw new HttpError(502, 'R4 exact token selector did not verify after write');
    if (actualMap.size !== originalMap.size) throw new HttpError(502, 'R4 post-write module count changed');
    for (const [id, module] of originalMap) {
      if (id === 1 || id === 2) continue;
      if (JSON.stringify(module) !== JSON.stringify(actualMap.get(id))) throw new HttpError(502, `R4 post-write verification found unrelated module change ${id}`);
    }
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, 'R4 became active during token-selector repair');
    return { scenario_id: scenarioId, scenario_name: scenarioName, changed_modules: [1,2], preserved_module_count: originalMap.size - 2, exact_formula: true, module2_clears_token: true, scenario_off_before: true, scenario_off_after: true, exact_postwrite_verification: true };
  } catch (error) {
    if (applied) {
      await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: 'PATCH', body: JSON.stringify({ blueprint: JSON.stringify(original) }) });
      const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
      const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
      const rolledState = await phase6ScenarioState(env, scenarioId);
      if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || rolledState?.isActive) throw new HttpError(500, 'R4 token-selector repair failed and rollback could not be verified');
    }
    throw error;
  }
}

'''
if 'async function repairR4TokenSelector' not in text:
    if helper_anchor not in text:
        raise SystemExit('R4 helper anchor not found')
    text = text.replace(helper_anchor, helper + helper_anchor, 1)

path.write_text(text)
