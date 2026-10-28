"""Activate only the already-shipped Chicago Reel review pilot via protected GitHub CI.

No user feedback, Remotion job, record enrollment, scheduling, Instagram upload or
publishing occurs in this script. Protects all existing Worker bindings.
"""
import json
import os
import secrets
import time
import urllib.error
import urllib.request

PILOT = "rec0uVrVeiUM6shp9"  # Airtable Platform Outputs #8447
STUDIO = "https://studio.chicagoshining.com"
RENDER = "https://render.chicagoshining.com"
RUNNER = "https://pipeline.chicagoshining.com"
ACCOUNT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CFTOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
OPSTOKEN = os.environ["OPS_TOKEN"]
ACCESS_ID = os.environ["CF_ACCESS_CLIENT_ID"]
ACCESS_SECRET = os.environ["CF_ACCESS_CLIENT_SECRET"]
API = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/chicagoshining-studio-api"
JOB_SECRET = secrets.token_urlsafe(48)
DISPATCH_SECRET = secrets.token_urlsafe(48)
FLAGS = [
    "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
    "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
    "RENDERING_REVIEW_INTEGRATION_VERIFIED",
    "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED",
    "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
    "RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED",
    "RENDERING_REVIEW_PRODUCER_WRITES_ENABLED",
    "RENDERING_REVIEW_FEEDBACK_WRITES_ENABLED",
    "RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED",
    "RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED",
    "RENDERING_REVIEW_JOB_CLAIM_ENABLED",
    "RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED",
    "RENDERING_REVIEW_COMPLETION_ENABLED",
    "RENDERING_REVIEW_EXACT_RENDER_TRIGGER_ENABLED",
    "RENDERING_REVIEW_IG_DISPATCH_CLAIM_ENABLED",
    "RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED",
]
def http(url, method="GET", body=None, headers=None, timeout=25):
    headers = dict(headers or {})
    if isinstance(body, dict):
        body = json.dumps(body, separators=(",", ":")).encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(131072)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(32768)

def json_request(url, method="GET", body=None, headers=None, codes=(200,)):
    code, raw = http(url, method, body, headers)
    if code not in codes:
        raise RuntimeError("Protected request failed: HTTP " + str(code))
    try:
        return json.loads(raw)
    except Exception as exc:
        raise RuntimeError("Protected endpoint did not return JSON") from exc

def cf(url, method="GET", body=None, codes=(200,)):
    return json_request(url, method, body,
        {"Authorization":"Bearer "+CFTOKEN}, codes)

def bindings():
    result = cf(API + "/settings")
    if result.get("success") is not True:
        raise RuntimeError("Cloudflare settings not authoritative")
    items = (result.get("result") or {}).get("bindings")
    if not isinstance(items, list) or not items:
        raise RuntimeError("Active Worker bindings unavailable")
    return items

def binding_map(items):
    return {b["name"]:dict(b) for b in items if b.get("name")}

def patch_worker(items):
    boundary = "chicago-" + secrets.token_hex(12)
    body = (("--"+boundary+"\r\nContent-Disposition: form-data; name=\"settings\"; filename=\"settings.json\"\r\n"
        "Content-Type: application/json\r\n\r\n").encode() +
        json.dumps({"bindings":items},separators=(",",":")).encode() +
        ("\r\n--"+boundary+"--\r\n").encode())
    code, raw = http(API+"/settings", "PATCH", body,
        {"Authorization":"Bearer "+CFTOKEN,
         "Content-Type":"multipart/form-data; boundary="+boundary}, 50)
    if code != 200:
        raise RuntimeError("Worker settings patch HTTP "+str(code))
    try: result=json.loads(raw)
    except Exception as exc: raise RuntimeError("Worker settings patch non-JSON") from exc
    if result.get("success") is not True:
        raise RuntimeError("Worker settings patch rejected")

