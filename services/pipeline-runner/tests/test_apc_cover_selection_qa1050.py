"""QA1050: the approved cover stays slide 1 even when C9 omits it."""
from apc import assets


def slide(n, *, cover=False, approved=True):
    return {"id": f"rec{n:014d}", "fields": {
        "Current Order": n, "Slide Number": n,
        "Is Cover": cover, "Approved For Final": approved,
        "IG_Public_Asset_Status": "Ready",
    }}


def test_c9_missing_cover_falls_back_to_unique_approved_public_ready_set(monkeypatch):
    c9 = [slide(n) for n in range(2, 12)]
    ready = [slide(1, cover=True)] + [slide(n) for n in range(2, 19)]
    monkeypatch.setattr(assets, "list_output_slides", lambda *a, **kw: c9)
    monkeypatch.setattr(assets, "list_ready_public_assets", lambda *a, **kw: ready)
    selected = assets.list_final_slides(object(), "1076")
    assert [assets.current_order(row) for row in selected] == list(range(1, 11))
    assert selected[0]["fields"]["Is Cover"] is True
    assert len(selected) == 10


def test_ambiguous_duplicate_cover_order_does_not_override_view(monkeypatch):
    c9 = [slide(n) for n in range(2, 12)]
    ready = [slide(1, cover=True), slide(1)] + [slide(n) for n in range(2, 19)]
    monkeypatch.setattr(assets, "list_output_slides", lambda *a, **kw: c9)
    monkeypatch.setattr(assets, "list_ready_public_assets", lambda *a, **kw: ready)
    selected = assets.list_final_slides(object(), "1076")
    assert selected == c9


def test_c9_cover_keeps_existing_canonical_order_without_public_lookup(monkeypatch):
    rows = [slide(1, cover=True)] + [slide(n) for n in range(2, 12)]
    monkeypatch.setattr(assets, "list_output_slides", lambda *a, **kw: rows)
    def not_needed(*a, **kw):
        raise AssertionError("no redundant scan")
    monkeypatch.setattr(assets, "list_ready_public_assets", not_needed)
    assert assets.list_final_slides(object(), "1023")[0]["fields"]["Is Cover"]
