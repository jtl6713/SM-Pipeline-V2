"""Regression tests: incident #2670 optional side-effect outbox load."""
import supabase_pipeline as pipeline


def test_outbox_disabled_by_default(monkeypatch):
    monkeypatch.delenv("STUDIO_SIDE_EFFECT_OUTBOX_ENABLED", raising=False)
    monkeypatch.setattr(pipeline, "_OUTBOX_TABLE_MISSING", False)
    calls = []
    monkeypatch.setattr(pipeline, "_rest", lambda *args, **kwargs: calls.append((args, kwargs)))
    pipeline._enqueue_outbox({}, "queue", {"id": "rec123", "fields": {}}, "PATCH")
    assert calls == []


def test_missing_outbox_circuits_after_first_failure(monkeypatch):
    monkeypatch.setenv("STUDIO_SIDE_EFFECT_OUTBOX_ENABLED", "true")
    monkeypatch.setattr(pipeline, "_OUTBOX_TABLE_MISSING", False)
    calls = []

    def missing(*args, **kwargs):
        calls.append(args)
        raise RuntimeError("PGRST205: Could not find the table studio_side_effect_outbox")

    monkeypatch.setattr(pipeline, "_rest", missing)
    row = {"id": "rec123", "fields": {"Transfer_Status": "Pending"}}
    pipeline._enqueue_outbox({}, "queue", row, "PATCH")
    pipeline._enqueue_outbox({}, "queue", row, "PATCH")
    assert len(calls) == 1
    assert pipeline._OUTBOX_TABLE_MISSING is True


def test_explicit_opt_in_keeps_supported_outbox(monkeypatch):
    monkeypatch.setenv("STUDIO_SIDE_EFFECT_OUTBOX_ENABLED", "1")
    monkeypatch.setattr(pipeline, "_OUTBOX_TABLE_MISSING", False)
    calls = []
    monkeypatch.setattr(pipeline, "_rest", lambda *args, **kwargs: calls.append((args, kwargs)))
    pipeline._enqueue_outbox({}, "request", {"id": "rec123", "fields": {}}, "PATCH")
    assert len(calls) == 1
    assert calls[0][0][1] == "studio_side_effect_outbox"\n    assert calls[0][0][2] == "POST"
