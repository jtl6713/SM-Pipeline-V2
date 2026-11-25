"""One bounded owner-authorized local cap-2 trial. Credentials remain on Ops host."""
import json
import os
import re
import sys
import time
import subprocess
import tempfile
from pathlib import Path

BASE = "https://ops.chicagoshining.com"
SCRIPTS = Path(".github/scripts")
class Rejected(RuntimeError): pass
class Ambiguous(RuntimeError): pass

def call(path, payload=None):
    token = os.environ["OPS_TOKEN"]
    # Use the same curl transport as the verified protected Ops workflows.
    with tempfile.TemporaryDirectory() as directory:
        out = Path(directory) / "reply.json"
        args = ["curl","-sS","--max-time","25","-o",str(out),"-w","%{http_code}",
                "-H","Authorization: Bearer "+token,BASE+path]
        if payload is not None:
            args.extend(["-X","POST","-H","Content-Type: application/json","--data-binary","@-"])
        try:
            result = subprocess.run(args,input=None if payload is None else json.dumps(payload),
                                    capture_output=True,text=True,timeout=30,check=False)
            if result.returncode or not result.stdout.isdigit():
                raise Ambiguous("ops_transport_unconfirmed")
            code = int(result.stdout)
            return code, json.loads(out.read_text()) if code in (200,202) else {}
        except Ambiguous:
            raise
        except Exception:
            raise Ambiguous("ops_transport_unconfirmed") from None

def authenticate():
    for name in ("OPS_TOKEN_A","OPS_TOKEN_B","OPS_TOKEN_C"):
        token = os.environ.get(name,"")
        if not token: continue
        os.environ["OPS_TOKEN"] = token
        code, body = call("/api/catalog")
        if code == 200 and body.get("ok") is True: return
        print("trial2670_ops_auth_http="+str(code),flush=True)
    raise Rejected("ops_auth")

