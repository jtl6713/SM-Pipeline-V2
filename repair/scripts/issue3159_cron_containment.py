"""Issue #3159: reversible emergency cron containment, no Worker release.

Production operation is deliberately limited to the exact Studio API script's
cron configuration. No database, provider, script source or binding writes.
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

TARGET = "chicagoshining-studio-api"
SNAPSHOT = Path("outage3159-before.json")
AFTER = Path("outage3159-after.json")

def schedules(response):
    if response.get("success") is not True:
        raise ValueError("Cloudflare schedule operation not verified")
    raw = response.get("result", {}).get("schedules")
    if not isinstance(raw, list):
        raise ValueError("missing schedule inventory")
    crons = []
    for item in raw:
        cron = item.get("cron") if isinstance(item, dict) else None
        if not isinstance(cron, str) or not cron.strip() or len(cron) > 200 or "\n" in cron:
            raise ValueError("invalid schedule inventory")
        crons.append(cron)
    if len(set(crons)) != len(crons):
        raise ValueError("duplicate schedule inventory")
    return sorted(crons)

def call(method, payload=None):
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not re.fullmatch(r"[0-9a-fA-F]{32}", account) or not token:
        raise RuntimeError("missing protected Cloudflare credentials")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{TARGET}/schedules"
    request = urllib.request.Request(url, method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

def capture(api=call, path=SNAPSHOT):
    prior = schedules(api("GET"))
    path.write_text(json.dumps({"target": TARGET, "crons": prior}, indent=2) + "\n")
    print("prior_crons=" + json.dumps(prior))
    return prior

def apply(api=call, snapshot=SNAPSHOT, after=AFTER):
    prior = json.loads(snapshot.read_text())
    if prior.get("target") != TARGET or not isinstance(prior.get("crons"), list):
        raise RuntimeError("invalid rollback snapshot")
    current = schedules(api("GET"))
    if current != prior["crons"]:
        raise RuntimeError("schedule inventory changed since snapshot; no write attempted")
    if current:
        try:
            # No retry, even after an ambiguous response: verify via GET.
            schedules(api("PUT", []))
        except Exception as exc:
            print("pause_write_response_unconfirmed=" + type(exc).__name__)
    observed = schedules(api("GET"))
    after.write_text(json.dumps({"target": TARGET, "crons": observed}, indent=2) + "\n")
    if observed:
        raise RuntimeError("cron pause NOT verified; do not automatically retry")
    print("verified_crons=[]; containment=cloudflare_scheduler_paused")
    if not current:
        print("already_empty=true; no mutation; use the original nonempty snapshot for restoration")
    return observed

def selftest():
    from tempfile import TemporaryDirectory
    from unittest.mock import Mock
    def result(crons):
        return {"success": True, "result": {"schedules": [{"cron": c} for c in crons]}}
    with TemporaryDirectory() as tmp:
        before, after = Path(tmp) / "before.json", Path(tmp) / "after.json"
        live = ["*/5 * * * *", "* * * * *"]
        api = Mock(side_effect=[result(live), result(live), result([]), result([])])
        capture(api, before)
        assert apply(api, before, after) == []
        assert api.call_args_list[2].args == ("PUT", [])
        assert json.loads(before.read_text())["crons"] == sorted(live)
        assert json.loads(after.read_text())["crons"] == []
        changed = Mock(side_effect=[result(["0 * * * *"])])
        try:
            apply(changed, before, after)
        except RuntimeError:
            pass
        else:
            raise AssertionError("changed inventory accepted")
        assert changed.call_count == 1
        ambiguous = Mock(side_effect=[result(live), TimeoutError(), result([])])
        assert apply(ambiguous, before, after) == []
        assert ambiguous.call_count == 3
        failed = Mock(side_effect=[result(live), TimeoutError(), result(live)])
        try:
            apply(failed, before, after)
        except RuntimeError:
            pass
        else:
            raise AssertionError("nonempty readback accepted")
        assert failed.call_count == 3
        empty = Mock(side_effect=[result([]), result([]), result([])])
        capture(empty, before)
        assert apply(empty, before, after) == []
        assert all(c.args == ("GET",) for c in empty.call_args_list)
    print("hermetic cron-containment tests PASS")

if __name__ == "__main__":
    action = sys.argv[1]
    if action == "selftest":
        selftest()
    elif action == "capture":
        capture()
    elif action == "apply":
        apply()
    else:
        raise SystemExit("invalid action")
