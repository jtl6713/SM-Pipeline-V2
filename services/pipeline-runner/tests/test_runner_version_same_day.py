from datetime import date, timedelta

import config


def _code_day() -> date:
    return date.fromisoformat(config.PIPELINE_RUNNER_CODE_VERSION[:10])


def test_same_day_stale_service_version_never_overrides_deployed_runner_code(monkeypatch):
    monkeypatch.setenv("SERVICE_VERSION", f"{_code_day().isoformat()}-old-runner")
    assert config._resolve_service_version() == config.PIPELINE_RUNNER_CODE_VERSION


def test_prior_day_stale_service_version_never_overrides_deployed_runner_code(monkeypatch):
    prior = (_code_day() - timedelta(days=1)).isoformat()
    monkeypatch.setenv("SERVICE_VERSION", f"{prior}-old-runner")
    assert config._resolve_service_version() == config.PIPELINE_RUNNER_CODE_VERSION


def test_explicit_future_service_version_retains_existing_override_contract(monkeypatch):
    following = (_code_day() + timedelta(days=1)).isoformat()
    expected = f"{following}-future-pinned-deploy"
    monkeypatch.setenv("SERVICE_VERSION", expected)
    assert config._resolve_service_version() == expected
