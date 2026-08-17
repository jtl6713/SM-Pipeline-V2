#!/usr/bin/env python3
import copy,json,sys

SID=int(sys.argv[1])
IN=sys.argv[2]
OUT=sys.argv[3]
obj=json.load(open(IN))
bp=obj.get('blueprint') or (obj.get('response') or {}).get('blueprint') or obj

TARGETS={
  5862882:[6],
  5612664:[9],
  5845193:[27],
  5791356:[7],
  5791396:[10],
  5806644:[24,34],
}
if SID not in TARGETS: raise SystemExit(f'Unsupported scenario {SID}')

REPLACE_EXIST={"a":"{{1.Replace_Transaction_ID}}","o":"exist"}
REPLACE_NOTEXIST={"a":"{{1.Replace_Transaction_ID}}","o":"notexist"}

FIELD_IDS={
 'Publish_Status':'fldViUkfcG57W6Es4',
 'Publish_Retry_Eligible':'fldzpYEi91KRcExxo',
 'Publish_Next_Retry_At':'fldo5fYYnLjdjM9j4',
 'Manual_Fallback_Required':'fld1OCWUJZoTRZe9A',
 'Replace_State':'fldQM3jp1nJvdUGMh',
 'Replace_Cleanup_State':'fldxtu8Rw9GFEdw6d',
 'Replace_Error':'fldqqEDWMZQ30O9IU',
 'Replace_Updated_At':'fld9o4V9hlpqh0aA5',
}

ERRORS={
 (5862882,6): 'Item6 replacement blocked automatic retry after an ambiguous Instagram Reel create result. A platform object may already exist; reconcile or clean up before retrying.',
 (5612664,9): 'Item6 replacement stopped after an ambiguous Instagram Story container-create result. A container may already exist; reconcile or clean up before retrying.',
 (5845193,27): 'Item6 replacement stopped after an ambiguous Instagram Story media_publish result. The Story may already be public; reconcile or clean up before retrying.',
 (5791356,7): 'Item6 replacement stopped after Instagram carousel media_publish failure. Automatic parent republish is blocked until the prior result is reconciled or cleaned up.',
 (5791396,10): 'Item6 replacement reconciliation exhausted without a unique carousel match. Automatic republish is blocked; manual cleanup/reconciliation is required.',
 (5806644,24): 'Item6 replacement stopped after ambiguous TikTok photo-draft initialization. A draft may already exist; automatic reinitialization is blocked until reconciled.',
 (5806644,34): 'Item6 replacement stopped after ambiguous TikTok video-draft initialization. A draft may already exist; automatic reinitialization is blocked until reconciled.',
}

def all_nodes(flow):
    for n in flow or []:
        yield n
        for r in n.get('routes') or []:
            yield from all_nodes(r.get('flow') or [])

used={int(n['id']) for n in all_nodes(bp.get('flow') or []) if isinstance(n.get('id'),int)}
next_id=max(used or {0})+1

# Return (routes_list, route_index, node) for a target node that is the only module in its route.
def find_target(flow,target):
    for n in flow or []:
        routes=n.get('routes') or []
        for ri,r in enumerate(routes):
            rf=r.get('flow') or []
            if any(x.get('id')==target for x in rf):
                if len(rf)!=1 or rf[0].get('id')!=target:
                    raise SystemExit(f'Scenario {SID} module {target} route is no longer isolated: {[x.get("id") for x in rf]}')
                return routes,ri,rf[0]
            got=find_target(rf,target)
            if got: return got
    return None

def add_guard(filter_obj,cond):
    f=copy.deepcopy(filter_obj or {})
    groups=f.get('conditions')
    if not isinstance(groups,list) or not groups:
        raise SystemExit('Target filter missing OR condition groups')
    for g in groups:
        if not isinstance(g,list): raise SystemExit('Unexpected filter condition shape')
        g.append(copy.deepcopy(cond))
    return f

def record_key(node,name):
    use_ids=bool((node.get('mapper') or {}).get('useColumnId'))
    return FIELD_IDS[name] if use_ids else name

def specialize(node,error_text):
    mapper=node.setdefault('mapper',{})
    rec=mapper.setdefault('record',{})
    rec[record_key(node,'Publish_Status')]='Failed'
    rec[record_key(node,'Publish_Retry_Eligible')]=False
    rec[record_key(node,'Publish_Next_Retry_At')]=None
    rec[record_key(node,'Manual_Fallback_Required')]=True
    rec[record_key(node,'Replace_State')]='Manual Cleanup Required'
    rec[record_key(node,'Replace_Cleanup_State')]='Manual Cleanup Required'
    rec[record_key(node,'Replace_Error')]=error_text
    rec[record_key(node,'Replace_Updated_At')]='{{now}}'
    if SID in (5791356,5791396):
        rec['IG_Carousel_Status']='Manual Fallback'
        rec['IG_Carousel_Next_Retry_At']=None
    if SID==5806644:
        rec['TikTok_Draft_Status']='Manual Fallback'
    return node

changes=[]
for target in TARGETS[SID]:
    found=find_target(bp.get('flow') or [],target)
    if not found: raise SystemExit(f'Scenario {SID} target module {target} not found')
    routes,ri,node=found
    original_filter=copy.deepcopy(node.get('filter'))
    node['filter']=add_guard(original_filter,REPLACE_NOTEXIST)
    newroute=copy.deepcopy(routes[ri])
    clone=newroute['flow'][0]
    clone['id']=next_id; next_id+=1
    clone['filter']=add_guard(original_filter,REPLACE_EXIST)
    d=((clone.setdefault('metadata',{}).setdefault('designer',{})))
    oldname=d.get('name') or f'Module {target}'
    d['name']=f'{oldname} - Item6 Replace Fail Closed'
    specialize(clone,ERRORS[(SID,target)])
    routes.append(newroute)
    changes.append({'source_module_id':target,'replacement_guard_module_id':clone['id'],'name':d['name']})

# Assert every target now has normal-path notexist and exactly one replacement clone with exist.
def cond_has(node,op):
    groups=((node.get('filter') or {}).get('conditions') or [])
    return bool(groups) and all(any(c.get('a')=='{{1.Replace_Transaction_ID}}' and c.get('o')==op for c in g) for g in groups)
for c in changes:
    src=next(n for n in all_nodes(bp.get('flow') or []) if n.get('id')==c['source_module_id'])
    clone=next(n for n in all_nodes(bp.get('flow') or []) if n.get('id')==c['replacement_guard_module_id'])
    if not cond_has(src,'notexist'): raise SystemExit(f'Normal guard missing on {c}')
    if not cond_has(clone,'exist'): raise SystemExit(f'Replacement guard missing on {c}')

json.dump(bp,open(OUT,'w'),separators=(',',':'))
print(json.dumps({'scenario_id':SID,'changes':changes,'blueprint_bytes':len(json.dumps(bp,separators=(",",":")))},separators=(',',':')))
