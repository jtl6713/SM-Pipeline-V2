#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-item7-selector-recovery-v6-1.py <worker.js>")

path = Path(sys.argv[1])
text = path.read_text()
marker = "ITEM7_SELECTOR_RECOVERY_V6_1"
if marker in text:
    print(f"{path}: already patched")
    raise SystemExit(0)

old = '''  const output = await repairVerifyOutputRecord(env, recordId, false, testRunId);
  if (output?.fields?.Do_Not_Publish !== true) throw new HttpError(409, "Standalone selector recovery requires Do_Not_Publish=true on the exact test output");

  const beforeState = await phase6ScenarioState(env, scenarioId);'''
new = '''  // ITEM7_SELECTOR_RECOVERY_V6_1: repairVerifyOutputRecord already enforces the
  // exact Test_Run_ID and Do_Not_Publish=true when allowPublicPublish=false.
  // Its return value is a normalized projection (not the raw Airtable fields),
  // so do not redundantly re-read output.fields.Do_Not_Publish here.
  await repairVerifyOutputRecord(env, recordId, false, testRunId);

  const beforeState = await phase6ScenarioState(env, scenarioId);'''
if text.count(old) != 1:
    raise SystemExit(f"expected exactly one redundant v6 DNP check; found {text.count(old)}")
text = text.replace(old, new, 1)

health = "          repair_item7_standalone_selector_recovery_v6: true,\n"
if text.count(health) != 1:
    raise SystemExit(f"expected one v6 health marker; found {text.count(health)}")
text = text.replace(health, health + "          repair_item7_selector_recovery_v6_1: true,\n", 1)

path.write_text(text)
print(f"{path}: patched Item 7 selector recovery v6.1")
