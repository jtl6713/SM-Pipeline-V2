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

services=[('pipeline-runner','https://pipeline.chicagoshining.com','2026-11-16-youtube-durable-dedup'),('youtube-uploader','https://youtube-upload.chicagoshining.com','2026-11-15-durable-upload-dedup'),('youtube-uploader-la','https://youtube-upload-la.chicagoshining.com','2026-11-15-durable-upload-dedup'),('youtube-uploader-nyc','https://youtube-upload-nyc.chicagoshining.com','2026-11-15-durable-upload-dedup'),('youtube-uploader-miami','https://youtube-upload-miami.chicagoshining.com','2026-11-15-durable-upload-dedup')]
for service,url,version in services:
 for attempt in range(120):
  try:
   start=request('/api/run',token,{'action':'deploy','service':service,'confirm':True});break
  except urllib.error.HTTPError as e:
   if e.code!=409:raise
   time.sleep(5)
 else:raise RuntimeError('Ops busy')
 job=start['job'];assert job['service']==service and job['action']=='deploy'
 for attempt in range(160):
  job=request('/api/jobs/'+job['id'],token)['job']
  if job['status'] in ('ok','failed','error'):break
  time.sleep(3)
 print(json.dumps({'service':service,'job':job}),flush=True)
 if job['status']!='ok':raise RuntimeError('Deployment failed')
 for attempt in range(24):
  try:
   with urllib.request.urlopen(url+'/health',timeout=20) as response:health=json.load(response)
   if health.get('version')==version or health.get('serviceVersion')==version:break
  except Exception:pass
  time.sleep(5)
 else:raise RuntimeError('Version verification failed '+service+' '+str(health))
 print(json.dumps({'service':service,'verifiedVersion':version}),flush=True)
