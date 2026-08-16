import json, urllib.request, urllib.parse, urllib.error, time, datetime, hashlib, subprocess
BASE_ID='appe33zkZn35yirTL'; SETTINGS_TABLE='tblpHPWeEkyJaF7ql'; OUTPUTS_TABLE='tblrlPeboBthkplH0'; QUEUE_TABLE='tbltuSt9UibYzxpah'
OUTPUT_REC='recEIjeldw4lFvcYy'; OUTPUT_ID='157'; LEASE_REC='recpxAwOQThJ9bjid'; SID=5612096
NEW_FILE='1ovadWZG1QByiFYJ7kndyIUtT3nnCmPd3'; INVALID_FILE='AP0_INVALID_FILE_ID_20260816'
PUBLISHER_IDS={5791537,5813561,5864632,5576757,5576753,5806668,5823581}
F_FINAL='fldWePFtTPPsyreQv'; F_URL='fldHHE9w1gQ9WeQYt'; F_NAME='fld42gDl967o76R7m'; F_READY='fldLCrDXKw1YY07hv'; F_ATT='fldGalqfXC2yfGflU'
Q_STATUS='fldAqWSInuMDyP8E9'; Q_RESULT='fldduyTQgkdN6E1wI'; Q_PROCESSED='fldR1p1oNARJhxK4G'; Q_CLOSED='fldveY21atfYz8Laq'; Q_ERROR='fld6x1xtUD3CxmXdv'; Q_INPUT='fldXCOCIW3jS9J4uu'
pat=open('/tmp/pat.txt').read().strip(); make_base=make_token=hook=None; ops=0; runs=0
evidence={'scenario_id':SID,'output_id':OUTPUT_ID,'lease_record_id':LEASE_REC,'phase':'failed_revision_preservation'}

