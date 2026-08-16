import json, urllib.request, urllib.parse, urllib.error, time, datetime, hashlib, subprocess

BASE_ID='appe33zkZn35yirTL'
SETTINGS_TABLE='tblpHPWeEkyJaF7ql'
OUTPUTS_TABLE='tblrlPeboBthkplH0'
QUEUE_TABLE='tbltuSt9UibYzxpah'
OUTPUT_REC='recEIjeldw4lFvcYy'
OUTPUT_ID='157'
LEASE_REC='rec2xG6JOOXqBWdIi'
SID=5612096
OLD_FILE='11HDxHa8sGxwaQptMsrFLlaWFVBzXclc9'
NEW_FILE='1ovadWZG1QByiFYJ7kndyIUtT3nnCmPd3'
INVALID_FILE='AP0_INVALID_FILE_ID_20260816'
PUBLISHER_IDS=[5791537,5813561,5864632,5576757,5576753,5806668,5823581]
F_FINAL='fldWePFtTPPsyreQv'; F_URL='fldHHE9w1gQ9WeQYt'; F_NAME='fld42gDl967o76R7m'; F_READY='fldLCrDXKw1YY07hv'; F_ATT='fldGalqfXC2yfGflU'; F_ERR='fld0GDZbPTc49YqEv'
Q_STATUS='fldAqWSInuMDyP8E9'; Q_RESULT='fldduyTQgkdN6E1wI'; Q_PROCESSED='fldR1p1oNARJhxK4G'; Q_CLOSED='fldveY21atfYz8Laq'; Q_ERROR='fld6x1xtUD3CxmXdv'; Q_INPUT='fldXCOCIW3jS9J4uu'
pat=open('/tmp/pat.txt').read().strip()
evidence={'scenario_id':SID,'output_id':OUTPUT_ID,'output_record_id':OUTPUT_REC,'lease_record_id':LEASE_REC,'phases':{},'publisher_orchestrators_off_before':False,'publisher_orchestrators_off_after':False}
runs=0; ops=0; make_base=make_token=hook=None

def nowz(): return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')