def job(path, payload, timeout=900):
    for _ in range(30):
        code, receipt = call(path, payload)
        if code == 409:
            time.sleep(4)
            continue
        if code != 202:
            raise Rejected("ops_submit_http_" + str(code))
        ident = str(receipt.get("job", {}).get("id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", ident):
            raise Ambiguous("ops_job_id_unconfirmed")
        break
    else:
        raise Rejected("ops_busy")
    print("trial2670_ops_job=" + ident, flush=True)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        code, response = call("/api/jobs/" + ident)
        if code != 200:
            raise Ambiguous("ops_job_read_unconfirmed")
        result = response.get("job", {})
        if str(result.get("id", "")) != ident:
            raise Ambiguous("ops_job_identity_unconfirmed")
        if result.get("status") == "ok":
            return str(result.get("log", ""))
        if result.get("status") == "failed":
            raise Rejected("ops_job_failed")
        time.sleep(4)
    raise Ambiguous("ops_job_timeout_no_retry")

def shell(source):
    if not 100 < len(source) < 8000:
        raise Rejected("script_size")
    return job("/api/shell", {"command":source,"confirm":True}, 120)

def cap(mode):
    assert mode in ("stage","rollback","sample","verify_rollback","inspect")
    script = (SCRIPTS / "incident-2670-cap-two.ps1").read_text().replace("__MODE__", mode)
    log = shell(script)
    expected = {"stage":"CAP_2_STAGED", "rollback":"CAP_1_STAGED", "sample":"PASS_SAMPLE","verify_rollback":"CAP_1_LIVE_VERIFIED","inspect":"PASS_INSPECT"}[mode]
    markers = re.findall(r"(?m)^trial2670=([A-Z0-9_]+)\r?$",log)
    if markers != [expected]:
        safe = markers[-1] if markers and markers[-1] in ("FAILED_PREFLIGHT","FAILED_CONFIG_GUARDS","FAILED_LIVE_GUARDS","FAILED_CAP_COMPARE_AND_SWAP","FAILED_CAP_EXACT_LINE","FAILED_CAP_ENCODING","FAILED_CAP_EXCLUSIVE_OPEN","FAILED_CAP_LOCKED_COMPARE","FAILED_CAP_WRITE_UNCONFIRMED","FAILED_CAP_READBACK","FAILED_ROLLBACK_LIVE_READBACK") else "MISSING_RECEIPT"
        print("trial2670=" + safe,flush=True)
        # A failure during config write is uncertain until independently reconciled.
        if mode != "sample" and safe in ("FAILED_CAP_COMPARE_AND_SWAP","FAILED_CAP_WRITE_UNCONFIRMED","MISSING_RECEIPT"):
            raise Ambiguous("config_mutation_unconfirmed")
        raise Rejected("cap_guard")
    print("trial2670=" + expected,flush=True)
    if mode == "inspect":
        hits = re.findall(r"(?m)^trial2670_cap_readback=([12]):([12])\r?$",log)
        if len(hits) != 1: raise Rejected("cap_readback_missing")
        print("trial2670_cap_readback="+":".join(hits[0]),flush=True)
        return tuple(map(int,hits[0]))
    if mode in ("rollback","verify_rollback"):
        return None
    matches = re.findall(r"(?m)^trial2670_sample=(\{[^\r\n]*\})\r?$",log)
    if len(matches) != 1:
        raise Rejected("sample_missing")
    row = json.loads(matches[0])
    keys = ("cap","active","heavy","queued","paused","failures","requests","max_ms","read_cap","write_cap","photo_cap","ratio_cap")
    if any(type(row.get(k)) not in (int,float) for k in keys):
        raise Rejected("sample_invalid")
    print("trial2670_sample=" + json.dumps({k:row[k] for k in keys}),flush=True)
    return row

def memory():
    log = shell((SCRIPTS / "incident-2670-supabase-metrics-ops.ps1").read_text())
    if not re.search(r"(?m)^incident2670_metrics=PASS_TWO_READONLY_SAMPLES\r?$",log):
        raise Rejected("memory_probe_failed")
    row = {}
    for name in ("memory_available_mb","memory_used_pct","swap_used_pct"):
        hits = re.findall(r"(?m)^incident2670_"+name+r"=([0-9]+(?:\.[0-9]+)?)\r?$",log)
        if len(hits) != 1: raise Rejected("memory_sample_invalid")
        row[name] = float(hits[0])
    print("trial2670_memory="+json.dumps(row),flush=True)
    return row

def healthy(row, mem, baseline, before):
    return (row["cap"] == 2 and row["heavy"] <= 2 and row["failures"] == 0 and row["paused"] == 0
        and row["max_ms"] <= 5000 and all(row[k] == baseline[k] for k in ("read_cap","write_cap","photo_cap","ratio_cap"))
        and mem["memory_available_mb"] >= 400 and mem["memory_used_pct"] <= 80
        and mem["swap_used_pct"] <= before["swap_used_pct"] + 2)

def deploy():
    # Existing Ops deploy path performs a maintenance-token guarded drain.
    job("/api/run", {"action":"deploy","service":"pipeline-runner","confirm":True}, 1250)

def main():
    authenticate()
    if cap("inspect") != (1,1):
        raise Rejected("prior_cap_mutation_requires_reconciliation")
    baseline = cap("sample")
    before = memory()
    if baseline["cap"] != 1 or baseline["queued"] < 2 or before["memory_available_mb"] < 400 or before["memory_used_pct"] > 80:
        raise Rejected("baseline_not_safe")
    # Sync only before staging. No unreviewed checkout resets.
    job("/api/run", {"action":"sync","confirm":True},180)
    cap("stage")
    try:
        if cap("inspect") != (2,1):
            raise Ambiguous("staged_cap_readback_unexpected")
        deploy()
        seen_two = False
        for i in range(6):
            row = cap("sample")
            mem = memory()
            if not healthy(row,mem,baseline,before):
                raise Rejected("trial_threshold")
            seen_two |= row["active"] == 2
            if i < 5: time.sleep(45)
        if not seen_two: raise Rejected("two_active_not_observed")
        print("trial2670=CAP_2_OBSERVED_LOCAL_TRIAL",flush=True)
    except Ambiguous:
        # Never launch rollback while an accepted Ops job may still be running.
        print("trial2670=AMBIGUOUS_STOP_RECONCILE_NO_RETRY",flush=True)
        raise
    except Rejected:
        print("trial2670=TRIAL_FAILED_ROLLBACK",flush=True)
        cap("rollback")
        deploy()
        cap("verify_rollback")
        print("trial2670=CAP_1_ROLLBACK_VERIFIED",flush=True)
        raise

if __name__ == "__main__":
    try: main()
    except (Rejected,Ambiguous) as e:
        print("trial2670_stop="+str(e),flush=True)
        sys.exit(1)
    except Exception:
        print("trial2670_stop=unexpected_failure_reconcile",flush=True)
        sys.exit(1)
