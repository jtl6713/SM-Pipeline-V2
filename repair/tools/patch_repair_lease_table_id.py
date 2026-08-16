from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

start_marker = 'const REPAIR_LEASE_NOTE_PREFIX = "REPAIR_LEASE_V1";'
end_marker = 'function repairR4FindModule('
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('repair-control section markers not found')

prefix = text[:start]
section = text[start:end]
suffix = text[end:]

constant = 'const REPAIR_LEASE_TABLE_ID = "tbltuSt9UibYzxpah";'
if constant not in section:
    section = section.replace(start_marker, start_marker + '\n' + constant, 1)

needle = '"Make Admin Queue"'
count = section.count(needle)
if count < 4 or count > 8:
    raise SystemExit(f'unexpected Make Admin Queue reference count in repair-control section: {count}')
section = section.replace(needle, 'REPAIR_LEASE_TABLE_ID')

if needle in section:
    raise SystemExit('display-name lease table reference remains in repair-control section')
for required in (
    'async function repairLeaseRecords',
    'async function repairAcquireLease',
    'async function repairCloseLease',
    'async function repairConsumeLease',
):
    if required not in section:
        raise SystemExit(f'required repair function missing: {required}')

patched = prefix + section + suffix
if patched == text:
    raise SystemExit('patch made no change')
path.write_text(patched)
print(f'repair_control_table_refs_replaced={count}')
