#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-item7-rr1-canonical-maxrecords-v9.py <worker.js>')
path = Path(sys.argv[1])
text = path.read_text()
marker = 'ITEM7_RR1_CANONICAL_MAXRECORDS_V9'
if marker in text:
    print(f'{path}: already patched')
    raise SystemExit(0)

old = '''  if (sid === 5565333) return "5";
  return "1";
}'''
new = '''  if (sid === 5565333) return "5";
  if (sid === 5576363) return "10";
  return "1";
}'''
if text.count(old) != 1:
    raise SystemExit(f'helper anchor count={text.count(old)}')
text = text.replace(old, new, 1)

comment = '  // ITEM7_R5_CANONICAL_MAXRECORDS_V8: R5 production intentionally batches up to 5;'
replacement = '''  // ITEM7_R5_CANONICAL_MAXRECORDS_V8: R5 production intentionally batches up to 5;
  // ITEM7_RR1_CANONICAL_MAXRECORDS_V9: RR1 production intentionally batches up to 10;'''
if text.count(comment) != 1:
    raise SystemExit('comment anchor missing')
text = text.replace(comment, replacement, 1)

health = '          repair_item7_r5_canonical_maxrecords_v8: true,\n'
if text.count(health) != 1:
    raise SystemExit('health marker anchor missing')
text = text.replace(health, health + '          repair_item7_rr1_canonical_maxrecords_v9: true,\n', 1)
path.write_text(text)
print(f'{path}: patched Item 7 RR1 canonical maxRecords preservation v9')
