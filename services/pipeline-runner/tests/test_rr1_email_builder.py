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


def test_review_email_html_wraps_cards():
    html = build_review_email_html(["<div>card</div>"])
    assert "Total outputs:</b> 1" in html
    assert "<div>card</div>" in html
