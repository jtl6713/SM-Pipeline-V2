"""#3159 stage 1: restore only the saved minute trigger with exact deployed proof."""
import json
import sys
from pathlib import Path
from unittest.mock import Mock
from issue3159_cron_containment import call, schedules

MINUTE = "* * * * *"
VERSION = "0.10.1050-staged-production-recovery-3159"

def apply(evidence, api=call):
    if not (evidence.get("http") == 200 and evidence.get("ok") is True
            and evidence.get("service") == "chicagoshining-studio-api"
            and evidence.get("version") == VERSION and evidence.get("active") is True
            and evidence.get("production_paused") is False
            and evidence.get("watermark_present") is True and evidence.get("resumed_at") is None):
        raise RuntimeError("exact staged runtime evidence absent; no mutation")
    if schedules(api("GET")) != []:
        raise RuntimeError("expected empty scheduler; no mutation")
    try:
        schedules(api("PUT", [{"cron": MINUTE}]))
    except Exception as exc:
        print("minute_restore_response_unconfirmed="+type(exc).__name__)
    observed = schedules(api("GET"))
    if observed != [MINUTE]:
        raise RuntimeError("minute restore NOT verified; do not retry blindly")
    print("verified_crons="+json.dumps(observed))
    return observed

def selftest():
    def response(values):
        return {"success": True, "result": {"schedules": [{"cron": c} for c in values]}}
    e = {"http": 200, "ok": True, "service": "chicagoshining-studio-api",
         "version": VERSION, "active": True, "production_paused": False,
         "watermark_present": True, "resumed_at": None}
    for key, value in [("active",False),("production_paused",True),("version","old"),("watermark_present",False),("resumed_at","x")]:
        api = Mock()
        try:
            apply(dict(e, **{key:value}), api)
        except RuntimeError:
            pass
        else:
            raise AssertionError("invalid proof accepted")
        api.assert_not_called()
    api=Mock(side_effect=[response([]),response([MINUTE]),response([MINUTE])])
    assert apply(e,api)==[MINUTE]
    assert api.call_args_list[1].args==("PUT",[{"cron":MINUTE}])
    api=Mock(side_effect=[response(["*/5 * * * *"])])
    try:
        apply(e,api)
    except RuntimeError:
        pass
    else:
        raise AssertionError("unexpected inventory accepted")
    assert api.call_count==1
    api=Mock(side_effect=[response([]),TimeoutError(),response([MINUTE])])
    assert apply(e,api)==[MINUTE] and api.call_count==3
    api=Mock(side_effect=[response([]),TimeoutError(),response([])])
    try:
        apply(e,api)
    except RuntimeError:
        pass
    else:
        raise AssertionError("failed restore accepted")
    assert api.call_count==3
    print("minute scheduler restoration tests PASS")

if __name__ == "__main__":
    if sys.argv[1]=="selftest":
        selftest()
    elif sys.argv[1]=="apply":
        apply(json.loads(Path(sys.argv[2]).read_text()))
    else:
        raise SystemExit("invalid action")
