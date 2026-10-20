from i1.processor import _title_used_in_last_year, _year_title_formula


def test_normalized_title_formula_uses_full_year():
    f = _year_title_formula("Miami Or Miami Beach?", "Candidate_Title", "Create_Date")
    assert "miamiormiamibeach" in f
    assert "DATEADD(TODAY(),-365,'days')" in f
    assert "{Test_Run_ID}=BLANK()" in f


def test_title_reused_in_candidates_or_promoted_content():
    class FakeClient:
        def __init__(self, existing):
            self.existing = existing
            self.tables = []

        def list_records(self, table_id, **kwargs):
            self.tables.append(table_id)
            return [{"id": "recAAAAAAAAAAAAAA"}] if table_id in self.existing else []

    from airtable.constants import CONTENT_ITEMS_TABLE, SOURCE_CANDIDATES_TABLE

    for existing in ({SOURCE_CANDIDATES_TABLE}, {CONTENT_ITEMS_TABLE}):
        client = FakeClient(existing)
        assert _title_used_in_last_year(client, "Miami Or Miami Beach?")
    client = FakeClient(set())
    assert not _title_used_in_last_year(client, "Miami Or Miami Beach?")


def test_title_lookup_fails_closed_on_api_error():
    class BrokenClient:
        def list_records(self, *args, **kwargs):
            raise RuntimeError("database unavailable")

    import pytest

    with pytest.raises(RuntimeError, match="database unavailable"):
        _title_used_in_last_year(BrokenClient(), "Miami Or Miami Beach?")
