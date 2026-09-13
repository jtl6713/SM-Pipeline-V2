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