def airtable_request(url, method='GET', data=None, acceptable=None, timeout=30):
    b=None if data is None else json.dumps(data).encode()
    h={'Accept':'application/json','Authorization':'Bearer '+pat}
    if b is not None: h['Content-Type']='application/json'
    req=urllib.request.Request(url,data=b,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r: raw=r.read(); code=r.status
    except urllib.error.HTTPError as e: code=e.code; raw=e.read()
    if acceptable is None: acceptable=range(200,300)
    if code not in acceptable: raise RuntimeError(f'Airtable HTTP {code}: '+raw[:400].decode(errors='replace'))
    try: parsed=json.loads(raw) if raw else None
    except Exception: parsed=raw.decode(errors='replace')
    return code,parsed

def curl_request(url, method='GET', headers=None, data=None, acceptable=None, timeout=60):
    args=['curl','-sS','--max-time',str(timeout),'-X',method,'-H','Accept: application/json']
    for k,v in (headers or {}).items(): args += ['-H',f'{k}: {v}']
    payload=None
    if data is not None:
        args += ['-H','Content-Type: application/json','--data-binary','@-']
        payload=json.dumps(data)
    args += ['-w','\n__HTTP__%{http_code}',url]
    p=subprocess.run(args,input=payload,text=True,capture_output=True)
    if p.returncode!=0: raise RuntimeError(f'curl transport failed rc={p.returncode}: '+p.stderr[:300])
    body,marker=p.stdout.rsplit('\n__HTTP__',1); code=int(marker.strip())
    if acceptable is None: acceptable=range(200,300)
    if code not in acceptable: raise RuntimeError(f'HTTP {code} for {method} endpoint: '+body[:400])
    try: parsed=json.loads(body) if body else None
    except Exception: parsed=body
    return code,parsed

def airtable_url(table, record=None):
    u=f'https://api.airtable.com/v0/{BASE_ID}/{table}'
    if record: u+=f'/{record}'
    return u+'?returnFieldsByFieldId=true'

def get_output():
    global ops; ops+=1
    return airtable_request(airtable_url(OUTPUTS_TABLE,OUTPUT_REC))[1]

def patch_output(fields):
    global ops; ops+=1
    return airtable_request(airtable_url(OUTPUTS_TABLE,OUTPUT_REC),'PATCH',{'fields':fields,'typecast':True})[1]

def lease_read():
    global ops; ops+=1
    return airtable_request(airtable_url(QUEUE_TABLE,LEASE_REC))[1]

def lease_write(state,status='Processing',error=''):
    global ops
    ops+=1
    fields={Q_STATUS:status,Q_RESULT:json.dumps({'kind':'REPAIR_LEASE_V1','state':state,'operations_used':ops,'runs_used':runs,'last_action':'ap0_revision_proof_v2','updated_at':nowz(),'scenario_stopped':True},separators=(',',':')),Q_PROCESSED:nowz()}
    if state in ('released','failed'): fields[Q_CLOSED]=nowz()
    if error: fields[Q_ERROR]=error[:900]
    airtable_request(airtable_url(QUEUE_TABLE,LEASE_REC),'PATCH',{'fields':fields,'typecast':True})

def load_settings():
    global ops
    ops+=1
    formula="OR({Setting_Name}='MAKE_API_TOKEN',{Setting_Name}='MAKE_API_BASE_URL',{Setting_Name}='AP0_WEBHOOK_URL')"
    qs=urllib.parse.urlencode({'filterByFormula':formula})
    d=airtable_request(f'https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{qs}')[1]
    vals={r.get('fields',{}).get('Setting_Name'):r.get('fields',{}).get('Setting_Value') for r in d.get('records',[]) if r.get('fields',{}).get('Active')}
    return str(vals['MAKE_API_BASE_URL']).rstrip('/'),str(vals['MAKE_API_TOKEN']).strip(),str(vals['AP0_WEBHOOK_URL']).strip()

def make_req(path,method='GET'):
    global ops; ops+=1
    return curl_request(make_base+path,method,{'Authorization':'Token '+make_token})

def scenario(sid):
    d=make_req(f'/scenarios/{sid}')[1]; return d.get('scenario') or d.get('response') or d

def assert_publishers_off():
    bad=[]
    for x in PUBLISHER_IDS:
        if scenario(x).get('isActive') is not False: bad.append(x)
    if bad: raise RuntimeError('Publishing orchestrators unexpectedly active: '+','.join(map(str,bad)))

def ensure_ap0_off():
    s=scenario(SID)
    if s.get('isActive') is True:
        try: make_req(f'/scenarios/{SID}/stop','POST')
        except Exception: pass
    for _ in range(8):
        if scenario(SID).get('isActive') is False: return
        time.sleep(1)
    raise RuntimeError('AP0 did not verify OFF')

def invoke(phase, accept_failure=False):
    global runs,ops
    l=lease_read(); lf=l.get('fields',{})
    contract=json.loads(lf.get(Q_INPUT) or '{}'); state=json.loads(lf.get(Q_RESULT) or '{}')
    if lf.get(Q_STATUS)!='Processing' or state.get('state')!='active': raise RuntimeError('Lease is not active')
    exp=datetime.datetime.fromisoformat(contract['expires_at'].replace('Z','+00:00'))
    if datetime.datetime.now(datetime.timezone.utc)>=exp: raise RuntimeError('Lease expired')
    if contract.get('scenario_id')!=SID or OUTPUT_REC not in contract.get('allowed_platform_output_record_ids',[]): raise RuntimeError('Lease target mismatch')
    if contract.get('allow_public_publish') is not False: raise RuntimeError('Lease unexpectedly allows publishing')
    if runs>=int(contract.get('max_runs',0)): raise RuntimeError('Lease run budget exhausted')
    if ops>=int(contract.get('max_operations',0)): raise RuntimeError('Lease operation budget exhausted')
    ensure_ap0_off(); assert_publishers_off()
    try:
        make_req(f'/scenarios/{SID}/start','POST')
        for _ in range(8):
            if scenario(SID).get('isActive') is True: break
            time.sleep(1)
        else: raise RuntimeError('AP0 did not verify ACTIVE')
        runs+=1; ops+=1
        code,_=curl_request(hook,'POST',data={'output_record_id':OUTPUT_REC},acceptable=range(200,600),timeout=60)
        evidence['phases'].setdefault(phase,{})['webhook_http_class']=f'{code//100}xx'
        if not accept_failure and code>=400: raise RuntimeError(f'{phase} webhook returned HTTP {code}')
    finally:
        try: make_req(f'/scenarios/{SID}/stop','POST')
        except Exception: pass
        ensure_ap0_off()
    lease_write('active')

def fields(rec): return rec.get('fields',{})

def poll(predicate,seconds=70):
    end=time.time()+seconds
    while time.time()<end:
        rec=get_output()
        if predicate(fields(rec)): return rec
        time.sleep(3)
    raise RuntimeError('Timed out waiting for expected Airtable state')

def url_reachable(url):
    if not url: return False
    p=subprocess.run(['curl','-sS','-L','--max-time','20','-r','0-0','-o','/dev/null','-w','%{http_code}',url],text=True,capture_output=True)
    if p.returncode!=0: return False
    try: code=int(p.stdout.strip()[-3:])
    except Exception: return False
    return code in (200,206)

def fingerprint(v): return hashlib.sha256(str(v).encode()).hexdigest()[:16] if v else None

try:
    make_base,make_token,hook=load_settings()
    l=lease_read(); contract=json.loads(l.get('fields',{}).get(Q_INPUT) or '{}')
    if contract.get('max_runs')!=4 or contract.get('allow_public_publish') is not False: raise RuntimeError('Unexpected proof lease contract')
    ensure_ap0_off(); assert_publishers_off(); evidence['publisher_orchestrators_off_before']=True

    patch_output({F_FINAL:OLD_FILE,F_URL:None,F_NAME:None,F_READY:None,F_ERR:None})
    att0=(fields(get_output()).get(F_ATT,0) or 0)
    invoke('baseline_stage')
    expected_old=f'platform-output-{OUTPUT_ID}-{OLD_FILE}.mp4'
    baseline=fields(poll(lambda f: f.get(F_NAME)==expected_old and bool(f.get(F_URL))))
    if (baseline.get(F_ATT,0) or 0)<=att0: raise RuntimeError('Baseline did not increment AP0 attempt count')
    baseline_url=baseline[F_URL]; baseline_ready=baseline.get(F_READY)
    if not url_reachable(baseline_url): raise RuntimeError('Baseline staged asset is not reachable')
    evidence['phases']['baseline_stage'].update({'passed':True,'asset_fingerprint':fingerprint(baseline_url),'revision_filename_match':True,'asset_reachable':True})

    unchanged_before=fields(get_output())
    invoke('unchanged_revision')
    time.sleep(5); unchanged_after=fields(get_output())
    same=(unchanged_after.get(F_ATT,0)==unchanged_before.get(F_ATT,0) and unchanged_after.get(F_URL)==unchanged_before.get(F_URL) and unchanged_after.get(F_NAME)==unchanged_before.get(F_NAME) and unchanged_after.get(F_READY)==unchanged_before.get(F_READY))
    if not same: raise RuntimeError('Unchanged revision unexpectedly restaged')
    evidence['phases']['unchanged_revision'].update({'passed':True,'attempt_count_unchanged':True,'asset_unchanged':True})

    patch_output({F_FINAL:NEW_FILE})
    if not url_reachable(baseline_url): raise RuntimeError('Baseline asset unavailable before revised stage')
    invoke('revised_success')
    expected_new=f'platform-output-{OUTPUT_ID}-{NEW_FILE}.mp4'
    revised=fields(poll(lambda f: f.get(F_NAME)==expected_new and bool(f.get(F_URL)) and f.get(F_URL)!=baseline_url))
    revised_url=revised[F_URL]; revised_ready=revised.get(F_READY)
    if not url_reachable(revised_url): raise RuntimeError('Revised staged asset is not reachable')
    if not url_reachable(baseline_url): raise RuntimeError('Baseline version was destroyed by revised stage')
    evidence['phases']['revised_success'].update({'passed':True,'new_asset_fingerprint':fingerprint(revised_url),'old_asset_fingerprint':fingerprint(baseline_url),'different_asset_url':True,'old_asset_still_reachable':True,'new_asset_reachable':True,'revision_filename_match':True})

    stable={'url':revised_url,'name':expected_new,'ready':revised_ready}
    patch_output({F_FINAL:INVALID_FILE})
    invoke('failed_revision',accept_failure=True)
    time.sleep(6); failed=fields(get_output())
    preserved=(failed.get(F_URL)==stable['url'] and failed.get(F_NAME)==stable['name'] and failed.get(F_READY)==stable['ready'])
    if not preserved: raise RuntimeError('Failed revision destroyed last-known-good asset metadata')
    if not url_reachable(revised_url): raise RuntimeError('Last-known-good revised object became unavailable after failed restage')
    evidence['phases']['failed_revision'].update({'passed':True,'last_good_metadata_preserved':True,'last_good_asset_reachable':True})

    patch_output({F_FINAL:NEW_FILE})
    assert_publishers_off(); evidence['publisher_orchestrators_off_after']=True
    ensure_ap0_off(); evidence['ap0_off_after']=True
    evidence['runs_used']=runs; evidence['operations_used']=ops
    evidence['all_passed']=all(p.get('passed') for p in evidence['phases'].values()) and runs==4
    if not evidence['all_passed']: raise RuntimeError('Proof phases did not all pass')
    lease_write('released','Succeeded')
    open('/tmp/ap0-revision-proof.json','w').write(json.dumps(evidence,indent=2,sort_keys=True))
    print(json.dumps(evidence,indent=2,sort_keys=True))
except Exception as e:
    try:
        if make_base and make_token: ensure_ap0_off()
    except Exception: pass
    evidence['all_passed']=False; evidence['error']=str(e)[:900]; evidence['runs_used']=runs; evidence['operations_used']=ops
    try: lease_write('failed','Failed',str(e))
    except Exception: pass
    open('/tmp/ap0-revision-proof.json','w').write(json.dumps(evidence,indent=2,sort_keys=True))
    print(json.dumps(evidence,indent=2,sort_keys=True))
    raise
