import json

from r5.processor import _safe_preview_token, _stale_completion_error


def _output(*, job_id="job-current", status_url="https://render/status/job-current"):
    contract = {
        "visualRevision": 2,
        "visualSequenceHash": "vt1-current",
        "scriptRevision": 5,
        "scriptHash": "vs1-current",
    }
    settings = {
        "visual_timeline": {
            "revision": contract["visualRevision"],
            "sequence_hash": contract["visualSequenceHash"],
        },
        "visual_script": {
            "revision": contract["scriptRevision"],
            "script_hash": contract["scriptHash"],
        },
    }
    return {
        "id": "recOUTPUT",
        "fields": {
            "Remotion_Job_ID": job_id,
            "Remotion_Status_URL": status_url,
            "Remotion_Props_JSON": json.dumps({"studioRevision": contract}),
            "Studio_Creative_Settings_JSON": json.dumps(settings),
        },
    }


def test_r5_current_job_and_revision_can_finalize():
    output = _output()
    assert _stale_completion_error(
        output,
        expected_job_id="job-current",
        expected_status_url="https://render/status/job-current",
    ) is None


def test_r5_old_job_cannot_finalize_over_new_job():
    output = _output(job_id="job-new", status_url="https://render/status/job-new")
    error = _stale_completion_error(
        output,
        expected_job_id="job-old",
        expected_status_url="https://render/status/job-old",
    )
    assert error
    assert "stale render completion" in error.lower()


def test_r5_old_script_revision_cannot_finalize():
    output = _output()
    settings = json.loads(output["fields"]["Studio_Creative_Settings_JSON"])
    settings["visual_script"]["revision"] = 6
    settings["visual_script"]["script_hash"] = "vs1-new"
    output["fields"]["Studio_Creative_Settings_JSON"] = json.dumps(settings)
    error = _stale_completion_error(
        output,
        expected_job_id="job-current",
        expected_status_url="https://render/status/job-current",
    )
    assert error
    assert "render package is stale" in error.lower()


def test_r5_old_visual_revision_cannot_finalize():
    output = _output()
    settings = json.loads(output["fields"]["Studio_Creative_Settings_JSON"])
    settings["visual_timeline"]["revision"] = 3
    settings["visual_timeline"]["sequence_hash"] = "vt1-new"
    output["fields"]["Studio_Creative_Settings_JSON"] = json.dumps(settings)
    assert _stale_completion_error(
        output,
        expected_job_id="job-current",
        expected_status_url="https://render/status/job-current",
    )


def test_r5_preview_token_is_path_safe_and_job_specific():
    assert _safe_preview_token(" job/ABC:? 123 ") == "jobABC123"
