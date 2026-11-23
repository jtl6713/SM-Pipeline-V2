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
