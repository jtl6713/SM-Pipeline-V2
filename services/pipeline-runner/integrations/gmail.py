from __future__ import annotations

import base64
from email.message import EmailMessage

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
        message = EmailMessage()
        message["To"] = to
        message["Subject"] = subject
        message.set_content("ChicagoShining review email — open in an HTML-capable client.")
        message.add_alternative(html_body, subtype="html")
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
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
