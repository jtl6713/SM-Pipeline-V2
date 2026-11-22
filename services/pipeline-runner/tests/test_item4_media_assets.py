from item4.media_assets import classification_fields_from_source


def test_classification_copy_marks_classified_when_keywords_exist():
    copied = classification_fields_from_source(
        {
            "Search_Keywords": "navy pier, chicago",
            "Shot_Type": "Wide",
            "Visible_Subjects": "pier, lake",
            "Content_Profile": ["recProfile1"],
            "Asset Name": "Navy Pier 1",
        }
    )
    assert copied["Classification_Status"] == "Classified"
    assert copied["Search_Keywords"] == "navy pier, chicago"
    assert copied["Shot_Type"] == "Wide"
    assert copied["Content_Profile"] == ["recProfile1"]
    assert "Asset Name" not in copied


def test_classification_copy_needs_a3_when_source_has_no_tags():
    copied = classification_fields_from_source({"Asset Name": "Central Park from Above Day 2"})
    assert copied == {"Classification_Status": "Needs Classification"}
    assert classification_fields_from_source(None)["Classification_Status"] == "Needs Classification"


def test_transfer_lookup_uses_supabase_translatable_formula():
    from airtable.constants import MEDIA_ASSETS_TABLE
    from item4.media_assets import find_by_transfer_id
    from supabase_formula import formula_to_postgrest_filter

    class Client:
        def __init__(self):
            self.calls = []

        def list_records(self, table, **options):
            self.calls.append((table, options))
            return []

    client = Client()
    transfer_id = "ITEM4-VARIANT-fill-crop-v2-recZ9Yh5VCjGltC8V-62ee20247ff24429a1-9x16"
    assert find_by_transfer_id(client, transfer_id) is None
    table, options = client.calls[0]
    assert table == MEDIA_ASSETS_TABLE
    formula = options["formula"]
    assert formula == '{Studio_Transfer_ID}="' + transfer_id + '"'
    translated = formula_to_postgrest_filter(table, formula)
    assert translated is not None
    assert "metadata->>studio_transfer_id.eq." + transfer_id in translated
    # The old single-quoted literal must not silently fall back to Airtable.
    assert formula_to_postgrest_filter(
        table, "{Studio_Transfer_ID}='" + transfer_id + "'",
    ) is None
