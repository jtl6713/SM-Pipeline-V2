from __future__ import annotations

from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import SMTP


def test_tiktok_handoff_mime_uses_single_8bit_html_entity():
    html = '<div><b>Profile:</b> LA — Los Angeles</div><p>TikTok accepted the asset package.</p>'
    message = EmailMessage(policy=SMTP)
    message["To"] = "chicagoshining@gmail.com"
    message["Subject"] = "TikTok Draft #1000 — LA — Ready in Inbox"
    message.set_content(html, subtype="html", charset="utf-8", cte="8bit")

    raw = message.as_bytes(policy=SMTP)
    parsed = BytesParser(policy=SMTP).parsebytes(raw)

    assert not parsed.is_multipart()
    assert parsed.get_content_type() == "text/html"
    assert parsed.get_content_charset() == "utf-8"
    assert parsed["Content-Transfer-Encoding"].lower() == "8bit"
    assert parsed.get_content().strip() == html
    assert b"multipart/alternative" not in raw
    assert b"boundary=" not in raw
    assert b"quoted-printable" not in raw
    assert b"PGRpdi" not in raw
    assert b"<div><b>Profile:</b>" in raw
    assert b"\r\n" in raw
    assert b"\n" not in raw.replace(b"\r\n", b"")


def test_tiktok_handoff_plain_text_mime_cannot_render_html_tags():
    text_body = (
        "TikTok draft delivered — manual action required\n\n"
        "Profile: NYC - New York City\n"
        "TikTok: @nyshining8\n\n"
        "Output #1304 — OMNY Tap Tips\n"
        "Mark as Published: https://pipeline.chicagoshining.com/hooks/ttd4\n"
    )
    message = EmailMessage(policy=SMTP)
    message["To"] = "chicagoshining@gmail.com"
    message["Subject"] = "TikTok Draft #1304 — NYC - New York City — Ready in Inbox - OMNY Tap Tips"
    message.set_content(text_body, subtype="plain", charset="utf-8", cte="8bit")

    raw = message.as_bytes(policy=SMTP)
    parsed = BytesParser(policy=SMTP).parsebytes(raw)

    assert not parsed.is_multipart()
    assert parsed.get_content_type() == "text/plain"
    assert parsed.get_content_charset() == "utf-8"
    assert parsed["Content-Transfer-Encoding"].lower() == "8bit"
    decoded = parsed.get_content()
    assert "Profile: NYC - New York City" in decoded
    assert "<div" not in decoded.casefold()
    assert "Content-Type: text/plain; charset=\"utf-8\"" in raw.decode("utf-8")
    assert b"\r\n" in raw
    assert b"\n" not in raw.replace(b"\r\n", b"")
