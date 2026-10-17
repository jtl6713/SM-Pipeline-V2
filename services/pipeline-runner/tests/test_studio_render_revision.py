import json

from render.studio_revision import (
    current_studio_revision,
    render_job_revision_error,
    render_package_revision_error,
)


def _output(*, visual_revision=3, visual_hash="vt1-abc", script_revision=7, script_hash="vs1-def"):
    settings = {
        "visual_timeline": {
            "revision": visual_revision,
            "sequence_hash": visual_hash,
        },
        "visual_script": {
            "revision": script_revision,
            "script_hash": script_hash,
        },
    }
    contract = {
        "visualRevision": visual_revision,
        "visualSequenceHash": visual_hash,
        "scriptRevision": script_revision,
        "scriptHash": script_hash,
    }
    return {
        "id": "recOUTPUT",
        "fields": {
            "Studio_Creative_Settings_JSON": json.dumps(settings),
            "Creative_Render_Manifest_JSON": json.dumps({"studioRevision": contract}),
            "Remotion_Props_JSON": json.dumps({"studioRevision": contract}),
        },
    }


def test_current_studio_revision_reads_visual_and_script_authority():
    assert current_studio_revision(_output()) == {
        "visualRevision": 3,
        "visualSequenceHash": "vt1-abc",
        "scriptRevision": 7,
        "scriptHash": "vs1-def",
    }


def test_matching_render_package_and_job_are_current():
    output = _output()
    assert render_package_revision_error(output) is None
    assert render_job_revision_error(output) is None


def test_newer_script_invalidates_old_render_package_and_job():
    output = _output()
    settings = json.loads(output["fields"]["Studio_Creative_Settings_JSON"])
    settings["visual_script"]["revision"] = 8
    settings["visual_script"]["script_hash"] = "vs1-new"
    output["fields"]["Studio_Creative_Settings_JSON"] = json.dumps(settings)
    assert "stale" in render_package_revision_error(output).lower()
    assert "stale" in render_job_revision_error(output).lower()


def test_newer_visual_trim_invalidates_old_render_package_and_job():
    output = _output()
    settings = json.loads(output["fields"]["Studio_Creative_Settings_JSON"])
    settings["visual_timeline"]["revision"] = 4
    settings["visual_timeline"]["sequence_hash"] = "vt1-new"
    output["fields"]["Studio_Creative_Settings_JSON"] = json.dumps(settings)
    assert render_package_revision_error(output)
    assert render_job_revision_error(output)


def test_legacy_render_without_revision_contract_remains_compatible():
    output = _output()
    output["fields"]["Creative_Render_Manifest_JSON"] = "{}"
    output["fields"]["Remotion_Props_JSON"] = "{}"
    assert render_package_revision_error(output) is None
    assert render_job_revision_error(output) is None
