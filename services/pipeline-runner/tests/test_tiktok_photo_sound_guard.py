from pathlib import Path

from ttd.package import form_html, handoff_email_text, tiktok_photo_sound_required


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_photo_posts_require_sound_but_video_drafts_do_not():
    assert tiktok_photo_sound_required(_record(TikTok_Draft_Type="Photo Carousel")) is True
    assert tiktok_photo_sound_required(_record(Platform_Output_Type="TikTok Slideshow")) is True
    assert tiktok_photo_sound_required(_record(TikTok_Draft_Type="Video")) is False


def test_photo_completion_form_requires_sound_confirmation():
    record = _record(
        Output_ID="1233",
        Output_Title="Disney Hall Curves",
        TikTok_Draft_Type="Photo Carousel",
        TikTok_Manual_Completion_Token="abc",
    )
    html = form_html(record, action_url="https://pipeline.chicagoshining.com/hooks/ttd4?action=submit")
    assert "Sound required for this photo post" in html
    assert 'name="music_completed" value="yes" required' in html
    assert "silent photo carousel" in html


def test_handoff_email_makes_photo_music_step_mandatory():
    body = handoff_email_text(
        _record(
            Output_ID="1233",
            Output_Title="Disney Hall Curves",
            TikTok_Draft_Type="Photo Carousel",
        )
    )
    assert "REQUIRED FOR PHOTO POSTS" in body
    assert "Do not publish this carousel silent." in body


def test_ttd4_server_side_guard_exists():
    source = (
        Path(__file__).resolve().parents[1] / "ttd" / "ttd4.py"
    ).read_text(encoding="utf-8")
    assert "tiktok_photo_sound_required(output)" in source
    assert '"photo_sound_required"' in source
    assert "Add sound before publishing" in source
