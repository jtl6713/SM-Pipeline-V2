from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()
old = '''async function phase6PulseInactiveScenario(env, scenarioId, outputRecordId, predicate, waitMs = 9000) {
  const before = await phase6ScenarioState(env, scenarioId);
  let started = false;
  let observed = { matched: false, record: await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId) };
  let cleanup = null;
  try {
    // Phase 6 owns short controlled pulses. If a previous request left this scenario active,
    // stop it first so /start creates exactly one fresh execution and no interval schedule is left behind.
    if (before.isActive) await phase6StopScenarioVerified(env, scenarioId, 3);
    await phase6SetScenarioActive(env, scenarioId, true);
    started = true;
    observed = await phase6WaitForOutputStatus(env, outputRecordId, predicate, waitMs, 1000);
    return { started, observed, was_active: before.isActive };
  } finally {
    cleanup = await phase6StopScenarioVerified(env, scenarioId, 4);
    if (!cleanup.inactive) console.error(`Phase 6 could not restore scenario ${scenarioId} inactive`, cleanup);
  }
}'''
new = '''async function phase6PulseInactiveScenario(env, scenarioId, outputRecordId, predicate, waitMs = 9000) {
  const before = await phase6ScenarioState(env, scenarioId);
  if (before.isActive) {
    throw new HttpError(409, `Phase 6 refuses to pulse active scenario ${scenarioId}; an unrelated execution may own it`);
  }

  let eligible = [];
  if (Number(scenarioId) === PHASE6_R4_SCENARIO_ID) {
    eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 3,
      filterFormula: 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)',
    });
  } else if (Number(scenarioId) === PHASE6_R5_SCENARIO_ID) {
    eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 6,
      view: 'R5 - Rendering Jobs to Poll',
    });
  }

  if (eligible.length) {
    if (eligible.length !== 1 || eligible[0]?.id !== outputRecordId) {
      throw new HttpError(409, `Phase 6 exact pulse isolation blocked scenario ${scenarioId}; eligible outputs=${eligible.map((row) => row.id).join(',') || 'none'}, requested=${outputRecordId}`);
    }
  } else if ([PHASE6_R4_SCENARIO_ID, PHASE6_R5_SCENARIO_ID].includes(Number(scenarioId))) {
    throw new HttpError(409, `Phase 6 exact pulse isolation found no eligible output for scenario ${scenarioId}; requested=${outputRecordId}`);
  }

  let started = false;
  let observed = { matched: false, record: await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId) };
  let cleanup = null;
  try {
    await phase6SetScenarioActive(env, scenarioId, true);
    started = true;
    observed = await phase6WaitForOutputStatus(env, outputRecordId, predicate, waitMs, 1000);
    return { started, observed, was_active: false, exact_selector_isolation: true, eligible_count: eligible.length };
  } finally {
    cleanup = await phase6StopScenarioVerified(env, scenarioId, 4);
    if (!cleanup.inactive) console.error(`Phase 6 could not restore scenario ${scenarioId} inactive`, cleanup);
  }
}'''
if text.count(old) != 1:
    raise SystemExit(f'expected exactly one original phase6PulseInactiveScenario block, found {text.count(old)}')
text = text.replace(old, new, 1)
for required in (
    'Phase 6 refuses to pulse active scenario',
    "view: 'R5 - Rendering Jobs to Poll'",
    'eligible.length !== 1 || eligible[0]?.id !== outputRecordId',
    'exact_selector_isolation: true',
    'phase6StopScenarioVerified(env, scenarioId, 4)',
):
    if required not in text:
        raise SystemExit(f'missing required isolation contract: {required}')
path.write_text(text)
print('phase6_exact_pulse_isolation_patch=applied')
