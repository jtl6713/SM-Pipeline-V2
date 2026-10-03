from __future__ import annotations

import base64
from email.message import EmailMessage
from email.policy import SMTP
from email.parser import BytesParser

import requests

from config import load_settings

# TikTok inbox drafts need Gmail — operator pastes the public URL.
# PRIMARY OpenAI usage alerts are also allowlisted so Joseph sees unexpected spend.
PURPOSE_TIKTOK_HANDOFF = "ttd3_tiktok_handoff"
PURPOSE_PRIMARY_AI_USAGE = "primary_ai_usage"
ALLOWED_EMAIL_PURPOSES = frozenset({PURPOSE_TIKTOK_HANDOFF, PURPOSE_PRIMARY_AI_USAGE})


class GmailClient:
    """Send HTML email via Gmail API using the same OAuth refresh token as Drive."""

    def __init__(self) -> None:
        settings = load_settings()
        self._client_id = settings.get("google_client_id", "")
        self._client_secret = settings.get("google_client_secret", "")
        self._refresh_token = settings.get("google_refresh_token", "")
        self._access_token: str | None = None

    def _ensure_configured(self) -> None:
        if not all([self._client_id, self._client_secret, self._refresh_token]):
            raise RuntimeError(
                "Google credentials missing — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                "and GOOGLE_REFRESH_TOKEN (Gmail send scope) in .env"
            )

    def access_token(self) -> str:
        self._ensure_configured()
        if self._access_token:
            return self._access_token
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "refresh_token": self._refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=60,
        )
        response.raise_for_status()
        token = str(response.json().get("access_token") or "")
        if not token:
            raise RuntimeError("Google OAuth token response missing access_token")
        self._access_token = token
        return token

    def send_text(
        self,
        *,
        to: str,
        subject: str,
        text_body: str,
        purpose: str = "",
    ) -> dict:
        """Send a single-part UTF-8 plain-text message via Gmail API.

        TikTok handoff mail intentionally uses this path. Apple Mail has shown
        multiple failure modes when the operational handoff is delivered as HTML
        (raw multipart boundaries, literal inner base64, and literal HTML tags).
        Plain text keeps the message readable on every client while preserving
        full clickable URLs.
        """
        if purpose not in ALLOWED_EMAIL_PURPOSES:
            return {"id": None, "skipped": True, "reason": "email_disabled", "purpose": purpose}
        if purpose == PURPOSE_TIKTOK_HANDOFF:
            lowered = str(text_body or "").casefold()
            forbidden = ("<div", "<p", "<br", "<a ", "</")
            if any(marker in lowered for marker in forbidden):
                raise RuntimeError("TikTok handoff text body unexpectedly contains HTML markup")

        message = EmailMessage(policy=SMTP)
        message["To"] = to
        message["Subject"] = subject
        message.set_content(text_body, subtype="plain", charset="utf-8", cte="8bit")
        raw_bytes = message.as_bytes(policy=SMTP)
        parsed = BytesParser(policy=SMTP).parsebytes(raw_bytes)
        if parsed.is_multipart() or parsed.get_content_type() != "text/plain":
            raise RuntimeError(
                f"Malformed Gmail text envelope: top={parsed.get_content_type()} multipart={parsed.is_multipart()}"
            )
        if parsed.get_content_charset() != "utf-8":
            raise RuntimeError(
                f"Malformed Gmail text charset: {parsed.get_content_charset()}"
            )
        if parsed.get("Content-Transfer-Encoding", "").lower() != "8bit":
            raise RuntimeError(
                f"Malformed Gmail text transfer encoding: {parsed.get('Content-Transfer-Encoding')}"
            )
        if b"\n" in raw_bytes.replace(b"\r\n", b""):
            raise RuntimeError("Malformed Gmail text envelope: bare LF line endings remain")

        raw = base64.urlsafe_b64encode(raw_bytes).decode("ascii")
        token = self.access_token()
        response = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

    def send_html(
        self,
        *,
        to: str,
        subject: str,
        html_body: str,
        purpose: str = "",
    ) -> dict:
        if purpose not in ALLOWED_EMAIL_PURPOSES:
            return {"id": None, "skipped": True, "reason": "email_disabled", "purpose": purpose}
        message = EmailMessage(policy=SMTP)
        message["To"] = to
        message["Subject"] = subject
        # Send one HTML MIME entity rather than multipart/alternative. Some iOS/
        # IMAP paths have exposed multipart boundaries as literal body text.
        # Do not MIME-base64 encode the HTML part: iOS Mail has also been observed
        # exposing that inner base64 payload (for example "PGRpdi..." for "<div...")
        # instead of decoding it. The Gmail API already base64url-encodes the whole
        # RFC message for transport, so an 8bit UTF-8 HTML entity is sufficient.
        message.set_content(html_body, subtype="html", charset="utf-8", cte="8bit")
        raw_bytes = message.as_bytes(policy=SMTP)
        parsed = BytesParser(policy=SMTP).parsebytes(raw_bytes)
        if parsed.is_multipart() or parsed.get_content_type() != "text/html":
            raise RuntimeError(
                f"Malformed Gmail MIME envelope: top={parsed.get_content_type()} multipart={parsed.is_multipart()}"
            )
        if parsed.get_content_charset() != "utf-8":
            raise RuntimeError(
                f"Malformed Gmail MIME charset: {parsed.get_content_charset()}"
            )
        if parsed.get("Content-Transfer-Encoding", "").lower() != "8bit":
            raise RuntimeError(
                f"Malformed Gmail transfer encoding: {parsed.get('Content-Transfer-Encoding')}"
            )
        # SMTP policy guarantees RFC-compliant CRLF line endings. This matters for
        # Gmail Sent copies opened through iOS/IMAP clients, which can expose raw
        # multipart boundaries when LF-only message bodies are combined with Gmail's
        # CRLF-added transport headers.
        if b"\n" in raw_bytes.replace(b"\r\n", b""):
            raise RuntimeError("Malformed Gmail MIME envelope: bare LF line endings remain")
        raw = base64.urlsafe_b64encode(raw_bytes).decode("ascii")
        token = self.access_token()
        response = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
