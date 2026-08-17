#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-subrequest-reserve-v4.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()
marker = "ITEM7_SUBREQUEST_RESERVE_V4"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

old_wait = '''async function repairWaitItem7Checkpoint(env, scenarioId, recordId, testRunId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const record = await repairReadItem7Output(env, recordId, testRunId);
    const checkpoint = repairItem7StageCheckpoint(scenarioId, record.fields || {});
    last = { record, checkpoint };
    if (checkpoint.complete || checkpoint.failed) return last;
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  return last;
}
'''
new_wait = '''async function repairWaitItem7Checkpoint(env, scenarioId, recordId, testRunId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  // ITEM7_SUBREQUEST_RESERVE_V4: keep the long R2/R3/RR1 wait window, but cap
  // checkpoint reads so the same Worker invocation always has capacity left for
  // exact execution stop, scenario deactivation, selector rollback, verification,
  // and lease close. Six 15s reads cover the 90s window instead of ~15 6s reads.
  const pollMs = 15000;
  while (Date.now() < deadline) {
    const record = await repairReadItem7Output(env, recordId, testRunId);
    const checkpoint = repairItem7StageCheckpoint(scenarioId, record.fields || {});
    last = { record, checkpoint };
    if (checkpoint.complete || checkpoint.failed) return last;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
  }
  return last;
}
'''
if text.count(old_wait) != 1:
    raise SystemExit(f"expected exactly one Item7 checkpoint wait block; found {text.count(old_wait)}")
text = text.replace(old_wait, new_wait, 1)

old_stop = '''      stop = await phase6StopScenarioVerified(env, scenarioId, 3);
      let exactExecutionStop = null;
      if (stop?.inactive !== true) {
        exactExecutionStop = await phase6StopExactScenarioExecution(env, scenarioId, exactExecutionId);
        stop = await phase6StopScenarioVerified(env, scenarioId, 6);
      }
'''
new_stop = '''      // Reserve stop/rollback subrequests: one normal stop attempt first, then
      // exact execution force-stop and up to three verification attempts.
      stop = await phase6StopScenarioVerified(env, scenarioId, 1);
      let exactExecutionStop = null;
      if (stop?.inactive !== true) {
        exactExecutionStop = await phase6StopExactScenarioExecution(env, scenarioId, exactExecutionId);
        stop = await phase6StopScenarioVerified(env, scenarioId, 3);
      }
'''
if text.count(old_stop) != 1:
    raise SystemExit(f"expected exactly one Item7 stop block; found {text.count(old_stop)}")
text = text.replace(old_stop, new_stop, 1)

old_health = "          repair_item7_exact_execution_stop_v3: true,\n"
new_health = old_health + "          repair_item7_subrequest_reserve_v4: true,\n"
if text.count(old_health) != 1:
    raise SystemExit(f"expected one Item7 v3 health marker; found {text.count(old_health)}")
text = text.replace(old_health, new_health, 1)

path.write_text(text)
print(f"{path}: patched Item 7 subrequest reserve v4")
