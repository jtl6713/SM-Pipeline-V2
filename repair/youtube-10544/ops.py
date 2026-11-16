import os,json,time,urllib.request,urllib.error,base64,pathlib
base='https://ops.chicagoshining.com'
def request(path, token, body=None):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','User-Agent':'SM-Pipeline-Repair/1.0'})
 with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
token=None
for name in ('OPS_TOKEN_A','OPS_TOKEN_B','OPS_TOKEN_C'):
 candidate=os.environ.get(name,'')
 if not candidate:continue
 try:
  if request('/api/catalog',candidate).get('ok'):token=candidate;break
 except Exception:pass
if not token:raise RuntimeError('No working Ops credential')
script=base64.b64encode(pathlib.Path('repair/youtube-10544/inspect.cjs').read_bytes()).decode()
command="$code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+script+"')); $code | node -; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"
for attempt in range(36):
 try:
  start=request('/api/shell',token,{'command':command,'confirm':True});break
 except urllib.error.HTTPError as e:
  if e.code!=409:raise
  time.sleep(5)
else:raise RuntimeError('Ops busy')
id=start['job']['id']
for attempt in range(80):
 job=request('/api/jobs/'+id,token)['job']
 if job['status'] in ('ok','error','failed'):
  log=request('/api/jobs/'+id+'/log',token) if False else job
  print(json.dumps(log))
  if job['status']!='ok':raise RuntimeError('Inspection failed')
  break
 time.sleep(3)
else:raise RuntimeError('Inspection timed out')