def update_worker(allow_admission):
    live=binding_map(bindings())
    if live.get("AIRTABLE_BASE_ID",{}).get("text")!="appe33zkZn35yirTL":
        raise RuntimeError("Production Airtable base identity mismatch")
    for key in ("STUDIO_MEDIA","PIPELINE_RUNNER_SHARED_SECRET","PIPELINE_RUNNER_URL"):
        if key not in live:
            raise RuntimeError("Missing preserved critical Worker binding: "+key)
    for key in FLAGS:
        live[key]={"name":key,"type":"plain_text",
                   "text":"true" if key!="RENDERING_REVIEW_ENROLL_WRITES_ENABLED"
                   or allow_admission else "false"}
    live["RENDERING_REVIEW_EXACT_OUTPUT_ID"]={
        "name":"RENDERING_REVIEW_EXACT_OUTPUT_ID","type":"plain_text","text":PILOT}
    live["RENDERING_REVIEW_REMOTION_BASE_URL"]={
        "name":"RENDERING_REVIEW_REMOTION_BASE_URL","type":"plain_text","text":RENDER}
    for key,secret in (("RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET",JOB_SECRET),
                       ("RENDERING_REVIEW_DISPATCH_SHARED_SECRET",DISPATCH_SECRET)):
        live[key]={"name":key,"type":"secret_text","text":secret}
    patch_worker(list(live.values()))
    after=binding_map(bindings())
    if after.get("RENDERING_REVIEW_EXACT_OUTPUT_ID",{}).get("text")!=PILOT:
        raise RuntimeError("Exact pilot binding not visible after patch")
    for key in FLAGS:
        expected="true" if key!="RENDERING_REVIEW_ENROLL_WRITES_ENABLED" or allow_admission else "false"
        if after.get(key,{}).get("text")!=expected:
            raise RuntimeError("Worker binding readback mismatch: "+key)
    for key in ("RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET",
                "RENDERING_REVIEW_DISPATCH_SHARED_SECRET"):
        if after.get(key,{}).get("type")!="secret_text":
            raise RuntimeError("Worker independent secret missing: "+key)
    print("chicago_worker_configuration_verified=1 admission="+str(allow_admission).lower(),flush=True)

def ops_job(start):
    job=(start.get("job") or {}).get("id") or start.get("jobId")
    if not job:
        raise RuntimeError("Protected Ops job identity missing")
    for _ in range(100):
        state=json_request("https://ops.chicagoshining.com/api/jobs/"+str(job),
            headers={"Authorization":"Bearer "+OPSTOKEN})
        result=state.get("job") or {}
        status=result.get("status")
        if status=="ok":return
        if status=="failed":
            raise RuntimeError("Protected Ops action failed")
        time.sleep(4)
    raise RuntimeError("Protected Ops action not verified")

def configure_runner(dispatch_required):
    kv={
        "RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET":JOB_SECRET,
        "RENDERING_REVIEW_DISPATCH_SHARED_SECRET":DISPATCH_SECRET,
        "RENDERING_REVIEW_WORKER_BASE_URL":STUDIO,
        "STUDIO_RENDER_REVIEW_WORKER_URL":STUDIO,
        "RENDERING_REVIEW_REMOTION_BASE_URL":RENDER,
        "CF_ACCESS_CLIENT_ID":ACCESS_ID,
        "CF_ACCESS_CLIENT_SECRET":ACCESS_SECRET,
        "RENDERING_REVIEW_EXACT_OUTPUT_ID":PILOT,
        "RENDERING_REVIEW_EXACT_RENDER_ENABLED":"true",
        "RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED":"true",
        "RENDERING_REVIEW_IG_DISPATCH_CLAIM_REQUIRED":"true" if dispatch_required else "false",
    }
    ps=[
        "$ErrorActionPreference='Stop'",
        "$p=Join-Path (Get-Location) 'Services\\pipeline-runner\\service\\.env'",
        "if(-not (Test-Path -LiteralPath $p)){throw 'Runner environment missing'}",
        "$kv=@{}",
    ]
    for key,val in kv.items():
        ps.append("$kv['"+key+"']='"+val.replace("'","''")+"'")
    ps+= [
        "$lines=New-Object 'System.Collections.Generic.List[string]'",
        "$seen=@{}",
        "foreach($line in [IO.File]::ReadAllLines($p)){",
        "  if($line -match '^\\s*([A-Z][A-Z0-9_]*)\\s*='){",
        "    $k=$Matches[1]",
        "    if($kv.ContainsKey($k)){",
        "      if(-not $seen.ContainsKey($k)){$lines.Add($k+'='+$kv[$k]);$seen[$k]=$true}",
        "      continue",
        "    }",
        "  }",
        "  $lines.Add($line)",
        "}",
        "foreach($k in $kv.Keys){if(-not $seen.ContainsKey($k)){$lines.Add($k+'='+$kv[$k])}}",
        "$tmp=$p+'.chicago-review.tmp'",
        "$utf8=New-Object System.Text.UTF8Encoding($false)",
        "[IO.File]::WriteAllLines($tmp,$lines.ToArray(),$utf8)",
        "Move-Item -LiteralPath $tmp -Destination $p -Force",
        "Write-Output ('runner_review_keys_configured='+$kv.Count)",
    ]
    start=json_request("https://ops.chicagoshining.com/api/shell",
        method="POST",body={"command":"; ".join(ps),"confirm":True},
        headers={"Authorization":"Bearer "+OPSTOKEN},codes=(200,202))
    ops_job(start)
    start=json_request("https://ops.chicagoshining.com/api/run",
        method="POST",body={"action":"deploy","service":"pipeline-runner","confirm":True},
        headers={"Authorization":"Bearer "+OPSTOKEN},codes=(202,409))
    ops_job(start)
    status=json_request(RUNNER+"/health")
    if status.get("ok") is not True:
        raise RuntimeError("Runner health is not verified")
    print("chicago_runner_configured=1 dispatch_guard="+str(dispatch_required).lower(),flush=True)

