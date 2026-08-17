#!/usr/bin/env python3
import json,re,sys

sid=int(sys.argv[1]); src=sys.argv[2]; dst=sys.argv[3]
wrapper=json.load(open(src))
bp=wrapper.get('blueprint') or (wrapper.get('response') or {}).get('blueprint') or wrapper

ORCHESTRATORS={5864632,5813561,5806668,5823581}
GUARD_MODULES={
  5862882:[2], 5612664:[2], 5845193:[20], 5791356:[2], 5791396:[2],
  5791424:[2], 5813463:[2], 5813487:[2], 5813511:[2], 5813534:[2],
  5806644:[2], 5806597:[2], 5823572:[2], 5830810:[4], 5830609:[10],
  5830616:[20], 5830623:[10,20],
}
TARGETS=set(ORCHESTRATORS)|set(GUARD_MODULES)
if sid not in TARGETS:
    raise SystemExit(f'unsupported scenario {sid}')

changes=[]

def walk(flow):
    for n in flow or []:
        yield n
        for r in n.get('routes') or []:
            yield from walk(r.get('flow') or [])

nodes=list(walk(bp.get('flow') or []))
by_id={int(n.get('id')):n for n in nodes if n.get('id') is not None}

def add_handoff_fields(n):
    mapper=n.get('mapper') or {}
    raw=mapper.get('jsonStringBodyContent')
    if not isinstance(raw,str) or 'output_record_id' not in raw:
        return False
    try:
        body=json.loads(raw)
    except Exception:
        return False
    out=body.get('output_record_id')
    if not isinstance(out,str):
        return False
    m=re.search(r'\{\{\s*(\d+)\.id\s*\}\}',out)
    if not m:
        return False
    source=m.group(1)
    wanted_tx=f'{{{{{source}.Replace_Transaction_ID}}}}'
    wanted_fp=f'{{{{{source}.Replace_Fingerprint}}}}'
    changed=False
    if body.get('replace_transaction_id') != wanted_tx:
        body['replace_transaction_id']=wanted_tx; changed=True
    if body.get('replace_fingerprint') != wanted_fp:
        body['replace_fingerprint']=wanted_fp; changed=True
    if changed:
        mapper['jsonStringBodyContent']=json.dumps(body,separators=(',',':'))
        n['mapper']=mapper
        changes.append({'module_id':n.get('id'),'name':((n.get('metadata') or {}).get('designer') or {}).get('name'),'change':'transaction_handoff_payload'})
    return changed

# Patch every exact-output HTTP handoff in both orchestrators and stage scenarios.
for n in nodes:
    if str(n.get('module','')).startswith('http:'):
        add_handoff_fields(n)

# Require webhook transaction/fingerprint to equal the exact Airtable record before any mutation/create/finalize step.
if sid in GUARD_MODULES:
    guard=[
      {'a':'{{ifempty(900.replace_transaction_id; emptystring)}}','b':'{{ifempty(1.Replace_Transaction_ID; emptystring)}}','o':'text:equal'},
      {'a':'{{ifempty(900.replace_fingerprint; emptystring)}}','b':'{{ifempty(1.Replace_Fingerprint; emptystring)}}','o':'text:equal'},
    ]
    for mid in GUARD_MODULES[sid]:
        n=by_id.get(mid)
        if not n: raise SystemExit(f'scenario {sid}: guard module {mid} missing')
        filt=n.get('filter') or {'name':f'Item6 transaction guard M{mid}','conditions':[[]]}
        conds=filt.get('conditions') or [[]]
        new=[]
        for group in conds:
            group=list(group or [])
            if not any('replace_transaction_id' in json.dumps(c).lower() for c in group):
                group.extend(json.loads(json.dumps(guard)))
            new.append(group)
        filt['conditions']=new
        base_name=filt.get('name') or f'M{mid}'
        if 'Item6 transaction-addressed' not in base_name:
            filt['name']=base_name+' | Item6 transaction-addressed'
        n['filter']=filt
        changes.append({'module_id':mid,'name':((n.get('metadata') or {}).get('designer') or {}).get('name'),'change':'transaction_entry_guard'})

# A replacement upload must never reuse the normal YouTube idempotency key.
if sid==5823572:
    n=by_id.get(10)
    if not n: raise SystemExit('YT0 module 10 missing')
    rec=(n.get('mapper') or {}).get('record') or {}
    wanted='YT-{{1.Output_ID}}-{{1.id}}-{{ifempty(1.Replace_Transaction_ID; "BASE")}}'
    if rec.get('YouTube_Idempotency_Key') != wanted:
        rec['YouTube_Idempotency_Key']=wanted
        n['mapper']['record']=rec
        changes.append({'module_id':10,'name':((n.get('metadata') or {}).get('designer') or {}).get('name'),'change':'replacement_scoped_youtube_idempotency_key'})

json.dump(bp,open(dst,'w'),separators=(',',':'))
print(json.dumps({'scenario_id':sid,'changes':changes},separators=(',',':')))
