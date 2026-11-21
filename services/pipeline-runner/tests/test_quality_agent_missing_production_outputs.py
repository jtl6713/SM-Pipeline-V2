from quality_agent.signatures import detect_missing_production_platform_outputs


def test_detects_missing_links_for_each_profile():
    for profile in ("Chicago", "LA", "NYC", "Miami"):
        result = detect_missing_production_platform_outputs(
            request_id="PR-test", profile=profile, request_status="Submitted",
            output_plan_status="Ready", expected_output_keys=["a", "b"],
            linked_output_keys=[], missing_or_dangling_keys=[],
            job_step="escalated", job_error="No Platform Outputs found for this Production Request",
        )
        assert result["missing_output_keys"] == ["a", "b"]
        assert result["auto_repair_safe"] is False
        assert result["profile"] == profile


def test_partial_and_dangling_links():
    result = detect_missing_production_platform_outputs(
        request_id="PR-test", profile="LA", request_status="Submitted",
        output_plan_status="Ready", expected_output_keys=["a", "b", "c"],
        linked_output_keys=["a", "b"], missing_or_dangling_keys=["b"],
    )
    assert result["missing_output_keys"] == ["b", "c"]
    assert result["linked_count"] == 1


def test_no_false_positive_for_complete_or_unready():
    base = dict(request_id="PR-test", profile="LA", request_status="Submitted",
                output_plan_status="Ready", expected_output_keys=["a"],
                linked_output_keys=["a"], missing_or_dangling_keys=[])
    assert detect_missing_production_platform_outputs(**base) is None
    assert detect_missing_production_platform_outputs(**{**base, "linked_output_keys": [], "output_plan_status": "Draft"}) is None
    assert detect_missing_production_platform_outputs(**{**base, "linked_output_keys": [], "request_status": "Promoted"}) is None