def probe_no_write(path, secret, header):
    access={"CF-Access-Client-Id":ACCESS_ID,
            "CF-Access-Client-Secret":ACCESS_SECRET,
            header:secret,"Content-Type":"application/json"}
    code,_=http(STUDIO+path,"POST",b"{}",access)
    if code not in (400,415,422):
        raise RuntimeError("Protected no-write route preflight failed HTTP "+str(code)+" "+path)
    print("chicago_protected_no_write_route_verified="+path,flush=True)

def verify_ready():
    response=json_request(STUDIO+"/api/health",
        headers={"CF-Access-Client-Id":ACCESS_ID,
                 "CF-Access-Client-Secret":ACCESS_SECRET})
    rr=response.get("rendering_review") or {}
    if rr.get("admission_enabled") is not True or rr.get("integration_verified") is not True:
        raise RuntimeError("Custom-domain active Worker review flags not verified")
    code,raw=http(RUNNER+"/jobs/rendering-review/run-exact",
        "POST",b"{}",{"Content-Type":"application/json"})
    if code!=401:
        raise RuntimeError("Runner exact render route is not enabled and protected")
    print("chicago_exact_pilot_ready=1 output=8447 renders_created=0 instagram_posts_created=0",flush=True)

def fail_closed():
    try:
        # Keep all other Worker bindings intact. Disable admission and render
        # trigger without touching the original publishing/scheduling controls.
        current=binding_map(bindings())
        for key in ("RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
                    "RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED",
                    "RENDERING_REVIEW_EXACT_RENDER_TRIGGER_ENABLED"):
            current[key]={"name":key,"type":"plain_text","text":"false"}
        patch_worker(list(current.values()))
        print("chicago_review_worker_admission_disabled_after_error=1",flush=True)
    except Exception:
        print("chicago_review_worker_rollback_unverified=1",flush=True)
    try:
        configure_runner(False)
    except Exception:
        print("chicago_review_runner_guard_rollback_unverified=1",flush=True)

def main():
    if not all([ACCOUNT,CFTOKEN,OPSTOKEN,ACCESS_ID,ACCESS_SECRET]):
        raise RuntimeError("Required protected GitHub connections missing")
    before=binding_map(bindings())
    if before.get("RENDERING_REVIEW_ENROLL_WRITES_ENABLED",{}).get("text")=="true":
        if before.get("RENDERING_REVIEW_EXACT_OUTPUT_ID",{}).get("text")!=PILOT:
            raise RuntimeError("Another pilot is already active")
        print("Chicago review already active; refusing to rotate live credentials")
        return
    mutated=False
    try:
        configure_runner(False)
        mutated=True
        update_worker(False)
        for path,secret,header in (
            ("/api/internal/rendering-review/claim-render-job",JOB_SECRET,"X-Rendering-Review-Job-Secret"),
            ("/api/internal/rendering-review/launch-ledger",JOB_SECRET,"X-Rendering-Review-Job-Secret"),
            ("/api/internal/rendering-review/complete-attempt",JOB_SECRET,"X-Rendering-Review-Job-Secret"),
            ("/api/internal/rendering-review/ig-dispatch-claim",DISPATCH_SECRET,"X-Review-Dispatch-Token"),
        ):
            probe_no_write(path,secret,header)
        configure_runner(True)
        update_worker(True)
        verify_ready()
    except Exception:
        if mutated: fail_closed()
        raise

if __name__=="__main__":
    main()
