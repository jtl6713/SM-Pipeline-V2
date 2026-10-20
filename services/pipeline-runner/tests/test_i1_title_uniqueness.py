import pytest
from i1.processor import _title_key, _titles_equivalent, _year_title_formula, _title_used_in_last_year
from airtable.constants import CONTENT_ITEMS_TABLE, SOURCE_CANDIDATES_TABLE


def test_numbered_and_small_title_variations_rejected():
    base="Miami Or Miami Beach?"
    for text in ("Miami or Miami Beach 2","Miami Or Miami Beach (3)","Miami or Miami Beach #4","Miami or Miami Beach Part 2"):
        assert _title_key(base)==_title_key(text)
        assert _titles_equivalent(base,text)
    assert _title_key("Route 66") != _title_key("Route")
    assert _title_key("Chicago 2026") != _title_key("Chicago")


def test_year_formula_and_both_sources():
    f=_year_title_formula("Miami Or Miami Beach? 2","Candidate_Title","Create_Date")
    assert "miamiorm" in f
    assert 'DATEADD(TODAY(),-365,"days")' in f
    assert "CREATED_TIME()" in f
    class FakeClient:
        def __init__(self,existing):self.existing=existing
        def list_records(self,table_id,**kwargs):
            if table_id not in self.existing:return []
            field="Candidate_Title" if table_id==SOURCE_CANDIDATES_TABLE else "Content_Title"
            return [{"id":"recAAAAAAAAAAAAAA","fields":{field:"Miami Or Miami Beach? (3)"}}]
    for source in ({SOURCE_CANDIDATES_TABLE},{CONTENT_ITEMS_TABLE}):
        assert _title_used_in_last_year(FakeClient(source),"Miami Or Miami Beach? 2")
    assert not _title_used_in_last_year(FakeClient(set()),"Miami Or Miami Beach?")


def test_lookup_fails_closed():
    class BrokenClient:
        def list_records(self,*args,**kwargs):raise RuntimeError("Airtable unavailable")
    with pytest.raises(RuntimeError,match="unavailable"):
        _title_used_in_last_year(BrokenClient(),"Miami Or Miami Beach")
    class Truncated:
        def list_records(self,*args,**kwargs):
            return [{"fields":{"Candidate_Title":"different"}} for _ in range(1001)]
    with pytest.raises(RuntimeError,match="incomplete"):
        _title_used_in_last_year(Truncated(),"Miami Or Miami Beach")
