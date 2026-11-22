"""Issue #2637: complete canonical I1 title history, never legacy archive or truncated uniqueness."""
from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest

import supabase_reads
from airtable.constants import CONTENT_ITEMS_TABLE, SOURCE_CANDIDATES_TABLE
from i1.processor import _year_title_formula, _title_used_in_last_year


SETTINGS = {"supabase_url": "https://example.supabase.co", "supabase_service_role_key": "test-role"}


def _fake_rest(stores, paths, *, fail_page=None):
    def rest(settings, path, method="GET", **_kwargs):
        assert settings == SETTINGS and method == "GET"
        paths.append(path)
        table = path.split("?", 1)[0]
        args = parse_qs(urlsplit("https://local/" + path).query)
        assert "created_at" in args
        assert "order" in args and "airtable_record_id.asc" in args["order"][0]
        offset = int(args.get("offset", [0])[0])
        limit = int(args.get("limit", [500])[0])
        assert limit == 500
        if fail_page == (table, offset):
            raise ConnectionError("network interrupted")
        rows = list(stores.get(table, []))
        if table == "idea_candidates":
            # Reproduce the canonical JSON Test_Run_ID blank filter.
            assert "payload->>Test_Run_ID" in path
            rows = [r for r in rows if r.get("test_run_id") in (None, "")]
        if "updated_at" in args:
            rows = [r for r in rows if r.get("recent", False)]
        title_column = "candidate_title" if table == "idea_candidates" else "content_title"
        return [
            {"airtable_record_id": r["airtable_record_id"], title_column: r[title_column]}
            for r in rows[offset:offset + limit]
        ]
    return rest


def _row(n, name, *, candidate=True, test_run_id=None, recent=False):
    row = {
        "airtable_record_id": "rec" + str(n).zfill(14),
        ("candidate_title" if candidate else "content_title"): name,
        "test_run_id": test_run_id,
        "recent": recent,
    }
    return row


def _lookup(table, title, cache=None):
    candidate = table == SOURCE_CANDIDATES_TABLE
    field = "Candidate_Title" if candidate else "Content_Title"
    created = "Create_Date" if candidate else "Created_At"
    formula = _year_title_formula(title, field, created)
    return supabase_reads.try_list_i1_title_history(
        SETTINGS, table, formula, max_records=1001, fields=[field], cache=cache
    )


def test_exact_i1_formula_only_and_wrong_fields_deny(monkeypatch):
    assert supabase_reads._i1_title_formula_prefix(
        SOURCE_CANDIDATES_TABLE, _year_title_formula("Miami or Miami Beach", "Candidate_Title", "Create_Date")
    ) == ("Candidate_Title", "miamiorm")
    assert supabase_reads._i1_title_formula_prefix(
        CONTENT_ITEMS_TABLE, _year_title_formula("Chicago Rail", "Content_Title", "Created_At")
    ) == ("Content_Title", "chicagor")
    assert supabase_reads._i1_title_formula_prefix(SOURCE_CANDIDATES_TABLE, '{Candidate_Title}="x"') is None
    monkeypatch.setattr(supabase_reads, "_rest", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("unexpected read")))
    assert supabase_reads.try_list_i1_title_history(
        SETTINGS, SOURCE_CANDIDATES_TABLE, '{Candidate_Title}="x"',
        max_records=1001, fields=["Candidate_Title"],
    ) is None
    assert supabase_reads.try_list_i1_title_history(
        SETTINGS, SOURCE_CANDIDATES_TABLE,
        _year_title_formula("Chicago", "Candidate_Title", "Create_Date"),
        max_records=1001, fields=["Idea_Summary"],
    ) is None


def test_full_scan_crosses_500_row_boundary_and_skips_test_candidates(monkeypatch):
    names = [_row(n, "Different Topic") for n in range(500)]
    names.append(_row(500, "Miami--Or Miami Beach (3)"))
    names.append(_row(501, "Miami or Miami Beach TEST", test_run_id="test-run"))
    paths = []
    monkeypatch.setattr(supabase_reads, "_rest", _fake_rest({"idea_candidates": names}, paths))
    rows = _lookup(SOURCE_CANDIDATES_TABLE, "Miami Or Miami Beach?")
    assert len(rows) == 1 and rows[0]["id"] == "rec00000000000500"
    assert len(paths) == 2 and "offset=500" in paths[-1]
    assert all("select=airtable_record_id,candidate_title" in p for p in paths)


def test_content_titles_and_client_gate_use_canonical_history(monkeypatch):
    from airtable.client import AirtableClient

    paths = []
    stores = {
        "idea_candidates": [],
        "content_items": [_row(4, "Gold-Dome Detail", candidate=False)],
    }
    monkeypatch.setattr(supabase_reads, "_rest", _fake_rest(stores, paths))
    client = AirtableClient(SETTINGS)
    assert _title_used_in_last_year(client, "Gold Dome Detail") is True
    assert all("supabase.co" not in p for p in paths)
    assert any(p.startswith("content_items?") for p in paths)


def test_snapshot_queries_a_fresh_delta_before_claiming_unique(monkeypatch):
    stores = {"idea_candidates": [_row(1, "Old Title")]}
    paths = []
    monkeypatch.setattr(supabase_reads, "_rest", _fake_rest(stores, paths))
    cache = {}
    assert _lookup(SOURCE_CANDIDATES_TABLE, "New Topic", cache) == []
    stores["idea_candidates"].append(_row(2, "New Topic!", recent=True))
    assert len(_lookup(SOURCE_CANDIDATES_TABLE, "New Topic", cache)) == 1
    assert any("updated_at=gte." in p for p in paths)


def test_unavailable_second_page_fails_closed_not_empty(monkeypatch):
    stores = {"idea_candidates": [_row(n, "Unrelated") for n in range(501)]}
    paths = []
    monkeypatch.setattr(supabase_reads, "_rest", _fake_rest(stores, paths, fail_page=("idea_candidates", 500)))
    with pytest.raises(RuntimeError, match="Incomplete canonical Supabase I1 title history"):
        _lookup(SOURCE_CANDIDATES_TABLE, "New Title")


def test_more_than_1000_matches_must_trigger_original_truncation_guard(monkeypatch):
    stores = {"idea_candidates": [_row(n, "Miami Skyline " + str(n)) for n in range(1100)]}
    monkeypatch.setattr(supabase_reads, "_rest", _fake_rest(stores, []))
    class Client:
        def list_records(self, table, **kwargs):
            return supabase_reads.try_list_i1_title_history(
                SETTINGS, table, kwargs.get("formula"),
                max_records=kwargs["max_records"], fields=kwargs["fields"],
            )
    with pytest.raises(RuntimeError, match="Title history incomplete"):
        _title_used_in_last_year(Client(), "Miami Skyline")


def test_malformed_response_fails_closed(monkeypatch):
    monkeypatch.setattr(supabase_reads, "_rest", lambda *_a, **_k: [{"candidate_title": "no identity"}])
    with pytest.raises(RuntimeError, match="Invalid canonical Supabase I1 title history"):
        _lookup(SOURCE_CANDIDATES_TABLE, "New Title")
