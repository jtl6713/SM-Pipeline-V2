#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-item7-r5-canonical-maxrecords-v8.py <worker.js>')
path = Path(sys.argv[1])
text = path.read_text()
marker = 'ITEM7_R5_CANONICAL_MAXRECORDS_V8'
if marker in text:
    print(f'{path}: already patched')
    raise SystemExit(0)

old = 'scenarioId === 5557966 ? "10" : "1"'
new = 'repairItem7CanonicalMaxRecords(scenarioId)'
count = text.count(old)
if count != 5:
    raise SystemExit(f'expected 5 canonical maxRecords anchors, found {count}')

helper = '''function repairItem7CanonicalMaxRecords(scenarioId) {
  const sid = Number(scenarioId);
  if (sid === 5557966) return "10";
  if (sid === 5565333) return "5";
  return "1";
}

'''
anchor = '// ITEM7_EXACT_STAGE_TEST_MODE_V1_BEGIN'
if text.count(anchor) != 1:
    raise SystemExit('ITEM7 exact stage anchor missing')
text = text.replace(anchor, helper + anchor, 1)
text = text.replace(old, new)
comment = '''  // ITEM7_R3_CANONICAL_MAXRECORDS_V7: R3 production intentionally batches up to 10;'''
replacement = '''  // ITEM7_R3_CANONICAL_MAXRECORDS_V7: R3 production intentionally batches up to 10;
  // ITEM7_R5_CANONICAL_MAXRECORDS_V8: R5 production intentionally batches up to 5;'''
if text.count(comment) != 1:
    raise SystemExit('R3 canonical comment anchor missing')
text = text.replace(comment, replacement, 1)

health = '          repair_item7_r3_canonical_maxrecords_v7: true,\n'
if text.count(health) != 1:
    raise SystemExit('health marker anchor missing')
text = text.replace(health, health + '          repair_item7_r5_canonical_maxrecords_v8: true,\n', 1)
path.write_text(text)
print(f'{path}: patched Item 7 R5 canonical maxRecords preservation v8')