def nowz(): return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def areq(url,method='GET',data=None):
    b=None if data is None else json.dumps(data).encode(); h={'Accept':'application/json','Authorization':'Bearer '+pat}
    if b is not None: h['Content-Type']='application/json'
    req=urllib.request.Request(url,data=b,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r: raw=r.read(); code=r.status
    except urllib.error.HTTPError as e: code=e.code; raw=e.read()
    if not 200<=code<300: raise RuntimeError(f'Airtable HTTP {code}: '+raw[:300].decode(errors='replace'))
    return json.loads(raw) if raw else None
def curl(url,method='GET',headers=None,data=None,acceptable=None,timeout=45):
    a=['curl','-sS','--max-time',str(timeout),'-X',method,'-H','Accept: application/json']; payload=None
    for k,v in (headers or {}).items(): a += ['-H',f'{k}: {v}']
    if data is not None: a += ['-H','Content-Type: application/json','--data-binary','@-']; payload=json.dumps(data)
    a += ['-w','\n__HTTP__%{http_code}',url]
    p=subprocess.run(a,input=payload,text=True,capture_output=True)
    if p.returncode: raise RuntimeError('curl transport failure')
    body,marker=p.stdout.rsplit('\n__HTTP__',1); code=int(marker.strip()); acceptable=acceptable or range(200,300)
    if code not in acceptable: raise RuntimeError(f'HTTP {code}: '+body[:250])
    try: parsed=json.loads(body) if body else None
    except Exception: parsed=body
    return code,parsed
def aturl(table,rec=None): return f'https://api.airtable.com/v0/{BASE_ID}/{table}'+(f'/{rec}' if rec else '')+'?returnFieldsByFieldId=true'
def get_output():
    global ops; ops+=1; return areq(aturl(OUTPUTS_TABLE,OUTPUT_REC)).get('fields',{})
def patch_output(fields):
    global ops; ops+=1; return areq(aturl(OUTPUTS_TABLE,OUTPUT_REC),'PATCH',{'fields':fields,'typecast':True})
def lease_read():
    global ops; ops+=1; return areq(aturl(QUEUE_TABLE,LEASE_REC)).get('fields',{})
def lease_close(state,status,error=''):
    global ops; ops+=1
    f={Q_STATUS:status,Q_RESULT:json.dumps({'kind':'REPAIR_LEASE_V1','state':state,'operations_used':ops,'runs_used':runs,'last_action':'final_failure_preservation_v1','updated_at':nowz(),'scenario_stopped':True},separators=(',',':')),Q_PROCESSED:nowz(),Q_CLOSED:nowz()}
    if error: f[Q_ERROR]=error[:800]
    areq(aturl(QUEUE_TABLE,LEASE_REC),'PATCH',{'fields':f,'typecast':True})
def load_settings():
    global ops; ops+=1
    q=urllib.parse.urlencode({'filterByFormula':"OR({Setting_Name}='MAKE_API_TOKEN',{Setting_Name}='MAKE_API_BASE_URL',{Setting_Name}='AP0_WEBHOOK_URL')"})
    d=areq(f'https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{q}'); vals={r.get('fields',{}).get('Setting_Name'):r.get('fields',{}).get('Setting_Value') for r in d.get('records',[]) if r.get('fields',{}).get('Active')}
    return str(vals['MAKE_API_BASE_URL']).rstrip('/'),str(vals['MAKE_API_TOKEN']).strip(),str(vals['AP0_WEBHOOK_URL']).strip()
def mreq(path,method='GET',acceptable=None):
    global ops; ops+=1; return curl(make_base+path,method,{'Authorization':'Token '+make_token},acceptable=acceptable)
def sc(d): return d.get('scenario') or d.get('response') or d
def list_team(team):
    d=mreq(f'/scenarios?teamId={team}&pg%5Blimit%5D=100')[1]; return d.get('scenarios') or (d.get('response') or {}).get('scenarios') or d.get('data') or []
def assert_publishers(rows):
    bad=[r.get('id') for r in rows if int(r.get('id') or 0) in PUBLISHER_IDS and r.get('isActive') is not False]
    if bad: raise RuntimeError('Publishing orchestrators active: '+','.join(map(str,bad)))
def logs():
    d=mreq(f'/scenarios/{SID}/logs?pg%5Blimit%5D=12')[1]; return d.get('scenarioLogs') or []
def wait_auto(before,seconds=25):
    end=time.time()+seconds
    while time.time()<end:
        for x in logs():
            if x.get('type')=='auto' and str(x.get('id')) not in before: return str(x.get('id'))
        time.sleep(2.5)
    raise RuntimeError('No AP0 auto execution appeared')
def wait_terminal(eid,seconds=35):
    end=time.time()+seconds
    while time.time()<end:
        code,d=mreq(f'/scenarios/{SID}/executions/{eid}',acceptable=range(200,500))
        if code==200:
            x=d.get('execution') or d.get('response') or d; s=str(x.get('status') or '').upper()
            if s and s not in ('RUNNING','PROCESSING','PENDING','QUEUED'): return s
        time.sleep(3)
    raise RuntimeError('AP0 execution did not terminate')
def ensure_off():
    s=sc(mreq(f'/scenarios/{SID}')[1])
    if s.get('isActive') is True:
        try: mreq(f'/scenarios/{SID}/stop','POST')
        except Exception: pass
        time.sleep(1)
        s=sc(mreq(f'/scenarios/{SID}')[1])
    if s.get('isActive') is not False: raise RuntimeError('AP0 not OFF')
    return s

def reachable(url):
    p=subprocess.run(['curl','-sS','-L','--max-time','15','-r','0-0','-o','/dev/null','-w','%{http_code}',url],text=True,capture_output=True)
    try: return p.returncode==0 and int(p.stdout.strip()[-3:]) in (200,206)
    except Exception: return False

try:
    lf=lease_read(); contract=json.loads(lf.get(Q_INPUT) or '{}'); state=json.loads(lf.get(Q_RESULT) or '{}')
    if lf.get(Q_STATUS)!='Processing' or state.get('state')!='active' or contract.get('max_runs')!=1 or contract.get('allow_public_publish') is not False: raise RuntimeError('Invalid final proof lease')
    if OUTPUT_REC not in contract.get('allowed_platform_output_record_ids',[]): raise RuntimeError('Lease target mismatch')
    make_base,make_token,hook=load_settings()
    s=ensure_off(); team=s.get('teamId') or s.get('team_id'); rows=list_team(team); assert_publishers(rows)
    stable=get_output(); expected=f'platform-output-{OUTPUT_ID}-{NEW_FILE}.mp4'
    if stable.get(F_FINAL)!=INVALID_FILE or stable.get(F_NAME)!=expected or not stable.get(F_URL) or not stable.get(F_READY): raise RuntimeError('Stable revised asset state not ready for failure proof')
    stable_url,stable_name,stable_ready=stable[F_URL],stable[F_NAME],stable[F_READY]
    if not reachable(stable_url): raise RuntimeError('Last-known-good revised asset not reachable before failure proof')
    before={str(x.get('id')) for x in logs() if x.get('type')=='auto'}
    mreq(f'/scenarios/{SID}/start','POST'); time.sleep(1); active=sc(mreq(f'/scenarios/{SID}')[1])
    if active.get('isActive') is not True: raise RuntimeError('AP0 did not verify ACTIVE')
    runs=1; ops+=1; code,_=curl(hook,'POST',data={'output_record_id':OUTPUT_REC},acceptable=range(200,600))
    if code>=400: raise RuntimeError(f'Webhook HTTP {code}')
    eid=wait_auto(before); status=wait_terminal(eid)
    try: mreq(f'/scenarios/{SID}/stop','POST')
    except Exception: pass
    time.sleep(1); ensure_off()
    after=get_output(); preserved=after.get(F_URL)==stable_url and after.get(F_NAME)==stable_name and after.get(F_READY)==stable_ready
    if not preserved: raise RuntimeError('Failed revision changed last-known-good staged asset metadata')
    if not reachable(stable_url): raise RuntimeError('Last-known-good revised asset unavailable after failed revision')
    patch_output({F_FINAL:NEW_FILE}); rows2=list_team(team); assert_publishers(rows2)
    evidence.update({'passed':True,'execution_terminal_status':status,'execution_failed_as_expected':status!='SUCCESS','last_good_metadata_preserved':True,'last_good_asset_reachable':True,'publisher_orchestrators_off_before':True,'publisher_orchestrators_off_after':True,'ap0_off_after':True,'runs_used':runs,'operations_used':ops,'asset_fingerprint':hashlib.sha256(stable_url.encode()).hexdigest()[:16]})
    lease_close('released','Succeeded'); open('/tmp/ap0-failure-preservation-proof.json','w').write(json.dumps(evidence,indent=2,sort_keys=True)); print(json.dumps(evidence,indent=2,sort_keys=True))
except Exception as e:
    try:
        if make_base and make_token: ensure_off()
    except Exception: pass
    evidence.update({'passed':False,'error':str(e)[:800],'runs_used':runs,'operations_used':ops})
    try: lease_close('failed','Failed',str(e))
    except Exception: pass
    open('/tmp/ap0-failure-preservation-proof.json','w').write(json.dumps(evidence,indent=2,sort_keys=True)); print(json.dumps(evidence,indent=2,sort_keys=True)); raise
