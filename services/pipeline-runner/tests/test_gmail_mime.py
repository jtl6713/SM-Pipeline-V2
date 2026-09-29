from __future__ import annotations

from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import SMTP


def test_tiktok_handoff_mime_uses_smtp_crlf_and_valid_alternative():
    message = EmailMessage(policy=SMTP)
    message["To"] = "chicagoshining@gmail.com"
    message["Subject"] = "TikTok Draft #989 — NYC — Ready in Inbox"
    message.set_content("ChicagoShining review email — open in an HTML-capable client.")
    message.add_alternative("<div><b>Profile:</b> NYC</div>", subtype="html")

    raw = message.as_bytes(policy=SMTP)
    parsed = BytesParser(policy=SMTP).parsebytes(raw)

    assert parsed.get_content_type() == "multipart/alternative"
    assert [part.get_content_type() for part in parsed.iter_parts()] == ["text/plain", "text/html"]
    assert b"\r\n" in raw
    assert b"\n" not in raw.replace(b"\r\n", b"")
    assert b"Content-Type: multipart/alternative;" in raw
