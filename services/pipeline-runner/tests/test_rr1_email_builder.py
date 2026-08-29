"""Tests for RR1 review email HTML builder."""

from rr1.email_builder import build_review_card, build_review_email_html, review_email_subject


def test_review_email_subject_includes_count():
    subject = review_email_subject(3)
    assert "3 outputs" in subject
    assert "ChicagoShining Outputs Ready for Review" in subject


def test_review_card_includes_decision_links():
    output = {
        "id": "recTEST123",
        "fields": {
            "Output_ID": "999",
            "Output_Title": "Test Output",
            "Platform": "Instagram",
            "Format": "Feed Post",
            "Platform_Output_Type": "Carousel",
            "Aspect_Ratio": "1:1",
            "Final_File_URL": "",
            "Selected_Review_Images_HTML": "<img src='https://example.com/a.jpg'>",
            "Thumbnail_URL": "https://example.com/thumb.jpg",
            "Output_Caption": "Hello",
            "Output_Hashtags": "#test",
            "Selected_Asset_Summary": "3 photos",
        },
    }
    card = build_review_card(
        output,
        decision_webhook_url="https://hook.example.com/decision",
    )
    assert "recTEST123" in card
    assert "decision=approved" in card
    assert "Output #999" in card
    assert "Download cover image" in card
    assert "https://example.com/thumb.jpg" in card
    assert 'alt="Output cover thumbnail"' in card


def test_thumbnail_download_url_normalizes_drive_links():
    from rr1.email_builder import thumbnail_download_url

    assert thumbnail_download_url(
        "https://drive.google.com/uc?id=1ABC_def-123&export=download"
    ) == "https://drive.google.com/uc?export=download&id=1ABC_def-123"
    assert thumbnail_download_url(
        "https://drive.google.com/file/d/1ABC_def-123/view"
    ) == "https://drive.google.com/uc?export=download&id=1ABC_def-123"
    cdn = "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover-9x16.png"
    assert thumbnail_download_url(cdn) == cdn
    assert thumbnail_download_url("") == ""


def test_review_card_notes_missing_thumbnail():
    output = {
        "id": "recTEST456",
        "fields": {
            "Output_ID": "1000",
            "Output_Title": "No Thumb",
            "Platform": "TikTok",
            "Format": "Vertical Short Video",
            "Platform_Output_Type": "TikTok Video",
            "Aspect_Ratio": "9:16",
        },
    }
    card = build_review_card(
        output,
        decision_webhook_url="https://hook.example.com/decision",
    )
    assert "Not set on this output" in card


def test_review_email_html_wraps_cards():
    html = build_review_email_html(["<div>card</div>"])
    assert "Total outputs:</b> 1" in html
    assert "<div>card</div>" in html
