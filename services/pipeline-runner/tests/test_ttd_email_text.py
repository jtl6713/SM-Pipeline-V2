from __future__ import annotations

from pathlib import Path

from ttd.package import handoff_email_text


def test_tiktok_handoff_text_is_professional_and_contains_no_html_markup():
    record = {
        "fields": {
            "Output_ID": 1304,
            "Output_Title": "OMNY Tap Tips",
            "TikTok_Draft_Type": "Photo Carousel",
            "Image_Count": 6,
            "Output_Caption": "Tap in and ride like a local.",
            "Output_Hashtags": "#NYC #OMNY",
            "TikTok_Draft_Publish_ID": "p_inbox_url~v2.test",
            "TikTok_Manual_Completion_URL": "https://pipeline.chicagoshining.com/hooks/ttd4?record_id=rec123&action=form",
            "TikTok_Draft_Assets_JSON": [
                "https://media.chicagoshining.com/omny-01.jpg",
                "https://media.chicagoshining.com/omny-02.jpg",
            ],
        }
    }
    profile = {
        "fields": {
            "Profile_Name": "NYC - New York City",
            "TikTok_Handle": "nyshining8",
        }
    }

    body = handoff_email_text(record, profile=profile)

    assert "TikTok draft delivered — manual action required" in body
    assert "Profile: NYC - New York City" in body
    assert "TikTok: @nyshining8" in body
    assert "OUTPUT #1304 — OMNY Tap Tips" in body
    assert "CAPTION + HASHTAGS" in body
    assert "ORDERED DRAFT ASSETS" in body
    assert "MARK AS PUBLISHED" in body
    assert "https://media.chicagoshining.com/omny-01.jpg" in body
    assert "<div" not in body.casefold()
    assert "<p" not in body.casefold()
    assert "<br" not in body.casefold()
    assert "<a " not in body.casefold()
    assert "</" not in body.casefold()


def test_ttd3_uses_plain_text_sender_not_html_sender():
    source = (Path(__file__).resolve().parents[1] / "ttd" / "ttd3.py").read_text(encoding="utf-8")
    assert "handoff_email_text(" in source
    assert "send_text(" in source
    assert 'result["email_format"] = "text/plain"' in source
    assert "handoff_email_html(" not in source
    assert "send_html(" not in source
