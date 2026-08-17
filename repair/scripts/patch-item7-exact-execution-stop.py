#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-exact-execution-stop.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()
marker = "ITEM7_EXACT_EXECUTION_STOP_V3"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

old_boundary = '''  return { executionId, body };
}

async function phase6WaitForScenarioExecution(env, scenarioId, executionId, timeoutMs = 90000, pollMs = 3000) {'''
new_boundary = '''  return { executionId, body };
}

async function phase6StopExactScenarioExecution(env, scenarioId, executionId) {
  if (!executionId) return { attempted: false, stopped: false, reason: "missing-execution-id" };
  try {
    const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/executions/${executionId}/stop`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    return { attempted: true, stopped: true, execution_id: executionId, body };
  } catch (error) {
    return {
      attempted: true,
      stopped: false,
      execution_id: executionId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function phase6WaitForScenarioExecution(env, scenarioId, executionId, timeoutMs = 90000, pollMs = 3000) {'''
if text.count(old_boundary) != 1:
    raise SystemExit(f"expected one phase6RunScenario boundary; found {text.count(old_boundary)}")
text = text.replace(old_boundary, new_boundary, 1)

old_loop = '''      // ITEM7_EXACT_STAGE_EXPLICIT_RUN_V2: activation alone does not prove a scheduled scenario executed.
      // Dispatch one explicit Make run for this already exact-addressed, maxRecords=1 leased cycle.
      await phase6RunScenario(env, scenarioId, null);
      observed = await repairWaitItem7Checkpoint(env, scenarioId, recordId, lease.test_run_id, config.wait_ms_per_cycle);
      stop = await phase6StopScenarioVerified(env, scenarioId, 6);
      if (stop?.inactive !== true) throw new HttpError(502, `${config.stage} did not verify inactive after exact cycle ${cycle}`);'''
new_loop = '''      // ITEM7_EXACT_STAGE_EXPLICIT_RUN_V2: activation alone does not prove a scheduled scenario executed.
      // ITEM7_EXACT_EXECUTION_STOP_V3: retain the exact execution id so shutdown can only force-stop
      // the execution created by this lease/cycle; never select or stop an unrelated execution.
      const exactRun = await phase6RunScenario(env, scenarioId, null);
      const exactExecutionId = exactRun.executionId;
      observed = await repairWaitItem7Checkpoint(env, scenarioId, recordId, lease.test_run_id, config.wait_ms_per_cycle);
      stop = await phase6StopScenarioVerified(env, scenarioId, 3);
      let exactExecutionStop = null;
      if (stop?.inactive !== true) {
        exactExecutionStop = await phase6StopExactScenarioExecution(env, scenarioId, exactExecutionId);
        stop = await phase6StopScenarioVerified(env, scenarioId, 6);
      }
      if (stop?.inactive !== true) {
        throw new HttpError(502, `${config.stage} did not verify inactive after exact cycle ${cycle}; execution_id=${exactExecutionId}; exact_execution_stop=${JSON.stringify(exactExecutionStop)}; scenario_stop=${JSON.stringify(stop)}`);
      }'''
if text.count(old_loop) != 1:
    raise SystemExit(f"expected one Item 7 explicit-run loop target; found {text.count(old_loop)}")
text = text.replace(old_loop, new_loop, 1)

old_health = "          repair_item7_explicit_run_stop_recovery_v2: true,\n"
new_health = old_health + "          repair_item7_exact_execution_stop_v3: true,\n"
if text.count(old_health) != 1:
    raise SystemExit(f"expected one Item 7 health marker; found {text.count(old_health)}")
text = text.replace(old_health, new_health, 1)

path.write_text(text)
print(f"{path}: patched Item 7 exact execution-aware shutdown")
