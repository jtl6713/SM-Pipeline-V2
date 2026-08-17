#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv)!=2: raise SystemExit('usage: patch-item7-r4-exact-entry-drift-v8.py <worker.js>')
p=Path(sys.argv[1]); s=p.read_text(); marker='ITEM7_R4_EXACT_ENTRY_DRIFT_V8'
if marker in s:
    print(f'{p}: already patched'); raise SystemExit(0)
old='''  if (!migratingLegacyNullInput) {\n    if (existing1?.module !== 'airtable:ActionSearchRecords') throw new HttpError(409, `R4 module 1 type changed unexpectedly: ${existing1?.module}`);\n    if (String(existing1?.metadata?.designer?.name || '') !== 'Find One Platform Output Ready for Render - Rerender Safe - Cache Concurrency Guard') {\n      throw new HttpError(409, 'R4 module 1 name changed unexpectedly');\n    }\n    if (String(existing1?.mapper?.formula || '') !== expectedFormula || String(existing1?.mapper?.maxRecords || '') !== '1') {\n      throw new HttpError(409, 'R4 module 1 broad selector no longer matches the approved repair baseline');\n    }\n  }'''
new='''  if (!migratingLegacyNullInput) {\n    // ITEM7_R4_EXACT_ENTRY_DRIFT_V8: a later Test Mode hardening pass reintroduced\n    // SearchRecords while retaining the exact-entry module label. Accept only that\n    // known one-record drift (or the original approved broad selector) so the\n    // existing exact-entry migration can restore GetRecord without touching Modules 2+.\n    if (existing1?.module !== 'airtable:ActionSearchRecords') throw new HttpError(409, `R4 module 1 type changed unexpectedly: ${existing1?.module}`);\n    const liveName = String(existing1?.metadata?.designer?.name || '');\n    const approvedNames = new Set([\n      'Find One Platform Output Ready for Render - Rerender Safe - Cache Concurrency Guard',\n      '1 - Get Exact Platform Output',\n    ]);\n    if (!approvedNames.has(liveName)) throw new HttpError(409, `R4 module 1 name changed unexpectedly: ${liveName}`);\n    const testModeGuardedFormula = `AND({Test_Run_ID}=BLANK(),${expectedFormula})`;\n    const liveFormula = String(existing1?.mapper?.formula || '');\n    if (![expectedFormula, testModeGuardedFormula].includes(liveFormula) || String(existing1?.mapper?.maxRecords || '') !== '1') {\n      throw new HttpError(409, 'R4 module 1 selector no longer matches an approved exact-entry migration baseline');\n    }\n  }'''
if s.count(old)!=1: raise SystemExit(f'baseline guard anchor count={s.count(old)}')
s=s.replace(old,new,1)
health='''          repair_r4_exact_output_entry_v1: true,\n'''
if s.count(health)!=1: raise SystemExit('health marker anchor missing')
s=s.replace(health,health+'          repair_item7_r4_exact_entry_drift_v8: true,\n',1)
p.write_text(s)
print(f'{p}: patched R4 exact-entry drift recognition v8')
