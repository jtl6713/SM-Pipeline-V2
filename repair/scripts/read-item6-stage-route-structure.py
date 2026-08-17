#!/usr/bin/env python3
import json,sys
TARGETS={
  5862882:{6},
  5612664:{9,14},
  5845193:{27,28,29},
  5791356:{7},
  5791396:{10},
  5806644:{24,34},
}
sid=int(sys.argv[1])
obj=json.load(sys.stdin)
bp=obj.get('blueprint') or (obj.get('response') or {}).get('blueprint') or obj
wanted=TARGETS.get(sid,set())
out=[]
def walk(flow,path):
    for idx,node in enumerate(flow or []):
        p=path+[f'flow[{idx}]']
        mid=node.get('id')
        if mid in wanted:
            out.append({
              'scenario_id':sid,
              'module_id':mid,
              'module':node.get('module'),
              'name':(((node.get('metadata') or {}).get('designer') or {}).get('name')),
              'path':'/'.join(p),
              'filter':node.get('filter'),
              'parent_path':'/'.join(path),
            })
        for ri,r in enumerate(node.get('routes') or []):
            walk(r.get('flow') or [],p+[f'routes[{ri}]'])
walk(bp.get('flow') or [],[])
print(json.dumps(out,indent=2))
