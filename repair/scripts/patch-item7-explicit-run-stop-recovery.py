#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-explicit-run-stop-recovery.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()

marker = "ITEM7_EXACT_STAGE_EXPLICIT_RUN_V2"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

old_loop = '''    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      cyclesRun = cycle;
      await phase6SetScenarioActive(env, scenarioId, true);
      observed = await repairWaitItem7Checkpoint(env, scenarioId, recordId, lease.test_run_id, config.wait_ms_per_cycle);
      stop = await phase6StopScenarioVerified(env, scenarioId, 4);
'''
new_loop = '''    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      cyclesRun = cycle;
      await phase6SetScenarioActive(env, scenarioId, true);
      // ITEM7_EXACT_STAGE_EXPLICIT_RUN_V2: activation alone does not prove a scheduled scenario executed.
      // Dispatch one explicit Make run for this already exact-addressed, maxRecords=1 leased cycle.
      await phase6RunScenario(env, scenarioId, null);
      observed = await repairWaitItem7Checkpoint(env, scenarioId, recordId, lease.test_run_id, config.wait_ms_per_cycle);
      stop = await phase6StopScenarioVerified(env, scenarioId, 6);
'''
if text.count(old_loop) != 1:
    raise SystemExit(f"expected exactly one Item 7 loop target; found {text.count(old_loop)}")
text = text.replace(old_loop, new_loop, 1)

old_stop = '''async function phase6StopScenarioVerified(env, scenarioId, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const before = await phase6ScenarioState(env, scenarioId);
      if (!before.isActive) return { inactive: true, attempts: attempt, already_inactive: true };
      await phase6SetScenarioActive(env, scenarioId, false);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const after = await phase6ScenarioState(env, scenarioId);
      if (!after.isActive) return { inactive: true, attempts: attempt + 1, already_inactive: false };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { inactive: false, attempts, error: lastError instanceof Error ? lastError.message : null };
}
'''
new_stop = '''async function phase6StopScenarioVerified(env, scenarioId, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let before = null;
    try {
      before = await phase6ScenarioState(env, scenarioId);
      if (!before.isActive) return { inactive: true, attempts: attempt, already_inactive: true };
    } catch (error) {
      lastError = error;
    }

    if (before?.isActive) {
      try {
        await phase6SetScenarioActive(env, scenarioId, false);
      } catch (error) {
        // Make can report a stop-side race (for example already stopped) while the
        // durable state is already inactive. Always verify state after the request.
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const after = await phase6ScenarioState(env, scenarioId);
      if (!after.isActive) {
        return {
          inactive: true,
          attempts: attempt + 1,
          already_inactive: false,
          stop_error: lastError instanceof Error ? lastError.message : null,
        };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { inactive: false, attempts, error: lastError instanceof Error ? lastError.message : null };
}
'''
if text.count(old_stop) != 1:
    raise SystemExit(f"expected exactly one stop helper target; found {text.count(old_stop)}")
text = text.replace(old_stop, new_stop, 1)

old_health = "          repair_item7_exact_stage_pulse_v1: true,\n"
new_health = old_health + "          repair_item7_explicit_run_stop_recovery_v2: true,\n"
if text.count(old_health) != 1:
    raise SystemExit(f"expected exactly one Item 7 health marker target; found {text.count(old_health)}")
text = text.replace(old_health, new_health, 1)

path.write_text(text)
print(f"{path}: patched Item 7 explicit run + robust stop recovery")
