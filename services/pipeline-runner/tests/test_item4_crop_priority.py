"""Crop-first SMV1 selection: Ready+Preview must not starve unfinished crops."""

from __future__ import annotations

from item4.constants import SMV1_PENDING_CROP_FORMULA
from item4.formulas import smv1_pending_crop_formula
from item4.processor import select_eligible_rows


class FakeClient:
    def __init__(self, responses: list[list[dict]]):
        self.responses = list(responses)
        self.formulas: list[str] = []

    def list_records(self, _table, formula="", max_records=40):
        self.formulas.append(formula)
        if not self.responses:
            return []
        return self.responses.pop(0)


def test_pending_crop_formula_excludes_preview_and_masters():
    assert 'Asset_Kind}="Platform Variant"' in SMV1_PENDING_CROP_FORMULA
    assert "Preview_Status" not in SMV1_PENDING_CROP_FORMULA
    assert "Master Original" not in SMV1_PENDING_CROP_FORMULA
    formula = smv1_pending_crop_formula("recTEST")
    assert 'Production_Request_Record_ID}="recTEST"' in formula
    assert SMV1_PENDING_CROP_FORMULA in formula


def test_select_eligible_rows_prefers_crops():
    crops = [{"id": "crop1", "fields": {"Asset_Kind": "Platform Variant", "Transfer_Status": "Pending"}}]
    client = FakeClient([crops])
    rows = select_eligible_rows(client, production_request_record_id="recPR", max_records=10)
    assert rows == crops
    assert len(client.formulas) == 1
    assert "Platform Variant" in client.formulas[0]
    assert "Preview_Status" not in client.formulas[0]


def test_select_eligible_rows_crops_only_skips_preview_fallback():
    client = FakeClient([[]])
    rows = select_eligible_rows(
        client,
        production_request_record_id="recPR",
        max_records=10,
        crops_only=True,
    )
    assert rows == []
    assert len(client.formulas) == 1  # no second full-eligibility query
