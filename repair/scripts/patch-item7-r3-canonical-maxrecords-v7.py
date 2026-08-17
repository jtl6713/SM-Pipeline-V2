#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-item7-r3-canonical-maxrecords-v7.py <worker.js>')
path=Path(sys.argv[1]); text=path.read_text(); marker='ITEM7_R3_CANONICAL_MAXRECORDS_V7'
if marker in text:
    print(f'{path}: already patched'); raise SystemExit(0)

# 1) Pulse path: establish/verify the canonical production batch size before exact seizure.
old='''  const originalSerialized = JSON.stringify(originalBlueprint);\n  const originalIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);\n  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);'''
new='''  // ITEM7_R3_CANONICAL_MAXRECORDS_V7: R3 production intentionally batches up to 10;\n  // the temporary exact Item 7 selector uses maxRecords=1 and must restore the\n  // canonical production value after every success, failure, retry, or cleanup.\n  const canonicalMaxRecords = scenarioId === 5557966 ? "10" : "1";\n  const originalSerialized = JSON.stringify(originalBlueprint);\n  const originalIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);\n  if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical maxRecords drifted; expected ${canonicalMaxRecords}`);\n  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);'''
if text.count(old)!=1: raise SystemExit(f'pulse canonical anchor count={text.count(old)}')
text=text.replace(old,new,1)

# 2) Pulse stranded-selector recovery: reconstruct R3's original maxRecords=10, not 1.
old='''    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);\n    recoveredRoot.mapper.formula = recoveredFormula;\n    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });'''
new='''    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);\n    recoveredRoot.mapper.formula = recoveredFormula;\n    recoveredRoot.mapper.maxRecords = scenarioId === 5557966 ? "10" : "1";\n    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });'''
if text.count(old)<1: raise SystemExit('stranded recovery anchor missing')
text=text.replace(old,new,1)
old='''    if (originalFormula !== recoveredFormula) throw new HttpError(502, `${config.stage} stranded selector recovery did not verify live`);\n    strandedSelectorRecovered = true;'''
new='''    if (originalFormula !== recoveredFormula || String(root?.mapper?.maxRecords || "") !== (scenarioId === 5557966 ? "10" : "1")) throw new HttpError(502, `${config.stage} stranded selector recovery did not verify live`);\n    strandedSelectorRecovered = true;'''
if text.count(old)!=1: raise SystemExit('stranded verify anchor missing')
text=text.replace(old,new,1)

# 3) Fresh cleanup: canonical branch must verify the production maxRecords; recovered branch restores it.
old='''  if (formula.includes('{Test_Run_ID}=BLANK()')) {\n    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical cleanup selector is missing Do_Not_Publish exclusion");\n    selectorRestored = true;\n    alreadyCanonical = true;'''
new='''  const canonicalMaxRecords = scenarioId === 5557966 ? "10" : "1";\n  if (formula.includes('{Test_Run_ID}=BLANK()')) {\n    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical cleanup selector is missing Do_Not_Publish exclusion");\n    if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical cleanup maxRecords drifted; expected ${canonicalMaxRecords}`);\n    selectorRestored = true;\n    alreadyCanonical = true;'''
if text.count(old)!=1: raise SystemExit('cleanup canonical anchor missing')
text=text.replace(old,new,1)
old='''    recoveredRoot.mapper.formula = recoveredFormula;\n    recoveredRoot.mapper.maxRecords = "1";\n    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });'''
new='''    recoveredRoot.mapper.formula = recoveredFormula;\n    recoveredRoot.mapper.maxRecords = canonicalMaxRecords;\n    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });'''
if text.count(old)!=1: raise SystemExit('cleanup maxRecords anchor missing')
text=text.replace(old,new,1)
old='''    selectorRestored = String(verifyRoot?.mapper?.formula || "") === recoveredFormula && String(verifyRoot?.mapper?.maxRecords || "") === "1" && verifyState.isActive === false;'''
new='''    selectorRestored = String(verifyRoot?.mapper?.formula || "") === recoveredFormula && String(verifyRoot?.mapper?.maxRecords || "") === canonicalMaxRecords && verifyState.isActive === false;'''
if text.count(old)!=1: raise SystemExit('cleanup verify anchor missing')
text=text.replace(old,new,1)

# 4) Standalone lease-free recovery: canonical R3 is 10, stranded exact is 1, restore 10.
old='''  const formula = String(root?.mapper?.formula || "");\n  if (String(root?.mapper?.maxRecords || "") !== "1") throw new HttpError(409, `${config.stage} selector maxRecords is not 1`);\n\n  if (formula.includes('{Test_Run_ID}=BLANK()')) {'''
new='''  const formula = String(root?.mapper?.formula || "");\n  const canonicalMaxRecords = scenarioId === 5557966 ? "10" : "1";\n\n  if (formula.includes('{Test_Run_ID}=BLANK()')) {\n    if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical selector maxRecords drifted; expected ${canonicalMaxRecords}`);'''
if text.count(old)!=1: raise SystemExit('standalone canonical anchor missing')
text=text.replace(old,new,1)
old='''  const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;'''
new='''  if (String(root?.mapper?.maxRecords || "") !== "1") throw new HttpError(409, `${config.stage} stranded exact selector maxRecords is not 1`);\n\n  const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;'''
# Replace only inside standalone function: first occurrence after standalone marker.
pos=text.index('// ITEM7_STANDALONE_SELECTOR_RECOVERY_V6')
idx=text.find(old,pos)
if idx<0: raise SystemExit('standalone exact anchor missing')
text=text[:idx]+text[idx:].replace(old,new,1)
old='''  patchedRoot.mapper.formula = canonical;\n  patchedRoot.mapper.maxRecords = "1";'''
new='''  patchedRoot.mapper.formula = canonical;\n  patchedRoot.mapper.maxRecords = canonicalMaxRecords;'''
# standalone occurrence should be unique after marker
pos=text.index('// ITEM7_STANDALONE_SELECTOR_RECOVERY_V6'); tail=text[pos:]
if tail.count(old)!=1: raise SystemExit(f'standalone patch max anchor count={tail.count(old)}')
text=text[:pos]+tail.replace(old,new,1)
old='''  const selectorRestored = afterState.isActive === false && String(verifyRoot?.mapper?.formula || "") === canonical && String(verifyRoot?.mapper?.maxRecords || "") === "1";'''
new='''  const selectorRestored = afterState.isActive === false && String(verifyRoot?.mapper?.formula || "") === canonical && String(verifyRoot?.mapper?.maxRecords || "") === canonicalMaxRecords;'''
if text.count(old)!=1: raise SystemExit('standalone verify max anchor missing')
text=text.replace(old,new,1)

# Health marker.
health='''          repair_item7_selector_recovery_v6_1: true,\n'''
if text.count(health)!=1: raise SystemExit('health marker anchor missing')
text=text.replace(health,health+'          repair_item7_r3_canonical_maxrecords_v7: true,\n',1)
path.write_text(text)
print(f'{path}: patched Item 7 R3 canonical maxRecords preservation v7')
