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
    assert "Tap in and ride like a local." in body
    assert "#NYC" in body
    assert "#OMNY" in body
    assert "ORDERED DRAFT ASSETS" in body
    assert "MARK AS PUBLISHED" in body
    assert "https://media.chicagoshining.com/omny-01.jpg" in body
    assert "<div" not in body.casefold()
    assert "<p" not in body.casefold()
    assert "<br" not in body.casefold()
    assert "<a " not in body.casefold()
    assert "</" not in body.casefold()


def test_tiktok_handoff_caption_stops_at_five_hashtags():
    record = {
        "fields": {
            "Output_ID": 1304,
            "Output_Title": "OMNY Tap Tips",
            "Output_Caption": "Tap in and ride like a local.",
            "Output_Hashtags": "#NYC #OMNY #Subway #Transit #Local #Extra #More",
        }
    }
    body = handoff_email_text(record)
    assert "#NYC #OMNY #Subway #Transit #Local" in body
    assert "#Extra" not in body
    assert "#More" not in body


def test_ttd3_uses_plain_text_sender_not_html_sender():
    source = (Path(__file__).resolve().parents[1] / "ttd" / "ttd3.py").read_text(encoding="utf-8")
    assert "handoff_email_text(" in source
    assert "send_text(" in source
    assert 'result["email_format"] = "text/plain"' in source
    assert "handoff_email_html(" not in source
    assert "send_html(" not in source


def test_verified_full_video_handoff_promotes_complete_mp4_backup():
    from ttd.package import verified_full_video_backup_url
    source = (
        "https://media.chicagoshining.com/publish/platform-output-3222/"
        "1Jd4kNSGhr7OWsX_7o0jt2ONGqZ-ch2Vk.mp4"
    )
    record = {
        "fields": {
            "Output_ID": 3222,
            "Output_Title": "Sunrise at North Avenue Beach",
            "TikTok_Draft_Type": "Video",
            "Final_File_ID": "1Jd4kNSGhr7OWsX_7o0jt2ONGqZ-ch2Vk",
            "Publish_Asset_URL": source,
            "TikTok_Draft_Assets_JSON": '{"source_url":"' + source + '"}',
            "Output_Notes": (
                "TTD0 verified full public MP4 equals Drive master "
                "(28036741 bytes) at 2026-10-28 16:22."
            ),
        },
    }
    body = handoff_email_text(record)
    assert verified_full_video_backup_url(record) == source
    assert "COMPLETE VIDEO BACKUP" in body
    assert "DO NOT POST THAT DRAFT" in body
    assert source in body
    assert body.index("COMPLETE VIDEO BACKUP") < body.index("POSTING STEPS")
    assert "does not verify the playable clip duration" in body

    # A range probe, different Drive final, or mutable preview must never be
    # misrepresented as a verified backup.
    legacy = {"fields": dict(record["fields"])}
    legacy["fields"]["Output_Notes"] = "TTD0 validated the public video draft asset."
    assert verified_full_video_backup_url(legacy) == ""
    assert "COMPLETE VIDEO BACKUP" not in handoff_email_text(legacy)

    tampered = {"fields": dict(record["fields"])}
    tampered["fields"]["TikTok_Draft_Assets_JSON"] = (
        '{"source_url":"https://media.chicagoshining.com/studio/previews/x/current.mp4"}'
    )
    assert verified_full_video_backup_url(tampered) == ""

    other = {"fields": dict(record["fields"])}
    other["fields"]["Final_File_ID"] = "new-master"
    assert verified_full_video_backup_url(other) == ""
