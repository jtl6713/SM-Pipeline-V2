"""Static and hermetic safety contract for the one-job native-gallery prep lane."""
import ast
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[3] / "repair" / "scripts" / "incident-2670-native-gallery-prep.py"


def test_exact_ten_output_allowlist_and_one_job_governor():
    source = SCRIPT.read_text(encoding="utf-8")
    tree = ast.parse(source)
    output_assignment = next(
        node for node in tree.body
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "OUTPUTS" for t in node.targets)
    )
    allowlist = ast.literal_eval(output_assignment.value)
    assert len(allowlist) == 10
    assert sum(row[1] == "facebook" for row in allowlist.values()) == 7
    assert sum(row[1] == "instagram" for row in allowlist.values()) == 3
    assert sum(row[2] for row in allowlist.values()) == 60
    assert 'resource_slot("incident_2670_native_gallery_prep", limit=1)' in source


def test_no_parent_container_publish_or_hold_release_capability():
    source = SCRIPT.read_text(encoding="utf-8")
    for forbidden in (
        ".create_parent(", ".publish(", "media_publish(", '"Do_Not_Publish": False',
        '"Auto_Publish_Enabled": True', "create_unpublished_photo(", "publish_attached_media(",
    ):
        assert forbidden not in source
    assert '"parent_containers": 0' in source
    assert '"published_posts": 0' in source
    assert '"hold_releases": 0' in source


def test_ambiguous_instagram_child_is_never_replayed():
    source = SCRIPT.read_text(encoding="utf-8")
    assert '"IG_Child_Container_Status": "Creating"' in source
    assert "instagram_ambiguous_prior_child" in source
    assert '"IG_Child_Container_Status": "Reconcile Required"' in source


def test_all_output_guards_run_before_mutation():
    """Regression: late missing output cannot follow eight completed provider stages."""
    source = SCRIPT.read_text(encoding="utf-8")
    main_source = source.split("def main() -> int:", 1)[1]
    assert main_source.index("_preflight_all(client)") < main_source.index("with resource_slot(")
    assert "gallery_batch_preflight_count_mismatch" in source
    assert "gallery_batch_ambiguous_ig_child_reconcile" in source


def test_missing_ninth_gallery_aborts_global_read_only_preflight():
    """Execute the exact pure preflight body with a missing #10802 marker."""
    import pytest

    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    preflight = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_preflight_all"
    )
    outputs = {
        f"rec{i:014d}": (10000 + i, "facebook", 1)
        for i in range(1, 11)
    }
    observed = []

    class FakeClient:
        def get_record(self, table, record_id):
            observed.append(record_id)
            return {"id": record_id, "fields": {}}

    def check_hold(output, record_id, number):
        if number == 10009:
            raise RuntimeError("gallery_owner_authorization_missing:10009")

    namespace = {
        "AirtableClient": FakeClient,
        "OUTPUTS": outputs,
        "PLATFORM_OUTPUTS_TABLE": "platform_outputs",
        "_assert_held": check_hold,
        "_assert_slide_marker": lambda *args: None,
        "list_ready_slides": lambda *args, **kwargs: [{}],
        "list_final_slides": lambda *args: [{}],
        "field_str": lambda *args: "",
        "native_photo_preflight_reason": lambda *args: None,
    }
    exec(compile(ast.Module(body=[preflight], type_ignores=[]), str(SCRIPT), "exec"), namespace)
    with pytest.raises(RuntimeError, match="gallery_owner_authorization_missing:10009"):
        namespace["_preflight_all"](FakeClient())
    assert observed == list(outputs)[:9]


def test_gallery_graph_workflow_requires_explicit_operator_dispatch():
    workflow = (
        Path(__file__).resolve().parents[3]
        / ".github" / "workflows" / "incident-2670-native-gallery-review-restore.yml"
    ).read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "workflow_run:" not in workflow
    assert "RECOVERY_CONFIRMATION:" in workflow
    assert 'test "$RECOVERY_CONFIRMATION" = ' in workflow
    assert "PREPARE-HELD-GALLERIES" in workflow
