import config


def test_same_day_stale_service_version_never_overrides_deployed_runner_code(monkeypatch):
    monkeypatch.setenv("SERVICE_VERSION", "2026-10-28-render-review-final-readback")
    assert config._resolve_service_version() == config.PIPELINE_RUNNER_CODE_VERSION


def test_prior_day_stale_service_version_never_overrides_deployed_runner_code(monkeypatch):
    monkeypatch.setenv("SERVICE_VERSION", "2026-10-27-old-runner")
    assert config._resolve_service_version() == config.PIPELINE_RUNNER_CODE_VERSION


def test_explicit_future_service_version_retains_existing_override_contract(monkeypatch):
    monkeypatch.setenv("SERVICE_VERSION", "2026-10-29-future-pinned-deploy")
    assert config._resolve_service_version() == "2026-10-29-future-pinned-deploy"
