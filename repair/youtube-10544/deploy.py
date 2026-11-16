import json
import os
import time
import urllib.error
import urllib.request

OPS_BASE = "https://ops.chicagoshining.com"
EXPECTED_COMMIT = os.environ.get("GITHUB_SHA", "").strip()

def request(path, token, body=None):
    req = urllib.request.Request(
        OPS_BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "SM-Pipeline-Repair/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)

token = None
for name in ("OPS_TOKEN_A", "OPS_TOKEN_B", "OPS_TOKEN_C"):
    candidate = os.environ.get(name, "")
    if not candidate:
        continue
    try:
        if request("/api/catalog", candidate).get("ok"):
            token = candidate
            break
    except Exception:
        pass
if not token:
    raise RuntimeError("No working Ops credential")
if not EXPECTED_COMMIT or len(EXPECTED_COMMIT) != 40:
    raise RuntimeError("Missing GitHub deployment commit")

services = [
    ("pipeline-runner", "https://pipeline.chicagoshining.com", "2026-11-16-youtube-durable-dedup"),
    ("youtube-uploader", "https://youtube-upload.chicagoshining.com", "2026-11-16-engagement-durable-upload-dedup"),
    ("youtube-uploader-la", "https://youtube-upload-la.chicagoshining.com", "2026-11-16-engagement-durable-upload-dedup"),
    ("youtube-uploader-nyc", "https://youtube-upload-nyc.chicagoshining.com", "2026-11-16-engagement-durable-upload-dedup"),
    ("youtube-uploader-miami", "https://youtube-upload-miami.chicagoshining.com", "2026-11-16-engagement-durable-upload-dedup"),
]
for service, url, version in services:
    for attempt in range(120):
        try:
            start = request("/api/run", token, {
                "action": "deploy", "service": service, "confirm": True
            })
            break
        except urllib.error.HTTPError as error:
            if error.code != 409:
                raise
            time.sleep(5)
    else:
        raise RuntimeError("Ops busy: " + service)
    job = start["job"]
    if job.get("service") != service or job.get("action") != "deploy":
        raise RuntimeError("Wrong Ops job: " + service)
    for attempt in range(160):
        job = request("/api/jobs/" + job["id"], token)["job"]
        if job.get("status") in ("ok", "failed", "error"):
            break
        time.sleep(3)
    else:
        raise RuntimeError("Ops job timed out: " + service)
    if job.get("status") != "ok":
        raise RuntimeError("Deployment failed: " + service + " " + str(job.get("status")))
    log = str(job.get("log") or "")
    markers = [
        "PASS - controlled deployment completed and verified.",
        "PASS local health:",
        "PASS public health: " + url,
        "Commit:  " + EXPECTED_COMMIT,
    ]
    if service == "pipeline-runner":
        markers.append("PASS public health version=" + version)
    missing = [m for m in markers if m not in log]
    if missing:
        raise RuntimeError("Ops health/commit proof missing for " + service + ": " + repr(missing))
    # GitHub-hosted runners cannot reliably reach these Cloudflare routes.
    # The authorized Windows deployment host performs and logs the public probe.
    print(json.dumps({
        "service": service, "status": "verified", "commit": EXPECTED_COMMIT,
        "healthProvedBy": "ops-controlled-deployer", "expectedVersion": version,
    }), flush=True)
